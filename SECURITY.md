# Security

What this vault protects, what it does not, and what you have to do by hand.

## The thing worth understanding first

Supabase advertises "encryption at rest." That is full-disk encryption. It
defends against somebody stealing the physical drive out of a datacentre — a
threat that barely exists for a managed database — and it does nothing about the
threats that are actually plausible here:

- the `service_role` key leaking out of a Worker, a screenshot, or a git commit
- a Supabase dashboard login being phished
- a Supabase employee with production access
- a subpoena or a support engineer debugging your project

In every one of those, disk encryption is already unlocked and the data is
plainly readable. So the vault does not rely on it. Everything sensitive is
encrypted in the browser, and the database stores bytes nobody at Supabase can
turn back into a necklace.

## Why go this far for a family app

Because of what this particular data is. A jewelry vault database is a burglary
plan:

| Table | What it tells a thief |
|---|---|
| `jewelry` | what you own, what it weighs, what it cost |
| `lockers` | which bank, which branch, which box number |
| `movements` | which nights gold is at somebody's house instead of a vault |
| `documents` | invoices, often with a home address on them |
| photos | what it looks like, and where it was photographed |

That last one is the underrated entry. A photo taken on your dining table
carries the GPS coordinates of your dining table. Every image is re-encoded
through a canvas before upload, which discards EXIF, GPS and maker notes by
construction — see [image.ts](web/src/lib/image.ts).

## How the keys fit together

```
passphrase ──PBKDF2 600k──▶ KEK ──unwraps──▶ member private key (ECDH P-256)
                                                     │
family key (AES-256-GCM) ◀──ECDH unwrap──────────────┘
     │
     ├── seals every `enc` column
     ├── seals every photo and document before upload
     │
     ├── wrapped to each member's public key   → member_keys
     ├── wrapped to a PIN + device secret      → member_devices
     └── wrapped to the printed recovery key   → family_keys
```

One family key. It is generated once in one browser and never leaves a browser.
Inviting somebody means wrapping that key to their public key, so **no
passphrase is ever shared or spoken aloud**. Removing somebody means rotating it.

Implementation: [crypto.ts](web/src/lib/crypto.ts) and
[0006_encryption.sql](supabase/migrations/0006_encryption.sql). No cryptography
library — a dependency there is a supply-chain hole pointed straight at the
family key, and `crypto.subtle` is already audited by four browser vendors.

## What is still readable in the database, and why

Being specific about this matters more than claiming everything is encrypted.

| Readable | Why it has to be |
|---|---|
| ids, `family_id`, `status`, timestamps | RLS policies and the movement state machine are written in terms of these. An encrypted foreign key cannot be joined. |
| `expected_return_on`, `last_visited_on`, `events.starts_on` | The reminder cron must know something is due without being able to read what. |
| `members.display_name`, `members.email` | `auth.users` stores the email in plaintext and always will — Supabase Auth owns that table. Encrypting a second copy would look like security while changing nothing. |
| `documents.type` | Keeps "this item has no hallmark certificate" working. |
| `gold_rate_per_gram_24k` | The market price of gold is public. What it multiplies is not. |

**So an attacker with the entire database learns:** this family has 47 items, 3
are currently out, one is due back on the 14th, and there are five members with
these names and emails.

**They do not learn:** what any item is, whose it is, what it weighs, what it
cost, which bank holds it, or what any of it looks like.

## The PIN, honestly

Six digits is a million guesses, which a GPU exhausts in minutes given the
wrapped key. Two things stop that, and neither is sufficient alone:

1. **The wrapped key is not on the device.** `member_devices` has *no select
   policy* — deliberately, and it is load-bearing. The only way to reach the
   blob is `begin_device_unlock()`, which charges an attempt *before* handing it
   over, so abandoning the request still costs. Five wrong PINs lock the device
   for fifteen minutes; ten destroy the enrolment. Ten guesses out of a million
   is roughly a 1-in-100,000 chance.
2. **A device secret that JavaScript cannot read.** A non-extractable WebCrypto
   HMAC key in IndexedDB. `extractable: false` means the browser never hands the
   bytes back, so copying the phone's storage does not copy the key.

The limit: somebody holding an *unlocked* phone with a *live session* still gets
ten tries at the PIN. That is the honest ceiling of any PIN, and it is why the
passphrase still exists and why the auto-lock is short.

## Runbooks

### First setup

1. Run migrations `0001` → `0006` in order, then `tests/rls_isolation.sql`.
2. Sign up once, then `select public.bootstrap_family('Sivanesh');`
3. **Turn public sign-up off.** Authentication → Sign In / Providers → Email.
4. Set a passphrase. Long, and not one you use elsewhere — it is the one secret
   with no rate limiting behind it.
5. **Print the recovery key and put it in the physical locker.** Not in a photo,
   not in a password manager that shares an account with the vault, not in a
   note on the phone that unlocks the vault. Paper, in the locker.
6. Set a PIN on your phone.

### Inviting somebody

```js
await supabase.auth.admin.inviteUserByEmail(email, {
  data: { family_id: FAMILY_ID, display_name: "Priya", role: "member" },
});
```

They sign in, choose a passphrase, and their browser uploads a public key. They
will see an empty vault until an admin runs `grant_family_key()` — this is
expected, not a bug. That second step is what makes access a deliberate act
rather than a side effect of receiving an email.

### A phone is lost or stolen

1. Revoke the device — Settings → Devices, or `delete from member_devices`.
2. Sign that member out everywhere: Supabase → Authentication → the user →
   sign out sessions.
3. That is enough. The finder has ciphertext, ten PIN guesses, and a session you
   have just killed.

Rotate the family key only if you believe the passphrase was also captured.

### Somebody forgets their passphrase

An admin re-admits them: they enrol a new passphrase and keypair, the admin runs
`grant_family_key()` again. No data is lost — the family key is unchanged, they
just get a new envelope to open it with.

### Everybody forgets everything

The printed recovery key. This is the only path, and there is no other by
design — a recovery route the server could travel is a backdoor, and a backdoor
is exactly what an attacker with the database would use.

### Removing somebody

Deactivating them cuts off RLS immediately, which is enough day to day. If they
left badly, rotate: generate a new family key, re-encrypt, re-wrap to everyone
remaining, print a new recovery key. They keep whatever they already read — no
system can undo that.

## What you have to set up by hand

### Cloudflare Access — 15 minutes, free to 50 users

Puts an identity check in front of the site, so it is not publicly loadable at
all. Two independent gates: pass Access, then pass Supabase auth.

1. Cloudflare dashboard → Zero Trust → Access → Applications → Add → Self-hosted
2. Domain: `jwelry-vault.pages.dev`
3. Policy: Action **Allow**, Include → **Emails** → list every family member
4. Login method: **One-time PIN** (no Google account required)
5. Session duration: 24 hours

Add `*.jwelry-vault.pages.dev` as well, or Cloudflare's per-deployment preview
URLs stay open to anyone who finds one.

### Supabase auth hardening

- Authentication → Sign In / Providers → Email → **disable sign-ups**
- Enable **leaked password protection** (checks against Have I Been Pwned)
- Enable **MFA** and turn it on for every admin
- Set JWT expiry to 1 hour
- Turn on MFA for your Supabase *account* itself, and for Cloudflare, and for
  the GitHub repo. An attacker who owns the Supabase account can drop the
  tables — encryption does not stop deletion.

### The CSP names one project — keep it that way

[`web/public/_headers`](web/public/_headers) pins `connect-src` to
`mhoxsqbcndzeoexlqzdl.supabase.co`. It was a `*.supabase.co` wildcard until the
project existed, which would have let an injected script post the decrypted
vault to any Supabase project it liked — a free account is a low bar.

If the project ref ever changes, this line changes with it. Forgetting shows up
as every request failing with a CSP violation in the console, which is loud
rather than subtle.

### Never commit

`service_role` key, VAPID private key, database password. These belong in
`wrangler secret put`, nowhere else. Anything prefixed `NEXT_PUBLIC_` is
compiled into the JavaScript bundle and readable by anyone who opens the page.

## Known limits

Stated plainly, because a security document that only lists strengths is
marketing.

- **`unsafe-inline` in `script-src`.** Forced by static export — no server, no
  nonce. `connect-src` is doing the real work; see the notes in `_headers`.
- **PDFs are not sanitised.** Parsing PDF to strip metadata is a large
  dependency and a large attack surface. The file is encrypted before upload, so
  the guarantee comes from the envelope, not from cleaning the contents.
- **An unlocked phone with a live session is game over**, as it is for every
  app. Auto-lock and short JWT expiry narrow the window; they do not close it.
- **An admin can delete.** Encryption protects confidentiality, not
  availability. The nightly backup Worker is the answer to that, and its output
  is encrypted too.
- **`tests/rls_isolation.sql` has not been run by me.** There is no Docker or
  psql in the environment this was written in, so it is verified structurally
  only. Run it before real jewelry goes in.
