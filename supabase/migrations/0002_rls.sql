-- Row Level Security
--
-- With no application server, these policies ARE the security model. Every rule
-- about who can see or change what lives here. A mistake exposes the vault, so
-- tests/rls_isolation.sql exists to prove the isolation actually holds.
--
-- Visibility model: open family. Every member sees everything in their own
-- family and nothing outside it. Mutations that reshape the vault — adding
-- jewelry, configuring lockers, inviting people, changing the gold rate — are
-- admin-only. Day-to-day custody changes go through the SECURITY DEFINER
-- functions in 0003_functions.sql, which enforce the state machine centrally.

-- ------------------------------------------------------ helper functions ----
--
-- These are SECURITY DEFINER on purpose. A policy on `members` that queried
-- `members` would recurse forever; running as the definer bypasses RLS on that
-- one lookup and breaks the cycle.
--
-- `search_path` is pinned on every one of them. Without it, a caller could
-- prepend a schema and have these resolve to their own `members` table.

create or replace function public.current_family_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select family_id from public.members where id = auth.uid() and is_active
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.members
    where id = auth.uid() and is_active and role = 'admin'
  )
$$;

-- True when the row belongs to the caller's family. Every policy funnels
-- through this so "which family am I in" is answered in exactly one place.
create or replace function public.in_my_family(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select target is not null and target = public.current_family_id()
$$;

revoke execute on function public.current_family_id() from public, anon;
revoke execute on function public.is_admin()          from public, anon;
revoke execute on function public.in_my_family(uuid)  from public, anon;
grant  execute on function public.current_family_id() to authenticated;
grant  execute on function public.is_admin()          to authenticated;
grant  execute on function public.in_my_family(uuid)  to authenticated;

-- ---------------------------------------------------------- enable RLS ----
-- Every table. A table with RLS off is readable by anyone holding the anon key.

alter table public.families           enable row level security;
alter table public.members            enable row level security;
alter table public.lockers            enable row level security;
alter table public.jewelry            enable row level security;
alter table public.events             enable row level security;
alter table public.event_items        enable row level security;
alter table public.movements          enable row level security;
alter table public.documents          enable row level security;
alter table public.locker_visits      enable row level security;
alter table public.valuations         enable row level security;
alter table public.notifications      enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.audit_logs         enable row level security;

-- Also refuse the default privileges the anon role would otherwise inherit.
revoke all on all tables in schema public from anon;

-- ------------------------------------------------------------- families ----

create policy families_select on public.families
  for select to authenticated
  using (id = public.current_family_id());

-- Gold rate, vault name, price visibility: admin-only.
create policy families_update on public.families
  for update to authenticated
  using (id = public.current_family_id() and public.is_admin())
  with check (id = public.current_family_id());

-- -------------------------------------------------------------- members ----

create policy members_select on public.members
  for select to authenticated
  using (public.in_my_family(family_id));

-- Admins invite and deactivate.
create policy members_insert on public.members
  for insert to authenticated
  with check (public.in_my_family(family_id) and public.is_admin());

-- An admin may edit anyone in the family; everyone may edit themselves, which
-- is how a member sets their own push language.
create policy members_update on public.members
  for update to authenticated
  using (public.in_my_family(family_id) and (public.is_admin() or id = auth.uid()))
  with check (public.in_my_family(family_id));

-- -------------------------------------------------------------- lockers ----

create policy lockers_select on public.lockers
  for select to authenticated
  using (public.in_my_family(family_id));

create policy lockers_insert on public.lockers
  for insert to authenticated
  with check (public.in_my_family(family_id) and public.is_admin());

create policy lockers_update on public.lockers
  for update to authenticated
  using (public.in_my_family(family_id) and public.is_admin())
  with check (public.in_my_family(family_id));

-- -------------------------------------------------------------- jewelry ----

create policy jewelry_select on public.jewelry
  for select to authenticated
  using (public.in_my_family(family_id));

create policy jewelry_insert on public.jewelry
  for insert to authenticated
  with check (public.in_my_family(family_id) and public.is_admin());

-- Admins edit item details. Custody changes (status, holder, locker) are NOT
-- done here — they go through the movement functions, which is why members are
-- not granted update. Deliberately no delete policy anywhere: archiving is the
-- only removal, so movement history can never be orphaned.
create policy jewelry_update on public.jewelry
  for update to authenticated
  using (public.in_my_family(family_id) and public.is_admin())
  with check (public.in_my_family(family_id));

-- --------------------------------------------------------------- events ----

create policy events_select on public.events
  for select to authenticated
  using (public.in_my_family(family_id));

create policy events_insert on public.events
  for insert to authenticated
  with check (public.in_my_family(family_id));

create policy events_update on public.events
  for update to authenticated
  using (public.in_my_family(family_id))
  with check (public.in_my_family(family_id));

create policy events_delete on public.events
  for delete to authenticated
  using (public.in_my_family(family_id) and public.is_admin());

-- Attaching jewelry to an event is planning, not custody, so any member may do
-- it. Both sides of the join must belong to the caller's family.
create policy event_items_select on public.event_items
  for select to authenticated
  using (exists (
    select 1 from public.events e
    where e.id = event_id and public.in_my_family(e.family_id)
  ));

create policy event_items_insert on public.event_items
  for insert to authenticated
  with check (
    exists (select 1 from public.events e   where e.id = event_id   and public.in_my_family(e.family_id))
    and
    exists (select 1 from public.jewelry j  where j.id = jewelry_id and public.in_my_family(j.family_id))
  );

create policy event_items_delete on public.event_items
  for delete to authenticated
  using (exists (
    select 1 from public.events e
    where e.id = event_id and public.in_my_family(e.family_id)
  ));

-- ------------------------------------------------------------ movements ----
-- Readable by the family; written only by the state-machine functions. There
-- is no insert, update or delete policy here on purpose: append-only means the
-- client cannot rewrite history even if it tries.

create policy movements_select on public.movements
  for select to authenticated
  using (public.in_my_family(family_id));

-- ------------------------------------------------------------ documents ----

create policy documents_select on public.documents
  for select to authenticated
  using (public.in_my_family(family_id));

-- Any member may add an invoice or certificate — that is the kind of chore
-- worth spreading around.
create policy documents_insert on public.documents
  for insert to authenticated
  with check (public.in_my_family(family_id));

create policy documents_delete on public.documents
  for delete to authenticated
  using (public.in_my_family(family_id) and public.is_admin());

-- -------------------------------------------------------- locker_visits ----

create policy locker_visits_select on public.locker_visits
  for select to authenticated
  using (public.in_my_family(family_id));

create policy locker_visits_insert on public.locker_visits
  for insert to authenticated
  with check (public.in_my_family(family_id));

-- ----------------------------------------------------------- valuations ----

create policy valuations_select on public.valuations
  for select to authenticated
  using (public.in_my_family(family_id));

create policy valuations_insert on public.valuations
  for insert to authenticated
  with check (public.in_my_family(family_id) and public.is_admin());

-- -------------------------------------------------------- notifications ----
-- Family-wide rows have recipient_id null; targeted ones must match the caller.

create policy notifications_select on public.notifications
  for select to authenticated
  using (
    public.in_my_family(family_id)
    and (recipient_id is null or recipient_id = auth.uid())
  );

-- Only marking as read; the Worker creates them with the service role.
create policy notifications_update on public.notifications
  for update to authenticated
  using (public.in_my_family(family_id))
  with check (public.in_my_family(family_id));

-- --------------------------------------------------- push_subscriptions ----
-- A device registration is personal: you may only see and manage your own.

create policy push_subscriptions_select on public.push_subscriptions
  for select to authenticated
  using (member_id = auth.uid());

create policy push_subscriptions_insert on public.push_subscriptions
  for insert to authenticated
  with check (member_id = auth.uid() and public.in_my_family(family_id));

create policy push_subscriptions_delete on public.push_subscriptions
  for delete to authenticated
  using (member_id = auth.uid());

-- ------------------------------------------------------------ audit_log ----
-- Readable by the family, written only by the functions below. No update or
-- delete policy: an audit log you can edit is not an audit log.

create policy audit_logs_select on public.audit_logs
  for select to authenticated
  using (public.in_my_family(family_id));
