# Database

Postgres schema, access rules and the movement state machine for the vault.

## Apply it

Easiest path — the Supabase SQL editor. Paste and run each file **in order**:

```
migrations/0001_schema.sql     tables, enums, indexes, constraints
migrations/0002_rls.sql        row level security on every table
migrations/0003_functions.sql  movement state machine
migrations/0004_storage.sql    buckets and their policies
migrations/0005_auth.sql       login → family member bridge
```

Or with the CLI:

```bash
npx supabase link --project-ref <ref>
npx supabase db push
```

## Then prove it works

```
tests/rls_isolation.sql
```

Run it in the SQL editor. It creates two families, acts as a member of each, and
asserts that neither can see or touch the other's data. Everything runs inside a
transaction that rolls back, so it leaves nothing behind.

Expected output is a list of `PASS` notices. Any failure raises and aborts, so
"it finished" and "it passed" are the same thing.

**Do this before putting real jewelry in.** With no application server, these
policies are the entire security model — there is no second layer to catch a
mistake.

## Create the first family

There is no admin to invite the first person, so they bootstrap themselves.
After signing up once (temporarily allow sign-ups, or create the user from the
dashboard), run as that user:

```sql
select public.bootstrap_family('Our Family Vault', 'Sivanesh');
```

Then **turn public sign-up off** in Authentication → Sign In / Providers → Email.
Everyone after this joins by invitation.

## Inviting the rest of the family

Invites must carry metadata, or the new user signs in to an empty vault:

```js
await supabase.auth.admin.inviteUserByEmail(email, {
  data: { family_id: FAMILY_ID, display_name: "Priya", role: "member" },
});
```

`0005_auth.sql` has a trigger on `auth.users` that reads that metadata and
creates the matching `members` row. Without the metadata it deliberately does
nothing rather than silently adding someone to a family.

## Shape of it

Twelve tables, `family_id` on every one. Adding a tenant key later would be a
brutal migration; carrying it now makes multi-family support a policy change.

Two naming notes against `src/lib/types.ts`:

- TypeScript `User` → `public.members`. `public.users` would sit confusingly
  beside Supabase's `auth.users`, and they mean different things: one is a
  login, the other is a person in a family.
- TypeScript `Settings` → folded into `families`, since every field on it is
  per-family anyway.

## Why custody changes are functions, not updates

`take_out`, `return_items`, `start_transfer` and the rest are `SECURITY DEFINER`
functions rather than client-side `UPDATE`s. That buys three things:

1. The state machine holds even if someone talks to the API directly.
2. The movement row and the audit entry are written in the same transaction as
   the status change, so history cannot drift from state.
3. `movements` needs no insert policy at all, which is what makes append-only
   real rather than a convention.

Because `SECURITY DEFINER` bypasses RLS, every one of those functions re-checks
family membership itself. That check is the only thing standing between a caller
and another family's data — `tests/rls_isolation.sql` case 5 exists specifically
to prove it.

## Rules worth knowing before you change anything

- **No delete policy on `jewelry`.** Archiving is the only removal, so movement
  history can never be orphaned.
- **No update or delete policy on `movements` or `audit_logs`.** An audit log
  you can edit is not an audit log.
- **`movements_one_open_per_item`** — a unique partial index making it
  impossible, not merely unlikely, for one item to be checked out twice.
- **All three storage buckets are private.** A public bucket exposes every photo
  to anyone who guesses a URL. The app uses short-lived signed URLs.
- **The `backups` bucket has no policy for `authenticated`.** Only the Worker,
  holding the `service_role` key, touches it.
- **Every function pins `search_path`.** Without it, a caller could prepend a
  schema and have `members` resolve to a table they control.
