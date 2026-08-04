-- Client-side encryption
--
-- Everything sensitive is encrypted in the browser before it is sent. Postgres
-- stores opaque bytes, and neither Supabase nor anyone holding its credentials
-- can read them. This is the difference that matters: Supabase's advertised
-- "encryption at rest" is full-disk encryption, which defends against someone
-- stealing the physical drive — a threat that barely exists for a managed
-- database — and does nothing about a leaked service_role key, a compromised
-- dashboard login, or an employee with production access. In all of those the
-- data is decrypted and readable. After this migration it is not.
--
-- Why the paranoia is proportionate here: this schema is a burglary plan. It
-- says what the family owns, what each piece weighs and is worth, which bank
-- and which locker number it sits in, and — through `movements` — exactly which
-- nights gold is at somebody's house instead of in a vault. Losing that is
-- worse than losing a password.
--
--
-- KEY HIERARCHY
--
--   passphrase ──PBKDF2──▶ KEK ──unwraps──▶ member private key (ECDH P-256)
--                                                  │
--   family key (AES-256-GCM) ◀──ECDH unwrap────────┘
--        │
--        ├──encrypts──▶ every `enc` column below
--        ├──encrypts──▶ every photo and document before upload
--        │
--        ├──wrapped to each member's public key   → member_keys
--        ├──wrapped to a PIN + device secret      → member_devices
--        └──wrapped to the printed recovery key   → family_keys
--
-- The family key never leaves the browser. Inviting someone means wrapping it
-- to their public key, so no passphrase is ever shared. Removing someone means
-- rotating it.
--
--
-- ENVELOPE FORMAT — identical in SQL and in web/src/lib/crypto.ts:
--
--   [1 byte version = 0x01][12 byte IV][ciphertext || 16 byte GCM tag]
--
-- The version byte is what makes a future algorithm change a migration rather
-- than a rewrite.
--
--
-- WHAT THIS MIGRATION DELIBERATELY LEAVES READABLE, AND WHY
--
--   ids, family_id, status, timestamps, owner/holder/locker links
--       RLS and the state machine in 0003 are written in terms of these. An
--       encrypted foreign key cannot be joined or checked.
--   expected_return_on, last_visited_on, events.starts_on
--       The reminder cron has to know something is due without being able to
--       read what it is.
--   members.display_name, members.email
--       auth.users already stores the email in plaintext and always will —
--       Supabase Auth owns that table. Encrypting a copy of it here would look
--       like security while changing nothing.
--   documents.type
--       Keeps the "this item has no hallmark certificate" reminder working.
--
-- So an attacker holding the whole database learns: this family has 47 items,
-- 3 are currently out, one is due back on the 14th. Not what they are, whose
-- they are, what they weigh, what they cost, or which bank holds them.

-- ============================================================ key storage ====

-- Public keys are family-readable on purpose: wrapping the family key for a new
-- member requires their public key. Kept in its own table because RLS grants or
-- denies whole rows, so a private key must never share a row with a public one.
create table public.member_public_keys (
  member_id   uuid primary key references public.members (id) on delete cascade,
  family_id   uuid not null references public.families (id) on delete cascade,
  -- ECDH P-256, SPKI DER.
  public_key  bytea not null,
  key_version int not null default 1,
  created_at  timestamptz not null default now()
);

create index member_public_keys_family_idx on public.member_public_keys (family_id);

-- The private half. Readable only by its owner — not by an admin, not by
-- anyone. `wrapped_private_key` is useless without the passphrase, and
-- `wrapped_family_key` is useless without the private key.
create table public.member_keys (
  member_id             uuid primary key references public.members (id) on delete cascade,
  family_id             uuid not null references public.families (id) on delete cascade,

  -- ECDH private key, AES-GCM under the passphrase-derived KEK.
  wrapped_private_key   bytea not null,
  passphrase_salt       bytea not null,
  kdf_iterations        int   not null default 600000,

  -- Family key, AES-GCM under a key derived from ECDH(ephemeral, this member).
  -- Null until an admin runs grant_family_key: a member can enrol before there
  -- is anyone awake to let them in.
  wrapped_family_key    bytea,
  wrap_ephemeral_public bytea,

  key_version           int not null default 1,
  enrolled_at           timestamptz not null default now(),
  rotated_at            timestamptz,

  constraint member_keys_iterations_sane check (kdf_iterations >= 600000),
  -- A wrapped key without its ephemeral public half can never be opened, so
  -- refuse to store the pair half-written.
  constraint member_keys_wrap_complete check (
    (wrapped_family_key is null     and wrap_ephemeral_public is null) or
    (wrapped_family_key is not null and wrap_ephemeral_public is not null)
  )
);

-- The recovery copy. The printed key is the only thing that opens it, and the
-- printed key exists on paper in the physical locker — nowhere else, and
-- certainly not here.
create table public.family_keys (
  family_id           uuid primary key references public.families (id) on delete cascade,
  key_version         int not null default 1,
  recovery_wrapped    bytea not null,
  recovery_salt       bytea not null,
  recovery_iterations int not null default 600000,
  created_at          timestamptz not null default now(),
  rotated_at          timestamptz,

  constraint family_keys_iterations_sane check (recovery_iterations >= 600000)
);

-- A per-device PIN unlock, so nobody types a long passphrase on a phone.
--
-- A 6-digit PIN is only a million guesses, which a GPU exhausts in minutes if
-- it can attack the wrapped key offline. Two things stop that:
--
--   1. The blob lives here, not on the device. Fetching it needs a valid
--      Supabase session, and begin_device_unlock counts every attempt: five
--      wrong PINs lock the device for fifteen minutes, ten destroy the
--      enrolment entirely. Ten guesses out of a million is a 1-in-100,000
--      chance, and the alternative is the passphrase.
--   2. Unwrapping also needs a device secret held in a non-extractable
--      WebCrypto key in IndexedDB. Copying the browser profile off the phone
--      does not copy that key. See web/src/lib/crypto.ts.
--
-- Neither half is sufficient alone, which is the point.
create table public.member_devices (
  id                 uuid primary key default gen_random_uuid(),
  member_id          uuid not null references public.members (id) on delete cascade,
  family_id          uuid not null references public.families (id) on delete cascade,
  -- "Amma's phone". Chosen by the user so a stolen device is recognisable in
  -- the list and can be revoked.
  label              text not null default '',

  -- Family key, AES-GCM under HKDF(device secret || PBKDF2(PIN)).
  wrapped_family_key bytea not null,
  pin_salt           bytea not null,
  kdf_iterations     int   not null default 600000,
  key_version        int   not null default 1,

  failed_attempts    int not null default 0,
  locked_until       timestamptz,
  last_used_at       timestamptz,
  created_at         timestamptz not null default now(),

  constraint member_devices_iterations_sane check (kdf_iterations >= 600000)
);

create index member_devices_member_idx on public.member_devices (member_id);

-- ====================================================== encrypted columns ====
--
-- Each `enc` column is one AES-GCM envelope holding a JSON object of every
-- sensitive field that used to be its own column. One blob rather than one per
-- field: separate ciphertexts leak field lengths, and a single envelope is one
-- authentication tag covering the whole record, so fields cannot be swapped
-- between rows.

-- --------------------------------------------------------------- families ----

alter table public.families add column enc bytea;
alter table public.families drop column name;
comment on column public.families.enc is 'AES-GCM envelope: { name }';

-- ---------------------------------------------------------------- lockers ----
-- The single most dangerous row in the database: bank, branch, box number.

alter table public.lockers add column enc bytea;
alter table public.lockers drop column name;
alter table public.lockers drop column branch;
alter table public.lockers drop column locker_number;
comment on column public.lockers.enc is 'AES-GCM envelope: { name, branch, lockerNumber }';

-- ---------------------------------------------------------------- jewelry ----

alter table public.jewelry add column enc bytea;
alter table public.jewelry drop column name;
alter table public.jewelry drop column custom_category;
alter table public.jewelry drop column photos;
alter table public.jewelry drop column gross_weight;
alter table public.jewelry drop column net_gold_weight;
alter table public.jewelry drop column stone_weight;
alter table public.jewelry drop column purity;
alter table public.jewelry drop column hallmark_no;
alter table public.jewelry drop column purchase_date;
alter table public.jewelry drop column purchase_price;
alter table public.jewelry drop column jeweler;
alter table public.jewelry drop column notes;
comment on column public.jewelry.enc is
  'AES-GCM envelope: { name, category, customCategory, photos[], grossWeight, '
  'netGoldWeight, stoneWeight, purity, hallmarkNo, purchaseDate, purchasePrice, '
  'jeweler, notes }';

-- `category` moves inside the envelope too. Left in the clear it would sort the
-- family's holdings into "necklaces, bangles, coins" for anyone reading the
-- table, which is most of what a thief wants to know.
alter table public.jewelry drop column category;

-- ----------------------------------------------------------------- events ----

alter table public.events add column enc bytea;
alter table public.events drop column name;
alter table public.events drop column location;
alter table public.events drop column notes;
comment on column public.events.enc is 'AES-GCM envelope: { name, location, notes }';

-- -------------------------------------------------------------- movements ----
-- Free-text locations become foreign keys, so history stays joinable while the
-- names it used to spell out live encrypted on the locker rows.

alter table public.movements add column from_locker_id uuid references public.lockers (id) on delete set null;
alter table public.movements add column to_locker_id   uuid references public.lockers (id) on delete set null;
alter table public.movements add column enc bytea;
alter table public.movements drop column from_location;
alter table public.movements drop column to_location;
alter table public.movements drop column reason;
comment on column public.movements.enc is 'AES-GCM envelope: { reason, jeweler }';

-- -------------------------------------------------------------- documents ----
-- `type` stays readable so the "no hallmark certificate on file" reminder can
-- still run without the key. The file name — often "Tanishq invoice 4.2 lakh"
-- — does not.

alter table public.documents add column enc bytea;
alter table public.documents drop column file_name;
comment on column public.documents.enc is 'AES-GCM envelope: { fileName }';

-- ---------------------------------------------------------- locker_visits ----

alter table public.locker_visits add column enc bytea;
alter table public.locker_visits drop column discrepancies;
alter table public.locker_visits drop column notes;
comment on column public.locker_visits.enc is 'AES-GCM envelope: { discrepancies[], notes }';

-- ------------------------------------------------------------- audit_logs ----
-- `detail` held sentences built from item and member names. Replaced by ids and
-- counts, which the client renders using data it has already decrypted. This is
-- the same trick `notifications` already used for language, now used for
-- secrecy: store what happened, never the words for it.

alter table public.audit_logs add column params jsonb not null default '{}'::jsonb;
alter table public.audit_logs drop column detail;
comment on column public.audit_logs.params is
  'Ids, counts and dates only. Never names, never free text — this column is '
  'readable by the server.';

comment on column public.notifications.params is
  'Ids, counts and dates only. The reminder Worker writes these without the '
  'key, and the client resolves ids to names after decrypting.';

-- ============================================== RLS on the new key tables ====

alter table public.member_public_keys enable row level security;
alter table public.member_keys        enable row level security;
alter table public.family_keys        enable row level security;
alter table public.member_devices     enable row level security;

-- New tables inherit the default grants the anon role would otherwise get.
revoke all on all tables in schema public from anon;

-- Public keys: visible family-wide, because that is how a new member gets let
-- in. Writable only by their owner.
create policy member_public_keys_select on public.member_public_keys
  for select to authenticated
  using (public.in_my_family(family_id));

create policy member_public_keys_insert on public.member_public_keys
  for insert to authenticated
  with check (member_id = auth.uid() and public.in_my_family(family_id));

create policy member_public_keys_update on public.member_public_keys
  for update to authenticated
  using (member_id = auth.uid())
  with check (member_id = auth.uid() and public.in_my_family(family_id));

-- Private keys: own row only, with no exception for admins. An admin who could
-- read these could read the vault, and the whole point is that nobody can.
create policy member_keys_select on public.member_keys
  for select to authenticated
  using (member_id = auth.uid());

create policy member_keys_insert on public.member_keys
  for insert to authenticated
  with check (member_id = auth.uid() and public.in_my_family(family_id));

create policy member_keys_update on public.member_keys
  for update to authenticated
  using (member_id = auth.uid())
  with check (member_id = auth.uid() and public.in_my_family(family_id));

-- Deliberately no update policy granting an admin write access to someone
-- else's row: letting an admin overwrite wrapped_private_key would lock that
-- member out. Admissions go through grant_family_key below, which touches only
-- the two wrap columns.

-- The recovery blob is family-readable — it is worthless without the printed
-- key — but only an admin may replace it, since replacing it is what
-- invalidates every printed copy.
create policy family_keys_select on public.family_keys
  for select to authenticated
  using (public.in_my_family(family_id));

create policy family_keys_insert on public.family_keys
  for insert to authenticated
  with check (public.in_my_family(family_id) and public.is_admin());

create policy family_keys_update on public.family_keys
  for update to authenticated
  using (public.in_my_family(family_id) and public.is_admin())
  with check (public.in_my_family(family_id));

-- Devices have NO select policy, which is deliberate and load-bearing. A policy
-- of `member_id = auth.uid()` would look right and would destroy the entire PIN
-- defence: the client could read wrapped_family_key straight off the table and
-- brute-force the six digits offline, never touching the attempt counter. The
-- blob is reachable only through begin_device_unlock, which charges for it.
-- list_devices() below returns the harmless columns for the settings screen.
create policy member_devices_delete on public.member_devices
  for delete to authenticated
  using (member_id = auth.uid() or (public.in_my_family(family_id) and public.is_admin()));

-- No insert or update policy either: enrolment goes through enroll_device, and
-- the attempt counter must not be resettable by the client that is failing it.

-- ========================================================= key management ====

-- Hands a newly-enrolled member the family key. Admin-only, and the admin does
-- the wrapping in their own browser — the server never sees an unwrapped key,
-- it only moves sealed envelopes between people.
create or replace function public.grant_family_key(
  p_member_id  uuid,
  p_wrapped    bytea,
  p_ephemeral  bytea,
  p_key_version int default 1
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_family uuid := public.require_family();
begin
  if not public.is_admin() then
    raise exception 'Only an admin can admit a member to the vault' using errcode = '42501';
  end if;

  perform 1 from public.members
    where id = p_member_id and family_id = v_family and is_active;
  if not found then
    raise exception 'Not an active member of this family' using errcode = '42501';
  end if;

  if p_wrapped is null or p_ephemeral is null then
    raise exception 'Both the wrapped key and its ephemeral public half are required'
      using errcode = '22023';
  end if;

  update public.member_keys set
    wrapped_family_key    = p_wrapped,
    wrap_ephemeral_public = p_ephemeral,
    key_version           = p_key_version,
    rotated_at            = now()
  where member_id = p_member_id;

  if not found then
    raise exception 'That member has not enrolled a key yet' using errcode = '22023';
  end if;

  perform public.write_audit(
    v_family, 'audit.grantedVaultAccess', 'user', p_member_id,
    jsonb_build_object('memberId', p_member_id, 'keyVersion', p_key_version)
  );
end;
$$;

-- Registers a PIN unlock for one device.
create or replace function public.enroll_device(
  p_label      text,
  p_wrapped    bytea,
  p_pin_salt   bytea,
  p_iterations int default 600000,
  p_key_version int default 1
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_family uuid := public.require_family();
  v_id     uuid;
begin
  if p_wrapped is null or p_pin_salt is null then
    raise exception 'A wrapped key and salt are required' using errcode = '22023';
  end if;
  -- Mirrors the table constraint so a caller gets a clear error rather than a
  -- constraint violation, and so nobody can quietly enrol with weak KDF work.
  if p_iterations < 600000 then
    raise exception 'Refusing fewer than 600000 KDF iterations' using errcode = '22023';
  end if;

  -- Six enrolments is a generous number of phones for one person and a cheap
  -- cap on someone farming wrapped copies of the key.
  if (select count(*) from public.member_devices where member_id = auth.uid()) >= 6 then
    raise exception 'Too many enrolled devices — revoke one first' using errcode = '22023';
  end if;

  insert into public.member_devices (
    member_id, family_id, label, wrapped_family_key, pin_salt, kdf_iterations, key_version
  ) values (
    auth.uid(), v_family, coalesce(p_label, ''), p_wrapped, p_pin_salt, p_iterations, p_key_version
  )
  returning id into v_id;

  perform public.write_audit(
    v_family, 'audit.enrolledDevice', 'user', auth.uid(),
    jsonb_build_object('deviceId', v_id)
  );

  return v_id;
end;
$$;

-- Hands back the wrapped key for a PIN attempt, and charges for it. The
-- increment happens BEFORE the blob is returned, so abandoning the request
-- mid-flight still costs an attempt — otherwise the counter would be trivially
-- bypassed by never finishing.
create or replace function public.begin_device_unlock(p_device_id uuid)
returns public.member_devices
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_dev public.member_devices;
begin
  select * into v_dev from public.member_devices
    where id = p_device_id and member_id = auth.uid()
    for update;
  if not found then
    raise exception 'Unknown device' using errcode = '42501';
  end if;

  if v_dev.locked_until is not null and v_dev.locked_until > now() then
    raise exception 'Too many wrong PINs. Locked until %', v_dev.locked_until
      using errcode = '42501';
  end if;

  -- Ten wrong guesses ends this enrolment. Recovering means signing in with the
  -- passphrase again, which is annoying and is meant to be.
  if v_dev.failed_attempts >= 10 then
    delete from public.member_devices where id = p_device_id;
    perform public.write_audit(
      v_dev.family_id, 'audit.deviceWiped', 'user', v_dev.member_id,
      jsonb_build_object('deviceId', p_device_id)
    );
    raise exception 'Device enrolment destroyed after repeated wrong PINs'
      using errcode = '42501';
  end if;

  update public.member_devices set
    failed_attempts = failed_attempts + 1,
    locked_until = case
      when failed_attempts + 1 >= 5 then now() + interval '15 minutes'
      else null
    end
  where id = p_device_id
  returning * into v_dev;

  return v_dev;
end;
$$;

-- Called once the PIN has actually decrypted something. Only a caller who
-- unwrapped the key can reach this, so it is safe to clear the counter here.
create or replace function public.complete_device_unlock(p_device_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.member_devices set
    failed_attempts = 0,
    locked_until    = null,
    last_used_at    = now()
  where id = p_device_id and member_id = auth.uid();

  if not found then
    raise exception 'Unknown device' using errcode = '42501';
  end if;
end;
$$;

-- Everything about a device except the one thing worth protecting. Exists
-- because member_devices has no select policy: the settings screen still needs
-- to show "Amma's phone, last used Tuesday" with a revoke button next to it.
create or replace function public.list_devices()
returns table (
  id           uuid,
  label        text,
  locked_until timestamptz,
  last_used_at timestamptz,
  created_at   timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select d.id, d.label, d.locked_until, d.last_used_at, d.created_at
  from public.member_devices d
  where d.member_id = auth.uid()
  order by d.created_at
$$;

-- ================================== state machine, without readable names ====
--
-- Every function below used to build sentences out of item and locker names for
-- its error messages and audit entries. Those names are ciphertext now, so the
-- functions speak in ids and the client — which holds the key — does the
-- wording. The transitions they enforce are unchanged.

drop function if exists public.write_audit(uuid, text, public.audit_entity, uuid, text);

create or replace function public.write_audit(
  p_family      uuid,
  p_action_key  text,
  p_entity_type public.audit_entity,
  p_entity_id   uuid,
  p_params      jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  insert into public.audit_logs (family_id, actor_id, action_key, entity_type, entity_id, params)
  values (p_family, auth.uid(), p_action_key, p_entity_type, p_entity_id,
          coalesce(p_params, '{}'::jsonb));
$$;

-- ------------------------------------------------------------- take out ----

drop function if exists public.take_out(uuid[], uuid, text, date, uuid);

create or replace function public.take_out(
  p_jewelry_ids     uuid[],
  p_holder_id       uuid,
  p_enc             bytea default null,   -- { reason }
  p_expected_return date default null,
  p_event_id        uuid default null
)
returns setof public.jewelry
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_family uuid := public.require_family();
  v_item   public.jewelry;
  v_from   uuid;
begin
  perform 1 from public.members
    where id = p_holder_id and family_id = v_family and is_active;
  if not found then
    raise exception 'Holder is not an active member of this family' using errcode = '42501';
  end if;

  if p_expected_return is not null and p_expected_return < current_date then
    raise exception 'Expected return date is in the past' using errcode = '22007';
  end if;

  foreach v_item.id in array p_jewelry_ids loop
    select * into v_item from public.jewelry
      where id = v_item.id and family_id = v_family for update;
    if not found then
      raise exception 'Item not found in this family' using errcode = '42501';
    end if;
    -- Only something sitting in a locker can leave one. The unique partial
    -- index on movements backs this up if two people act at the same moment.
    if v_item.status <> 'in_locker' then
      raise exception 'Cannot take out item %: it is %', v_item.id, v_item.status
        using errcode = '22023';
    end if;

    v_from := v_item.current_locker_id;

    insert into public.movements (
      family_id, jewelry_id, type, from_locker_id, to_locker_id,
      actor_id, holder_id, enc, expected_return_on, event_id
    ) values (
      v_family, v_item.id, 'takeout', v_from, null,
      auth.uid(), p_holder_id, p_enc, p_expected_return, p_event_id
    );

    update public.jewelry set
      status             = 'with_member',
      current_holder_id  = p_holder_id,
      current_locker_id  = null,
      expected_return_on = p_expected_return
    where id = v_item.id
    returning * into v_item;

    return next v_item;
  end loop;

  perform public.write_audit(
    v_family, 'audit.tookOut', 'movement', null,
    jsonb_build_object(
      'count',    coalesce(array_length(p_jewelry_ids, 1), 0),
      'holderId', p_holder_id,
      'itemIds',  to_jsonb(p_jewelry_ids)
    )
  );
end;
$$;

-- --------------------------------------------------------------- return ----

create or replace function public.return_items(
  p_jewelry_ids  uuid[],
  p_to_locker_id uuid
)
returns setof public.jewelry
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_family uuid := public.require_family();
  v_item   public.jewelry;
begin
  perform 1 from public.lockers
    where id = p_to_locker_id and family_id = v_family;
  if not found then
    raise exception 'Locker not found in this family' using errcode = '42501';
  end if;

  foreach v_item.id in array p_jewelry_ids loop
    select * into v_item from public.jewelry
      where id = v_item.id and family_id = v_family for update;
    if not found then
      raise exception 'Item not found in this family' using errcode = '42501';
    end if;
    if v_item.status <> 'with_member' then
      raise exception 'Cannot return item %: it is %', v_item.id, v_item.status
        using errcode = '22023';
    end if;

    update public.movements
      set returned_at = now(), to_locker_id = p_to_locker_id
      where jewelry_id = v_item.id and returned_at is null;

    update public.jewelry set
      status             = 'in_locker',
      current_locker_id  = p_to_locker_id,
      current_holder_id  = null,
      expected_return_on = null
    where id = v_item.id
    returning * into v_item;

    return next v_item;
  end loop;

  -- Putting things back means someone opened the locker, which also satisfies
  -- its verification reminder.
  update public.lockers set last_visited_on = current_date where id = p_to_locker_id;

  perform public.write_audit(
    v_family, 'audit.returned', 'movement', null,
    jsonb_build_object(
      'count',    coalesce(array_length(p_jewelry_ids, 1), 0),
      'lockerId', p_to_locker_id,
      'itemIds',  to_jsonb(p_jewelry_ids)
    )
  );
end;
$$;

-- -------------------------------------------------------- extend due date ----

create or replace function public.extend_return(
  p_jewelry_id uuid,
  p_new_date   date
)
returns public.jewelry
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_family uuid := public.require_family();
  v_item   public.jewelry;
  v_old    date;
begin
  select * into v_item from public.jewelry
    where id = p_jewelry_id and family_id = v_family for update;
  if not found then
    raise exception 'Item not found in this family' using errcode = '42501';
  end if;
  if v_item.status not in ('with_member', 'at_jeweler') then
    raise exception 'Nothing to extend: item % is %', v_item.id, v_item.status
      using errcode = '22023';
  end if;

  v_old := v_item.expected_return_on;

  update public.movements set expected_return_on = p_new_date
    where jewelry_id = p_jewelry_id and returned_at is null;

  update public.jewelry set expected_return_on = p_new_date
    where id = p_jewelry_id
    returning * into v_item;

  -- Logged as its own entry so the original promise stays visible rather than
  -- being silently rewritten.
  perform public.write_audit(
    v_family, 'audit.extendedDue', 'movement', p_jewelry_id,
    jsonb_build_object('itemId', p_jewelry_id, 'from', v_old, 'to', p_new_date)
  );

  return v_item;
end;
$$;

-- ------------------------------------------------------------- transfer ----

drop function if exists public.start_transfer(uuid[], uuid, text);

create or replace function public.start_transfer(
  p_jewelry_ids  uuid[],
  p_to_locker_id uuid,
  p_enc          bytea default null   -- { reason }
)
returns setof public.jewelry
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_family uuid := public.require_family();
  v_item   public.jewelry;
  v_from   uuid;
begin
  perform 1 from public.lockers
    where id = p_to_locker_id and family_id = v_family;
  if not found then
    raise exception 'Destination locker not found in this family' using errcode = '42501';
  end if;

  foreach v_item.id in array p_jewelry_ids loop
    select * into v_item from public.jewelry
      where id = v_item.id and family_id = v_family for update;
    if not found then
      raise exception 'Item not found in this family' using errcode = '42501';
    end if;
    if v_item.status <> 'in_locker' then
      raise exception 'Cannot transfer item %: it is %', v_item.id, v_item.status
        using errcode = '22023';
    end if;
    if v_item.current_locker_id = p_to_locker_id then
      raise exception 'Item % is already in that locker', v_item.id using errcode = '22023';
    end if;

    v_from := v_item.current_locker_id;

    insert into public.movements (
      family_id, jewelry_id, type, from_locker_id, to_locker_id, actor_id, enc
    ) values (
      v_family, v_item.id, 'transfer', v_from, p_to_locker_id, auth.uid(), p_enc
    );

    -- in_transit exists so an item is never invisible mid-move: the destination
    -- is already recorded, but it is not claimed to be there yet.
    update public.jewelry set
      status            = 'in_transit',
      current_locker_id = p_to_locker_id,
      current_holder_id = null
    where id = v_item.id
    returning * into v_item;

    return next v_item;
  end loop;

  perform public.write_audit(
    v_family, 'audit.startedTransfer', 'movement', null,
    jsonb_build_object(
      'count',    coalesce(array_length(p_jewelry_ids, 1), 0),
      'lockerId', p_to_locker_id,
      'itemIds',  to_jsonb(p_jewelry_ids)
    )
  );
end;
$$;

create or replace function public.confirm_arrival(p_jewelry_ids uuid[])
returns setof public.jewelry
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_family uuid := public.require_family();
  v_item   public.jewelry;
begin
  foreach v_item.id in array p_jewelry_ids loop
    select * into v_item from public.jewelry
      where id = v_item.id and family_id = v_family for update;
    if not found then
      raise exception 'Item not found in this family' using errcode = '42501';
    end if;
    if v_item.status <> 'in_transit' then
      raise exception 'Item % is not in transit', v_item.id using errcode = '22023';
    end if;

    update public.movements set returned_at = now()
      where jewelry_id = v_item.id and returned_at is null;

    update public.jewelry set status = 'in_locker'
      where id = v_item.id
      returning * into v_item;

    return next v_item;
  end loop;

  perform public.write_audit(
    v_family, 'audit.confirmedArrival', 'movement', null,
    jsonb_build_object(
      'count',   coalesce(array_length(p_jewelry_ids, 1), 0),
      'itemIds', to_jsonb(p_jewelry_ids)
    )
  );
end;
$$;

-- -------------------------------------------------------------- jeweler ----

drop function if exists public.send_to_jeweler(uuid, text, text, date);

create or replace function public.send_to_jeweler(
  p_jewelry_id      uuid,
  p_enc             bytea,               -- { jeweler, reason } — jeweler required
  p_expected_return date default null
)
returns public.jewelry
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_family uuid := public.require_family();
  v_item   public.jewelry;
  v_from   uuid;
begin
  -- The jeweler's name is inside the envelope now, so the server cannot check
  -- that it is non-empty. It can insist that something sealed was supplied;
  -- the client enforces the rest before encrypting.
  if p_enc is null or octet_length(p_enc) = 0 then
    raise exception 'Jeweler details are required' using errcode = '22023';
  end if;

  select * into v_item from public.jewelry
    where id = p_jewelry_id and family_id = v_family for update;
  if not found then
    raise exception 'Item not found in this family' using errcode = '42501';
  end if;
  if v_item.status <> 'in_locker' then
    raise exception 'Cannot send item %: it is %', v_item.id, v_item.status
      using errcode = '22023';
  end if;

  v_from := v_item.current_locker_id;

  insert into public.movements (
    family_id, jewelry_id, type, from_locker_id, to_locker_id,
    actor_id, enc, expected_return_on
  ) values (
    v_family, p_jewelry_id, 'service', v_from, null,
    auth.uid(), p_enc, p_expected_return
  );

  update public.jewelry set
    status             = 'at_jeweler',
    current_locker_id  = null,
    current_holder_id  = null,
    expected_return_on = p_expected_return
  where id = p_jewelry_id
  returning * into v_item;

  perform public.write_audit(
    v_family, 'audit.sentForService', 'jewelry', p_jewelry_id,
    jsonb_build_object('itemId', p_jewelry_id)
  );

  return v_item;
end;
$$;

create or replace function public.collect_from_jeweler(
  p_jewelry_id   uuid,
  p_to_locker_id uuid
)
returns public.jewelry
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_family uuid := public.require_family();
  v_item   public.jewelry;
begin
  perform 1 from public.lockers where id = p_to_locker_id and family_id = v_family;
  if not found then
    raise exception 'Locker not found in this family' using errcode = '42501';
  end if;

  select * into v_item from public.jewelry
    where id = p_jewelry_id and family_id = v_family for update;
  if not found then
    raise exception 'Item not found in this family' using errcode = '42501';
  end if;
  if v_item.status <> 'at_jeweler' then
    raise exception 'Item % is not at a jeweler', v_item.id using errcode = '22023';
  end if;

  update public.movements set returned_at = now(), to_locker_id = p_to_locker_id
    where jewelry_id = p_jewelry_id and returned_at is null;

  update public.jewelry set
    status             = 'in_locker',
    current_locker_id  = p_to_locker_id,
    expected_return_on = null
  where id = p_jewelry_id
  returning * into v_item;

  perform public.write_audit(
    v_family, 'audit.collectedFromJeweler', 'jewelry', p_jewelry_id,
    jsonb_build_object('itemId', p_jewelry_id, 'lockerId', p_to_locker_id)
  );

  return v_item;
end;
$$;

-- ----------------------------------------------------------------- lost ----

drop function if exists public.mark_lost(uuid, text);

create or replace function public.mark_lost(p_jewelry_id uuid, p_enc bytea)
returns public.jewelry
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_family uuid := public.require_family();
  v_item   public.jewelry;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can mark an item lost' using errcode = '42501';
  end if;
  if p_enc is null or octet_length(p_enc) = 0 then
    raise exception 'A reason is required' using errcode = '22023';
  end if;

  select * into v_item from public.jewelry
    where id = p_jewelry_id and family_id = v_family for update;
  if not found then
    raise exception 'Item not found in this family' using errcode = '42501';
  end if;

  insert into public.movements (family_id, jewelry_id, type, actor_id, enc)
  values (v_family, p_jewelry_id, 'lost', auth.uid(), p_enc);

  update public.jewelry set
    status            = 'lost',
    current_locker_id = null,
    current_holder_id = null
  where id = p_jewelry_id
  returning * into v_item;

  perform public.write_audit(
    v_family, 'audit.markedLost', 'jewelry', p_jewelry_id,
    jsonb_build_object('itemId', p_jewelry_id)
  );

  return v_item;
end;
$$;

-- -------------------------------------------------------- locker visits ----

drop function if exists public.record_locker_visit(uuid, jsonb, text);

create or replace function public.record_locker_visit(
  p_locker_id uuid,
  p_enc       bytea default null   -- { discrepancies[], notes }
)
returns public.locker_visits
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_family uuid := public.require_family();
  v_visit  public.locker_visits;
begin
  perform 1 from public.lockers
    where id = p_locker_id and family_id = v_family;
  if not found then
    raise exception 'Locker not found in this family' using errcode = '42501';
  end if;

  insert into public.locker_visits (family_id, locker_id, visited_by, enc)
  values (v_family, p_locker_id, auth.uid(), p_enc)
  returning * into v_visit;

  update public.lockers set last_visited_on = current_date where id = p_locker_id;

  perform public.write_audit(
    v_family, 'audit.verifiedLocker', 'locker', p_locker_id,
    jsonb_build_object('lockerId', p_locker_id)
  );

  return v_visit;
end;
$$;

-- ------------------------------------------------------------ gold rate ----
-- The market price of gold is public knowledge, so it stays readable. What it
-- multiplies is not.

create or replace function public.set_gold_rate(p_rate numeric)
returns public.families
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_family uuid := public.require_family();
  v_old    numeric;
  v_row    public.families;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can change the gold rate' using errcode = '42501';
  end if;
  if p_rate is null or p_rate <= 0 then
    raise exception 'Rate must be greater than zero' using errcode = '22023';
  end if;

  select gold_rate_per_gram_24k into v_old from public.families where id = v_family;

  update public.families
    set gold_rate_per_gram_24k = p_rate,
        gold_rate_updated_on   = current_date
    where id = v_family
    returning * into v_row;

  insert into public.valuations (family_id, gold_rate_per_gram_24k, recorded_by)
  values (v_family, p_rate, auth.uid());

  perform public.write_audit(
    v_family, 'audit.updatedGoldRate', 'settings', v_family,
    jsonb_build_object('from', v_old, 'to', p_rate)
  );

  return v_row;
end;
$$;

-- ================================================= bootstrap, re-issued ====
-- 0005 created the first family with a plaintext name. There is no plaintext
-- name column any more: the founder's browser generates the family key, seals
-- the name with it, and writes it back.

drop function if exists public.bootstrap_family(text, text);

create or replace function public.bootstrap_family(p_display_name text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_family uuid;
  v_email  text;
begin
  if auth.uid() is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;

  perform 1 from public.members where id = auth.uid();
  if found then
    raise exception 'You already belong to a family' using errcode = '22023';
  end if;

  select email into v_email from auth.users where id = auth.uid();

  insert into public.families default values returning id into v_family;

  insert into public.members (id, family_id, display_name, email, role, initials)
  values (
    auth.uid(), v_family, coalesce(nullif(trim(p_display_name), ''), 'Admin'),
    coalesce(v_email, ''), 'admin',
    upper(left(coalesce(nullif(trim(p_display_name), ''), 'A'), 2))
  );

  perform public.write_audit(
    v_family, 'audit.createdFamily', 'settings', v_family, '{}'::jsonb
  );

  return v_family;
end;
$$;

-- ---------------------------------------------------------------- grants ----
-- Re-issued because every signature above changed, and a grant is tied to a
-- signature. anon still gets nothing.

revoke execute on all functions in schema public from public, anon;

grant execute on function public.require_family()                          to authenticated;
grant execute on function public.current_family_id()                       to authenticated;
grant execute on function public.is_admin()                                to authenticated;
grant execute on function public.in_my_family(uuid)                        to authenticated;

-- storage_family must be granted explicitly here, and forgetting it breaks
-- photos in a way that is hard to trace back.
--
-- It is created in 0004, which runs after 0003's blanket revoke, so until now
-- it survived on the default PUBLIC execute grant nobody had taken away. The
-- revoke above runs after 0004 and does take it away. A policy expression is
-- evaluated as the calling role, so without this line every storage policy
-- calling storage_family() fails with "permission denied for function" — and
-- the symptom is photos silently not loading, not an error mentioning grants.
grant execute on function public.storage_family(text)                      to authenticated;

grant execute on function public.take_out(uuid[], uuid, bytea, date, uuid) to authenticated;
grant execute on function public.return_items(uuid[], uuid)                to authenticated;
grant execute on function public.extend_return(uuid, date)                 to authenticated;
grant execute on function public.start_transfer(uuid[], uuid, bytea)       to authenticated;
grant execute on function public.confirm_arrival(uuid[])                   to authenticated;
grant execute on function public.send_to_jeweler(uuid, bytea, date)        to authenticated;
grant execute on function public.collect_from_jeweler(uuid, uuid)          to authenticated;
grant execute on function public.mark_lost(uuid, bytea)                    to authenticated;
grant execute on function public.record_locker_visit(uuid, bytea)          to authenticated;
grant execute on function public.set_gold_rate(numeric)                    to authenticated;

grant execute on function public.grant_family_key(uuid, bytea, bytea, int) to authenticated;
grant execute on function public.enroll_device(text, bytea, bytea, int, int) to authenticated;
grant execute on function public.begin_device_unlock(uuid)                 to authenticated;
grant execute on function public.complete_device_unlock(uuid)              to authenticated;
grant execute on function public.list_devices()                            to authenticated;
grant execute on function public.bootstrap_family(text)                    to authenticated;
