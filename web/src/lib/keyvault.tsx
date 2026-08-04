"use client";

/**
 * The key's life, from sign-in to auto-lock.
 *
 * Everything about *having* the family key lives here; everything about *using*
 * it lives in store.tsx. Keeping them apart matters because this file has one
 * rule that must never be bent anywhere else:
 *
 *   THE FAMILY KEY IS NEVER WRITTEN DOWN.
 *
 * Not localStorage, not sessionStorage, not IndexedDB, not a cookie. It lives
 * in component state for as long as the vault is open, and closing the tab
 * forgets it. The wrapped copies on the server are how it comes back.
 *
 * Component state, specifically — not a ref. A ref is no more private than
 * state; both sit in the same fiber tree and neither is hidden from anything
 * that can already run JavaScript on the page. What actually protects the key
 * is that it is never serialised anywhere, and that idle time clears it.
 *
 *
 * THE STATES, AND WHY THERE ARE SO MANY
 *
 *   signed-out          no Supabase session
 *   no-family           signed in, but no members row — the founder's first run
 *   needs-enrolment     a member with no keypair; they choose a passphrase
 *   awaiting-admission  keypair uploaded, but no admin has granted the key yet
 *   locked              everything exists; the key is not in memory
 *   unlocked            the key is in memory
 *
 * `awaiting-admission` is the one that looks redundant and is not. Without it,
 * an invited member who signs in before an admin has admitted them sees an
 * empty vault and assumes the app is broken. It is the same failure 0005_auth
 * exists to prevent, one layer up.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  enrolMember,
  enrolRecovery,
  forgetDevice,
  generateFamilyKey,
  rememberDeviceId,
  rememberedDeviceId,
  seal,
  unlockWithPassphrase,
  unlockWithPin,
  unlockWithRecoveryKey,
  wrapFamilyKeyFor,
  wrapForDevice,
  aadFor,
  type Bytes,
  type VaultKey,
} from "./crypto";
import {
  decodeBytea,
  describeConnectionFailure,
  getSupabase,
  isConfigured,
  rpc,
  toPg,
} from "./supabase";

/** Idle minutes before the key is dropped. Short on purpose. */
const AUTO_LOCK_MS = 5 * 60 * 1000;

export type VaultStatus =
  | "loading"
  | "signed-out"
  | "no-family"
  | "needs-enrolment"
  | "awaiting-admission"
  | "locked"
  | "unlocked";

export interface DeviceSummary {
  id: string;
  label: string;
  lockedUntil: string | null;
  lastUsedAt: string | null;
  createdAt: string;
}

interface MemberKeyRow {
  wrappedPrivateKey: Bytes;
  passphraseSalt: Bytes;
  iterations: number;
  wrappedFamilyKey: Bytes | null;
  wrapEphemeralPublic: Bytes | null;
  keyVersion: number;
}

interface KeyVaultValue {
  status: VaultStatus;
  /** Null unless status is "unlocked". Never persist this. */
  key: VaultKey | null;
  memberId: string | null;
  familyId: string | null;
  isAdmin: boolean;
  /** Every PIN enrolment this member has, across all their devices. */
  devices: DeviceSummary[];
  /**
   * The enrolment belonging to *this* browser, or null if it has none.
   *
   * The distinction is the whole reason a PIN is safe. `devices` may list a
   * phone while you are sitting at a laptop that has never enrolled — offering
   * a PIN box there cannot work, and worse, every attempt would be charged
   * against the phone's counter until the phone locked itself out.
   */
  localDevice: DeviceSummary | null;
  error: string | null;

  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;

  /** Founder's first run: family, key, passphrase and recovery key in one go. */
  createVault: (familyName: string, displayName: string, passphrase: string)
    => Promise<{ recoveryKey: string }>;
  /** An invited member choosing their passphrase. */
  enrol: (passphrase: string) => Promise<void>;

  unlockByPassphrase: (passphrase: string) => Promise<void>;
  unlockByPin: (deviceId: string, pin: string) => Promise<void>;
  unlockByRecoveryKey: (printedKey: string) => Promise<void>;

  addPin: (pin: string, label: string) => Promise<void>;
  removeDevice: (deviceId: string) => Promise<void>;
  lock: () => void;
  refresh: () => Promise<void>;
}

const KeyVaultContext = createContext<KeyVaultValue | null>(null);

export function KeyVaultProvider({ children }: { children: ReactNode }) {
  const [key, setKeyState] = useState<VaultKey | null>(null);

  // Deterministic on the first render: the environment variables are inlined at
  // build time, so this is the same value in the exported HTML and in the
  // browser. Deriving it during render rather than in an effect keeps the
  // unconfigured case from needing a render pass to discover itself.
  const [situation, setSituation] = useState<Exclude<VaultStatus, "unlocked">>(
    isConfigured() ? "loading" : "signed-out",
  );

  // Derived, never stored. If "unlocked" were its own state it could disagree
  // with whether the key is actually in hand — and the direction that disagrees
  // wrongly is a screen that thinks it can decrypt and cannot.
  const status: VaultStatus = key ? "unlocked" : situation;
  const [memberId, setMemberId] = useState<string | null>(null);
  const [familyId, setFamilyId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [devices, setDevices] = useState<DeviceSummary[]>([]);
  const [localDeviceId, setLocalDeviceId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(
    isConfigured() ? null : "This build has no database configured.",
  );

  // ---------------------------------------------------------- who am I ----

  const readSituation = useCallback(async () => {
    const supabase = getSupabase();
    const { data: sessionData } = await supabase.auth.getSession();
    const uid = sessionData.session?.user.id ?? null;
    if (!uid) {
      setMemberId(null);
      setFamilyId(null);
      setSituation("signed-out");
      return;
    }
    setMemberId(uid);

    const { data: member, error: memberError } = await supabase
      .from("members")
      .select("family_id, role")
      .eq("id", uid)
      .maybeSingle();
    if (memberError) throw new Error(memberError.message);

    if (!member) {
      // Signed in with no member row. Either the founder before bootstrap, or
      // somebody invited without the metadata 0005_auth needs — both land here
      // and both are handled by the first-run screen.
      setFamilyId(null);
      setSituation("no-family");
      return;
    }

    setFamilyId(member.family_id as string);
    setIsAdmin(member.role === "admin");

    const { data: keyRow, error: keyError } = await supabase
      .from("member_keys")
      .select("wrapped_private_key, wrapped_family_key")
      .eq("member_id", uid)
      .maybeSingle();
    if (keyError) throw new Error(keyError.message);

    if (!keyRow) {
      setSituation("needs-enrolment");
      return;
    }
    if (!keyRow.wrapped_family_key) {
      setSituation("awaiting-admission");
      return;
    }

    const list = await rpc<Record<string, unknown>[]>("list_devices");
    const summaries: DeviceSummary[] = (list ?? []).map((d) => ({
      id: d.id as string,
      label: (d.label as string) || "",
      lockedUntil: (d.locked_until as string) ?? null,
      lastUsedAt: (d.last_used_at as string) ?? null,
      createdAt: d.created_at as string,
    }));
    setDevices(summaries);

    // Only trust the remembered id if the server still lists it. An enrolment
    // revoked from another device leaves a stale id here, and honouring it
    // would offer a PIN box that can only ever fail.
    const remembered = await rememberedDeviceId();
    setLocalDeviceId(remembered && summaries.some((d) => d.id === remembered) ? remembered : null);
    // Everything exists. Whether the vault is actually open is decided by
    // whether the key is in hand, which `status` derives above.
    setSituation("locked");
  }, []);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      await readSituation();
    } catch (e) {
      setError(describeConnectionFailure(e));
      setSituation("signed-out");
    }
  }, [readSituation]);

  useEffect(() => {
    if (!isConfigured()) return;

    // No initial read here on purpose. supabase-js emits INITIAL_SESSION the
    // moment this subscribes, so the first load arrives through the same
    // callback as every later sign-in — one path instead of two, and no
    // setState in the effect body racing the one in the callback.
    const supabase = getSupabase();
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") setKeyState(null);
      void refresh();
    });
    return () => sub.subscription.unsubscribe();
  }, [refresh]);

  // -------------------------------------------------------- auto-lock ----
  //
  // Idle, not elapsed. Locking somebody out mid-sentence while they type an
  // item's details would train them to pick a shorter PIN, which costs more
  // than the minutes it saves.

  useEffect(() => {
    if (status !== "unlocked") return;

    let timer: number;
    const arm = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        setKeyState(null);
        setSituation("locked");
      }, AUTO_LOCK_MS);
    };

    const events = ["pointerdown", "keydown", "touchstart", "focus"] as const;
    for (const e of events) window.addEventListener(e, arm, { passive: true });
    arm();

    return () => {
      window.clearTimeout(timer);
      for (const e of events) window.removeEventListener(e, arm);
    };
  }, [status]);

  // ----------------------------------------------------------- actions ----

  const signIn = useCallback(async (email: string, password: string) => {
    const { error: e } = await getSupabase().auth.signInWithPassword({ email, password });
    if (e) throw new Error(e.message);
    await refresh();
  }, [refresh]);

  const signOut = useCallback(async () => {
    // Drop the key first. If signOut throws — offline, expired refresh token —
    // the vault must still be shut, and the order is what guarantees it.
    setKeyState(null);
    setSituation("signed-out");
    await getSupabase().auth.signOut();
  }, []);

  const lock = useCallback(() => {
    setKeyState(null);
    setSituation("locked");
  }, []);

  /** Uploads a fresh keypair for the signed-in member. Shared by both paths. */
  const uploadEnrolment = useCallback(
    async (uid: string, family: string, passphrase: string) => {
      const enrolment = await enrolMember(passphrase);
      const supabase = getSupabase();

      const { error: pubError } = await supabase.from("member_public_keys").upsert({
        member_id: uid,
        family_id: family,
        public_key: toPg(enrolment.publicKey),
      });
      if (pubError) throw new Error(pubError.message);

      const { error: privError } = await supabase.from("member_keys").upsert({
        member_id: uid,
        family_id: family,
        wrapped_private_key: toPg(enrolment.wrappedPrivateKey),
        passphrase_salt: toPg(enrolment.passphraseSalt),
        kdf_iterations: enrolment.iterations,
      });
      if (privError) throw new Error(privError.message);

      return enrolment;
    },
    [],
  );

  const createVault = useCallback(
    async (familyName: string, displayName: string, passphrase: string) => {
      const supabase = getSupabase();
      const { data: sessionData } = await supabase.auth.getSession();
      const uid = sessionData.session?.user.id;
      if (!uid) throw new Error("Sign in first");

      // 1. The family row, created by SQL because only SQL can make the caller
      //    its admin. It has no name yet — a function has no key.
      const family = await rpc<string>("bootstrap_family", { p_display_name: displayName });

      // 2. The key that everything else in the vault depends on.
      const vaultKey = await generateFamilyKey(1);

      // 3. This member's keypair, and the family key wrapped to it.
      await uploadEnrolment(uid, family, passphrase);
      const { data: pub } = await supabase
        .from("member_public_keys")
        .select("public_key")
        .eq("member_id", uid)
        .single();
      const wrap = await wrapFamilyKeyFor(vaultKey, decodeBytea(pub?.public_key)!);
      const { error: wrapError } = await supabase
        .from("member_keys")
        .update({
          wrapped_family_key: toPg(wrap.wrapped),
          wrap_ephemeral_public: toPg(wrap.ephemeralPublic),
        })
        .eq("member_id", uid);
      if (wrapError) throw new Error(wrapError.message);

      // 4. The recovery copy, before anything is stored under this key. Doing
      //    it now means there is never a window where the vault holds real data
      //    and has no way back.
      const recovery = await enrolRecovery(vaultKey);
      const { error: recError } = await supabase.from("family_keys").insert({
        family_id: family,
        recovery_wrapped: toPg(recovery.wrapped),
        recovery_salt: toPg(recovery.salt),
        recovery_iterations: recovery.iterations,
      });
      if (recError) throw new Error(recError.message);

      // 5. Now the family has a key, its name can be sealed with it.
      const enc = await seal(vaultKey, { name: familyName }, aadFor("families", family));
      const { error: nameError } = await supabase
        .from("families")
        .update({ enc: toPg(enc) })
        .eq("id", family);
      if (nameError) throw new Error(nameError.message);

      setKeyState(vaultKey);
      await refresh();
      return { recoveryKey: recovery.printedKey };
    },
    [refresh, uploadEnrolment],
  );

  const enrol = useCallback(
    async (passphrase: string) => {
      const supabase = getSupabase();
      const { data: sessionData } = await supabase.auth.getSession();
      const uid = sessionData.session?.user.id;
      if (!uid || !familyId) throw new Error("Sign in first");
      await uploadEnrolment(uid, familyId, passphrase);
      await refresh();
    },
    [familyId, refresh, uploadEnrolment],
  );

  const loadMemberKey = useCallback(async (uid: string): Promise<MemberKeyRow> => {
    const { data, error: e } = await getSupabase()
      .from("member_keys")
      .select(
        "wrapped_private_key, passphrase_salt, kdf_iterations, wrapped_family_key, wrap_ephemeral_public, key_version",
      )
      .eq("member_id", uid)
      .single();
    if (e) throw new Error(e.message);
    return {
      wrappedPrivateKey: decodeBytea(data.wrapped_private_key)!,
      passphraseSalt: decodeBytea(data.passphrase_salt)!,
      iterations: data.kdf_iterations as number,
      wrappedFamilyKey: decodeBytea(data.wrapped_family_key),
      wrapEphemeralPublic: decodeBytea(data.wrap_ephemeral_public),
      keyVersion: data.key_version as number,
    };
  }, []);

  const unlockByPassphrase = useCallback(
    async (passphrase: string) => {
      if (!memberId) throw new Error("Sign in first");
      const row = await loadMemberKey(memberId);
      if (!row.wrappedFamilyKey || !row.wrapEphemeralPublic) {
        throw new Error("An admin has not admitted you to the vault yet.");
      }
      const vaultKey = await unlockWithPassphrase(
        passphrase,
        {
          wrappedPrivateKey: row.wrappedPrivateKey,
          passphraseSalt: row.passphraseSalt,
          iterations: row.iterations,
        },
        { wrapped: row.wrappedFamilyKey, ephemeralPublic: row.wrapEphemeralPublic },
        row.keyVersion,
      );
      setKeyState(vaultKey);
    },
    [loadMemberKey, memberId],
  );

  const unlockByPin = useCallback(
    async (deviceId: string, pin: string) => {
      // begin_device_unlock charges the attempt before returning anything, so
      // this call is the thing being rate-limited. Never fetch the blob any
      // other way, and never retry in a loop.
      const row = await rpc<Record<string, unknown>>("begin_device_unlock", {
        p_device_id: deviceId,
      });
      const vaultKey = await unlockWithPin(
        pin,
        {
          wrapped: decodeBytea(row.wrapped_family_key)!,
          pinSalt: decodeBytea(row.pin_salt)!,
          iterations: row.kdf_iterations as number,
        },
        row.key_version as number,
      );
      // Only reachable with the right PIN, so it is safe to clear the counter.
      await rpc("complete_device_unlock", { p_device_id: deviceId });
      setKeyState(vaultKey);
    },
    [],
  );

  const unlockByRecoveryKey = useCallback(
    async (printedKey: string) => {
      if (!familyId) throw new Error("Sign in first");
      const { data, error: e } = await getSupabase()
        .from("family_keys")
        .select("recovery_wrapped, recovery_salt, recovery_iterations, key_version")
        .eq("family_id", familyId)
        .single();
      if (e) throw new Error(e.message);
      const vaultKey = await unlockWithRecoveryKey(
        printedKey,
        {
          wrapped: decodeBytea(data.recovery_wrapped)!,
          salt: decodeBytea(data.recovery_salt)!,
          iterations: data.recovery_iterations as number,
        },
        data.key_version as number,
      );
      setKeyState(vaultKey);
    },
    [familyId],
  );

  const addPin = useCallback(
    async (pin: string, label: string) => {
      const vaultKey = key;
      if (!vaultKey) throw new Error("Unlock the vault before setting a PIN");
      const wrap = await wrapForDevice(vaultKey, pin);
      const id = await rpc<string>("enroll_device", {
        p_label: label,
        p_wrapped: toPg(wrap.wrapped),
        p_pin_salt: toPg(wrap.pinSalt),
        p_iterations: wrap.iterations,
        p_key_version: vaultKey.version,
      });
      // Recorded next to the device secret that opens it. Without this the
      // enrolment exists on the server and no browser knows it is theirs.
      await rememberDeviceId(id);
      await refresh();
    },
    [key, refresh],
  );

  const removeDevice = useCallback(
    async (deviceId: string) => {
      const { error: e } = await getSupabase()
        .from("member_devices")
        .delete()
        .eq("id", deviceId);
      if (e) throw new Error(e.message);
      // Revoking this browser's own enrolment should also destroy the secret
      // that opened it, so a re-enrolment starts genuinely fresh rather than
      // reusing a device secret the user just tried to get rid of.
      if (deviceId === localDeviceId) await forgetDevice();
      await refresh();
    },
    [localDeviceId, refresh],
  );

  const value = useMemo<KeyVaultValue>(
    () => ({
      status,
      key,
      memberId,
      familyId,
      isAdmin,
      devices,
      localDevice: devices.find((d) => d.id === localDeviceId) ?? null,
      error,
      signIn,
      signOut,
      createVault,
      enrol,
      unlockByPassphrase,
      unlockByPin,
      unlockByRecoveryKey,
      addPin,
      removeDevice,
      lock,
      refresh,
    }),
    [
      status, key, memberId, familyId, isAdmin, devices, localDeviceId, error,
      signIn, signOut, createVault, enrol, unlockByPassphrase, unlockByPin,
      unlockByRecoveryKey, addPin, removeDevice, lock, refresh,
    ],
  );

  return <KeyVaultContext.Provider value={value}>{children}</KeyVaultContext.Provider>;
}

export function useKeyVault(): KeyVaultValue {
  const ctx = useContext(KeyVaultContext);
  if (!ctx) throw new Error("useKeyVault must be used inside KeyVaultProvider");
  return ctx;
}

/**
 * The key, or a thrown error.
 *
 * For code paths that cannot sensibly run locked — sealing a new item, opening
 * a photo. Throwing beats returning null because a null key silently writing
 * unencrypted data is the one failure this whole design exists to prevent.
 */
export function useRequiredKey(): VaultKey {
  const { key } = useKeyVault();
  if (!key) throw new Error("The vault is locked");
  return key;
}
