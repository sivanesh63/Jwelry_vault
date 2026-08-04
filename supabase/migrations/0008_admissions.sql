-- Letting a new member in
--
-- Joining this vault is two steps, and the second one is easy to forget exists.
--
--   1. The person gets a login and a members row. That is an invite.
--   2. An admin wraps the family key to their public key. That is admission.
--
-- Only the second grants any ability to read. Until it happens the new member
-- signs in successfully and sees ciphertext they cannot open — which the app
-- reports as "waiting to be let in" rather than as an empty vault.
--
-- The problem this migration solves: an admin cannot tell who is waiting.
-- `member_keys` is readable only by its owner, deliberately and importantly —
-- an admin who could read those rows could open the vault without anyone's
-- passphrase. So "has this person enrolled but not been admitted?" is a
-- question no admin is allowed to ask directly.
--
-- pending_admissions answers exactly that question and nothing else. It returns
-- the public key, which is public by definition, and never touches the wrapped
-- private key sitting in the same table.

create or replace function public.pending_admissions()
returns table (
  member_id    uuid,
  display_name text,
  email        text,
  public_key   bytea,
  enrolled_at  timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select m.id, m.display_name, m.email, pk.public_key, mk.enrolled_at
  from public.members m
  join public.member_public_keys pk on pk.member_id = m.id
  join public.member_keys mk        on mk.member_id = m.id
  where m.family_id = public.current_family_id()
    and m.is_active
    -- Enrolled a keypair, but nobody has handed them the family key yet.
    and mk.wrapped_family_key is null
    -- Checked inside the function because SECURITY DEFINER bypasses RLS: this
    -- is the only thing standing between a plain member and a list of who else
    -- is in the family.
    and public.is_admin()
  order by mk.enrolled_at;
$$;

revoke execute on function public.pending_admissions() from public, anon;
grant  execute on function public.pending_admissions() to authenticated;
