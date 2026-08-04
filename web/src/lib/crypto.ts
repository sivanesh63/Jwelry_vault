/**
 * Client-side encryption for the vault.
 *
 * Everything sensitive is sealed here, in the browser, before it goes anywhere.
 * Supabase stores bytes it cannot read. This is the only layer that makes that
 * true, so it is deliberately small, dependency-free and boring: nothing but
 * WebCrypto primitives that ship in every browser.
 *
 * No library. Not because bundle size matters, but because a cryptography
 * dependency is a supply-chain hole pointed directly at the family key, and
 * `crypto.subtle` is already audited by four browser vendors.
 *
 *
 * KEY HIERARCHY  (mirrors supabase/migrations/0006_encryption.sql)
 *
 *   passphrase ──PBKDF2──▶ KEK ──unwraps──▶ member private key (ECDH P-256)
 *                                                  │
 *   family key (AES-256-GCM) ◀──ECDH unwrap────────┘
 *        │
 *        ├──seals──▶ every `enc` column
 *        ├──seals──▶ every photo and document, before upload
 *        │
 *        ├──wrapped to each member's public key   → member_keys
 *        ├──wrapped to PIN + device secret        → member_devices
 *        └──wrapped to the printed recovery key   → family_keys
 *
 * The family key is generated once, in one browser, and never leaves one. It is
 * held in memory only — never localStorage, never IndexedDB, never a cookie.
 *
 *
 * ENVELOPE
 *
 *   [1 byte version = 0x01][12 byte IV][ciphertext || 16 byte GCM tag]
 *
 * Every envelope is bound to where it lives via GCM's additional authenticated
 * data — see `seal`. That is what stops someone with write access to the
 * database from moving one row's ciphertext onto another row.
 */

/**
 * Every byte array here is ArrayBuffer-backed.
 *
 * TypeScript 5.7 made Uint8Array generic over its buffer kind, so a bare
 * `Uint8Array` widens to `Uint8Array<ArrayBufferLike>` — which admits
 * SharedArrayBuffer and therefore is not a `BufferSource`. Every WebCrypto
 * call would be rejected at compile time.
 *
 * Naming the concrete type once keeps that out of the call sites. The other
 * fix — copying each array on the way in — would scatter extra copies of key
 * material through memory for no benefit.
 */
export type Bytes = Uint8Array<ArrayBuffer>;

const VERSION = 0x01;
const IV_BYTES = 12; // 96 bits, the size AES-GCM is actually designed for
const MIN_ITERATIONS = 600_000; // OWASP floor for PBKDF2-HMAC-SHA256, 2023
const PBKDF2_ITERATIONS = 600_000;

/** Opaque handle to the family key. Never serialise this. */
export type VaultKey = { readonly key: CryptoKey; readonly version: number };

/** What one member's enrolment produces. All of it is safe to send. */
export interface MemberEnrolment {
  publicKey: Bytes;
  wrappedPrivateKey: Bytes;
  passphraseSalt: Bytes;
  iterations: number;
}

export interface WrappedForMember {
  wrapped: Bytes;
  ephemeralPublic: Bytes;
}

export interface WrappedForDevice {
  wrapped: Bytes;
  pinSalt: Bytes;
  iterations: number;
}

export interface RecoveryEnrolment {
  /** Show this to the human exactly once, then forget it. */
  printedKey: string;
  wrapped: Bytes;
  salt: Bytes;
  iterations: number;
}

// ------------------------------------------------------------- primitives ---

const subtle = (): SubtleCrypto => {
  // Every browser we target has this; the check exists so the failure is a
  // sentence rather than "cannot read property encrypt of undefined". It also
  // catches the real-world case of the app being served over plain http, where
  // crypto.subtle is simply absent.
  if (typeof crypto === "undefined" || !crypto.subtle) {
    throw new Error(
      "Web Crypto is unavailable. The vault only works over HTTPS or on localhost.",
    );
  }
  return crypto.subtle;
};

function randomBytes(n: number): Bytes {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return b;
}

function concat(...parts: Bytes[]): Bytes {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

// No constant-time comparison helper here, deliberately. Nothing in this file
// compares secrets by hand: AES-GCM authenticates its own tag in constant time
// inside the browser, and every "is this right" question — wrong PIN, wrong
// passphrase, wrong recovery key — is answered by a decrypt that either works
// or throws. A hand-written comparison would be a place to get timing wrong for
// no gain.

// ------------------------------------------------------------- envelopes ----

/**
 * Seals a JSON-serialisable value.
 *
 * `aad` binds the ciphertext to its home — pass `"jewelry:<row id>"` and the
 * envelope will only open when presented with that same label. An attacker
 * holding the service_role key can still delete rows, but cannot take the
 * envelope off a cheap earring and paste it onto a heavy necklace, and cannot
 * move one family's blob into another family's row. Both are silent attacks
 * that authentication of the ciphertext alone would not catch.
 *
 * This means the row id has to exist before the seal, so the client generates
 * uuids rather than letting Postgres default them.
 */
export async function seal(
  vault: VaultKey,
  value: unknown,
  aad: string,
): Promise<Bytes> {
  return sealBytes(vault, new TextEncoder().encode(JSON.stringify(value)), aad);
}

export async function open<T>(
  vault: VaultKey,
  envelope: Bytes | null | undefined,
  aad: string,
): Promise<T | null> {
  const plain = await openBytes(vault, envelope, aad);
  if (plain === null) return null;
  return JSON.parse(new TextDecoder().decode(plain)) as T;
}

/** The same envelope for raw bytes — photos, PDFs, the nightly backup. */
export async function sealBytes(
  vault: VaultKey,
  plaintext: Bytes,
  aad: string,
): Promise<Bytes> {
  const iv = randomBytes(IV_BYTES);
  const ct = new Uint8Array(
    await subtle().encrypt(
      { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(aad) },
      vault.key,
      plaintext,
    ),
  );
  return concat(new Uint8Array([VERSION]), iv, ct);
}

export async function openBytes(
  vault: VaultKey,
  envelope: Bytes | null | undefined,
  aad: string,
): Promise<Bytes | null> {
  // A null column is a row written before its details were filled in, not an
  // error. Callers treat it as an empty record.
  if (!envelope || envelope.length === 0) return null;
  if (envelope.length < 1 + IV_BYTES + 16) {
    throw new Error("Corrupt envelope: too short to be one");
  }
  if (envelope[0] !== VERSION) {
    throw new Error(
      `Envelope version ${envelope[0]} is newer than this app understands. Update the app.`,
    );
  }
  const iv = envelope.subarray(1, 1 + IV_BYTES);
  const ct = envelope.subarray(1 + IV_BYTES);
  try {
    return new Uint8Array(
      await subtle().decrypt(
        { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(aad) },
        vault.key,
        ct,
      ),
    );
  } catch {
    // GCM refuses to say why. Either the key is wrong, the bytes were altered,
    // or the row was moved — all of which mean the same thing to the caller.
    throw new Error("Could not decrypt. Wrong key, or the data was tampered with.");
  }
}

/**
 * The label that binds an envelope to the row it belongs to.
 *
 * Defined once so a writer and a reader cannot disagree about it — they would
 * only find out at decrypt time, as an indistinguishable "wrong key" error.
 */
export function aadFor(table: string, id: string): string {
  return `${table}:${id}`;
}

// ------------------------------------------------------------ family key ----

/** Generated once per family, at bootstrap, and never again unless rotated. */
export async function generateFamilyKey(version = 1): Promise<VaultKey> {
  const key = await subtle().generateKey({ name: "AES-GCM", length: 256 }, true, [
    "encrypt",
    "decrypt",
  ]);
  return { key, version };
}

async function exportFamilyKey(vault: VaultKey): Promise<Bytes> {
  return new Uint8Array(await subtle().exportKey("raw", vault.key));
}

async function importFamilyKey(raw: Bytes, version: number): Promise<VaultKey> {
  const key = await subtle().importKey("raw", raw, { name: "AES-GCM" }, true, [
    "encrypt",
    "decrypt",
  ]);
  return { key, version };
}

// ------------------------------------------------------------- passphrase ---

async function deriveKek(
  passphrase: string,
  salt: Bytes,
  iterations: number,
): Promise<CryptoKey> {
  if (iterations < MIN_ITERATIONS) {
    // Refused rather than clamped: a caller passing a low number has a bug, and
    // silently fixing it would hide the bug while leaving weak blobs in the
    // database from before the fix.
    throw new Error(`Refusing fewer than ${MIN_ITERATIONS} KDF iterations`);
  }
  const material = await subtle().importKey(
    "raw",
    new TextEncoder().encode(passphrase.normalize("NFKC")),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return subtle().deriveKey(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/**
 * Sets up one member: an ECDH keypair whose private half is sealed under their
 * passphrase.
 *
 * The wrapped private key is fetchable by its owner with a valid session, which
 * means a stolen session plus an offline attack on the passphrase is the real
 * threat here — not the PIN, which is separately rate-limited. That is exactly
 * why the passphrase must be a long one and the PIN exists so nobody is tempted
 * to shorten it.
 */
export async function enrolMember(passphrase: string): Promise<MemberEnrolment> {
  const pair = await subtle().generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
    "deriveBits",
  ]);
  const passphraseSalt = randomBytes(16);
  const kek = await deriveKek(passphrase, passphraseSalt, PBKDF2_ITERATIONS);

  const pkcs8 = new Uint8Array(await subtle().exportKey("pkcs8", pair.privateKey));
  const iv = randomBytes(IV_BYTES);
  const wrapped = new Uint8Array(
    await subtle().encrypt({ name: "AES-GCM", iv }, kek, pkcs8),
  );

  return {
    publicKey: new Uint8Array(await subtle().exportKey("spki", pair.publicKey)),
    wrappedPrivateKey: concat(new Uint8Array([VERSION]), iv, wrapped),
    passphraseSalt,
    iterations: PBKDF2_ITERATIONS,
  };
}

async function unwrapPrivateKey(
  passphrase: string,
  enrolment: Pick<MemberEnrolment, "wrappedPrivateKey" | "passphraseSalt" | "iterations">,
): Promise<CryptoKey> {
  const kek = await deriveKek(passphrase, enrolment.passphraseSalt, enrolment.iterations);
  const blob = enrolment.wrappedPrivateKey;
  const iv = blob.subarray(1, 1 + IV_BYTES);
  const ct = blob.subarray(1 + IV_BYTES);
  let pkcs8: ArrayBuffer;
  try {
    pkcs8 = await subtle().decrypt({ name: "AES-GCM", iv }, kek, ct);
  } catch {
    throw new Error("Wrong passphrase");
  }
  return subtle().importKey("pkcs8", pkcs8, { name: "ECDH", namedCurve: "P-256" }, false, [
    "deriveBits",
  ]);
}

// ------------------------------------------------- wrapping between people ---

/**
 * ECDH shared secret, run through HKDF.
 *
 * HKDF rather than using the raw ECDH output as a key: the raw output is a
 * curve point with structure, not uniform bytes, and the `info` label keeps a
 * key derived here from ever colliding with one derived for the device wrap.
 */
async function ecdhKey(
  priv: CryptoKey,
  pub: CryptoKey,
  info: string,
): Promise<CryptoKey> {
  const shared = await subtle().deriveBits({ name: "ECDH", public: pub }, priv, 256);
  const hkdf = await subtle().importKey("raw", shared, "HKDF", false, ["deriveKey"]);
  return subtle().deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(0),
      info: new TextEncoder().encode(info),
    },
    hkdf,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/**
 * Seals the family key so one specific member can open it.
 *
 * Ephemeral sender keypair, so admitting the same person twice produces two
 * unrelated ciphertexts, and so nothing about the admitting admin's own key is
 * reused. This is what lets an invite happen without anyone speaking a
 * passphrase aloud.
 */
export async function wrapFamilyKeyFor(
  vault: VaultKey,
  memberPublicKey: Bytes,
): Promise<WrappedForMember> {
  const pub = await subtle().importKey(
    "spki",
    memberPublicKey,
    { name: "ECDH", namedCurve: "P-256" },
    true,
    [],
  );
  const eph = await subtle().generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
    "deriveBits",
  ]);
  const kek = await ecdhKey(eph.privateKey, pub, "jv:member-wrap:v1");

  const iv = randomBytes(IV_BYTES);
  const ct = new Uint8Array(
    await subtle().encrypt({ name: "AES-GCM", iv }, kek, await exportFamilyKey(vault)),
  );

  return {
    wrapped: concat(new Uint8Array([VERSION]), iv, ct),
    ephemeralPublic: new Uint8Array(await subtle().exportKey("spki", eph.publicKey)),
  };
}

/** The passphrase path: unlock on a new device, or after clearing site data. */
export async function unlockWithPassphrase(
  passphrase: string,
  enrolment: Pick<MemberEnrolment, "wrappedPrivateKey" | "passphraseSalt" | "iterations">,
  wrap: WrappedForMember,
  version = 1,
): Promise<VaultKey> {
  const priv = await unwrapPrivateKey(passphrase, enrolment);
  const eph = await subtle().importKey(
    "spki",
    wrap.ephemeralPublic,
    { name: "ECDH", namedCurve: "P-256" },
    true,
    [],
  );
  const kek = await ecdhKey(priv, eph, "jv:member-wrap:v1");
  const iv = wrap.wrapped.subarray(1, 1 + IV_BYTES);
  const ct = wrap.wrapped.subarray(1 + IV_BYTES);
  let raw: ArrayBuffer;
  try {
    raw = await subtle().decrypt({ name: "AES-GCM", iv }, kek, ct);
  } catch {
    throw new Error("This device could not open the vault key. Ask an admin to re-admit you.");
  }
  return importFamilyKey(new Uint8Array(raw), version);
}

// ---------------------------------------------------------- device + PIN ----
//
// A six-digit PIN is a million guesses. On its own that is indefensible, so it
// is never on its own:
//
//   1. The wrapped key lives on the server with no select policy. Reaching it
//      means calling begin_device_unlock, which charges an attempt whether or
//      not the caller comes back — five wrong locks for fifteen minutes, ten
//      destroys the enrolment. Ten guesses out of a million.
//   2. Unwrapping also needs the device secret below, which lives in a
//      non-extractable WebCrypto key in IndexedDB. `extractable: false` means
//      the browser will not hand the bytes back to JavaScript at all. Copying
//      the phone's storage off the device does not copy a key that was never
//      exportable.
//
// Someone holding an unlocked phone with a live session still gets ten tries.
// That is the honest limit of a PIN, and it is why the passphrase still exists.

const DB_NAME = "jv-keys";
const STORE = "device";
const DEVICE_KEY_ID = "device-secret-v1";

// Which member_devices row this browser enrolled.
//
// Kept beside the device secret rather than in localStorage on purpose: the two
// are only meaningful together. An id without its secret points at an enrolment
// this browser cannot open, and offering a PIN box for it would burn attempts
// against a *different* device's counter — five of those and the family
// member's actual phone is locked out for fifteen minutes by somebody typing on
// a laptop. Clearing one clears the other.
const DEVICE_ENROLMENT_ID = "device-enrolment-v1";

function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB unavailable"));
  });
}

function idbGet<T>(db: IDBDatabase, key: string): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

function idbPut(db: IDBDatabase, key: string, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * A stable per-device secret that JavaScript can use but never read.
 *
 * The HMAC key is generated non-extractable and stored as a CryptoKey — the
 * browser keeps the bytes on its side of the boundary. Signing a fixed label
 * gives a deterministic 32 bytes to mix into the PIN wrap.
 */
async function deviceSecret(): Promise<Bytes> {
  const db = await idb();
  let key = await idbGet<CryptoKey>(db, DEVICE_KEY_ID);
  if (!key) {
    key = await subtle().generateKey({ name: "HMAC", hash: "SHA-256", length: 256 }, false, [
      "sign",
    ]);
    await idbPut(db, DEVICE_KEY_ID, key);
  }
  const mac = await subtle().sign(
    "HMAC",
    key,
    new TextEncoder().encode("jv:device-secret:v1"),
  );
  return new Uint8Array(mac);
}

/**
 * The member_devices row this browser enrolled, if any.
 *
 * Null on a device that has never set a PIN here — including one where another
 * device in the family has. Enrolments are not shared: the wrapped key is
 * bound to a secret that never leaves the browser that made it.
 */
export async function rememberedDeviceId(): Promise<string | null> {
  try {
    const db = await idb();
    return (await idbGet<string>(db, DEVICE_ENROLMENT_ID)) ?? null;
  } catch {
    // Private browsing, or IndexedDB disabled. Not an error worth surfacing —
    // it just means no PIN here, and the passphrase still works.
    return null;
  }
}

export async function rememberDeviceId(id: string): Promise<void> {
  const db = await idb();
  await idbPut(db, DEVICE_ENROLMENT_ID, id);
}

/** Wipes the device secret, which makes every PIN enrolment here undecryptable. */
export async function forgetDevice(): Promise<void> {
  const db = await idb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(DEVICE_KEY_ID);
    tx.objectStore(STORE).delete(DEVICE_ENROLMENT_ID);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function pinKey(
  pin: string,
  salt: Bytes,
  iterations: number,
): Promise<CryptoKey> {
  if (!/^\d{6}$/.test(pin)) throw new Error("The PIN must be exactly six digits");
  if (iterations < MIN_ITERATIONS) {
    throw new Error(`Refusing fewer than ${MIN_ITERATIONS} KDF iterations`);
  }

  const material = await subtle().importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, [
    "deriveBits",
  ]);
  const stretched = new Uint8Array(
    await subtle().deriveBits(
      { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
      material,
      256,
    ),
  );

  // Both halves feed HKDF, so neither the PIN alone nor the device alone
  // produces the wrapping key.
  const hkdf = await subtle().importKey(
    "raw",
    concat(await deviceSecret(), stretched),
    "HKDF",
    false,
    ["deriveKey"],
  );
  return subtle().deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt,
      info: new TextEncoder().encode("jv:device-wrap:v1"),
    },
    hkdf,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function wrapForDevice(vault: VaultKey, pin: string): Promise<WrappedForDevice> {
  const pinSalt = randomBytes(16);
  const kek = await pinKey(pin, pinSalt, PBKDF2_ITERATIONS);
  const iv = randomBytes(IV_BYTES);
  const ct = new Uint8Array(
    await subtle().encrypt({ name: "AES-GCM", iv }, kek, await exportFamilyKey(vault)),
  );
  return {
    wrapped: concat(new Uint8Array([VERSION]), iv, ct),
    pinSalt,
    iterations: PBKDF2_ITERATIONS,
  };
}

/**
 * Only ever call this with a blob from begin_device_unlock, so the failed
 * attempt is already recorded server-side. On success the caller must call
 * complete_device_unlock to clear the counter.
 */
export async function unlockWithPin(
  pin: string,
  wrap: WrappedForDevice,
  version = 1,
): Promise<VaultKey> {
  const kek = await pinKey(pin, wrap.pinSalt, wrap.iterations);
  const iv = wrap.wrapped.subarray(1, 1 + IV_BYTES);
  const ct = wrap.wrapped.subarray(1 + IV_BYTES);
  let raw: ArrayBuffer;
  try {
    raw = await subtle().decrypt({ name: "AES-GCM", iv }, kek, ct);
  } catch {
    throw new Error("Wrong PIN");
  }
  return importFamilyKey(new Uint8Array(raw), version);
}

// --------------------------------------------------------------- recovery ---
//
// The printed key is the answer to "what if everyone forgets". It is generated
// once, shown once, and belongs on paper in the physical locker — which is both
// genuinely the right threat model and pleasingly appropriate.
//
// Crockford base32: no I, L, O or U, so a handwritten 1/I or 0/O cannot be
// misread, and nothing accidentally spells a word.

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function toBase32(bytes: Bytes): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

/** Undoes the human-friendliness: case, dashes, spaces, and O/0, I/1, L/1. */
export function normaliseRecoveryKey(input: string): string {
  return input
    .toUpperCase()
    .replace(/[\s-]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1")
    .replace(/U/g, "V");
}

/**
 * 20 random bytes — 160 bits — as eight groups of four.
 *
 * Far beyond brute force, which matters because unlike the PIN there is nothing
 * rate-limiting an attacker who has both the database and a printed key they
 * are guessing at.
 */
export async function enrolRecovery(vault: VaultKey): Promise<RecoveryEnrolment> {
  const secret = randomBytes(20);
  const printedKey = (toBase32(secret).match(/.{1,4}/g) ?? []).join("-");

  const salt = randomBytes(16);
  const kek = await deriveKek(normaliseRecoveryKey(printedKey), salt, PBKDF2_ITERATIONS);
  const iv = randomBytes(IV_BYTES);
  const ct = new Uint8Array(
    await subtle().encrypt({ name: "AES-GCM", iv }, kek, await exportFamilyKey(vault)),
  );

  return {
    printedKey,
    wrapped: concat(new Uint8Array([VERSION]), iv, ct),
    salt,
    iterations: PBKDF2_ITERATIONS,
  };
}

export async function unlockWithRecoveryKey(
  printedKey: string,
  stored: Pick<RecoveryEnrolment, "wrapped" | "salt" | "iterations">,
  version = 1,
): Promise<VaultKey> {
  const kek = await deriveKek(
    normaliseRecoveryKey(printedKey),
    stored.salt,
    stored.iterations,
  );
  const iv = stored.wrapped.subarray(1, 1 + IV_BYTES);
  const ct = stored.wrapped.subarray(1 + IV_BYTES);
  let raw: ArrayBuffer;
  try {
    raw = await subtle().decrypt({ name: "AES-GCM", iv }, kek, ct);
  } catch {
    throw new Error("That recovery key does not open this vault");
  }
  return importFamilyKey(new Uint8Array(raw), version);
}

// ------------------------------------------------------------ bytea wire ----
//
// PostgREST renders bytea as the Postgres hex literal `\x48656c6c6f` and
// accepts the same on the way in. Getting this wrong is silent — the bytes go
// in as the ASCII of the word "\x48..." and only fail much later, at decrypt —
// so both directions live here rather than being written out at call sites.

export function toPgBytea(bytes: Bytes): string {
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return `\\x${hex}`;
}

export function fromPgBytea(value: string | null | undefined): Bytes | null {
  if (!value) return null;
  const hex = value.startsWith("\\x") ? value.slice(2) : value;
  if (hex.length % 2 !== 0) throw new Error("Malformed bytea from the database");
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(hex.substr(i * 2, 2), 16);
  }
  return out;
}
