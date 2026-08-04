-- Proof that Row Level Security actually isolates families, and that the
-- encryption key tables do not leak.
--
-- With no application server, these policies are the whole security model, so
-- "the policies look right" is not good enough. This script creates two
-- families, acts as a member of each, and asserts what they can and cannot do.
--
-- Run it in the Supabase SQL editor. Everything happens inside a transaction
-- that ROLLBACKs at the end, so it leaves no trace in your data.
--
-- Expected result: a list of PASS notices and no error. Any failure raises and
-- aborts, so "it completed" and "it passed" are the same thing.
--
-- UUIDs are written out in full rather than bound to \set variables. \set is a
-- psql client meta-command; the Supabase SQL editor is not psql and would fail
-- on the first one.

begin;

-- ------------------------------------------------------------ fixtures ----
--
--   Family A  11111111-…   Alice  aaaaaaaa-… (admin)
--                          Arun   cccccccc-… (member)
--   Family B  22222222-…   Bob    bbbbbbbb-… (admin)

insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'alice@test.invalid', '', now(), now(), now()),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'arun@test.invalid',  '', now(), now(), now()),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'bob@test.invalid',   '', now(), now(), now());

-- `enc` is opaque here on purpose: these tests are about who can reach the
-- bytes, not what is in them. Real envelopes are built in the browser.
insert into public.families (id, enc) values
  ('11111111-1111-1111-1111-111111111111', '\x01aaaa'::bytea),
  ('22222222-2222-2222-2222-222222222222', '\x01bbbb'::bytea);

insert into public.members (id, family_id, display_name, email, role) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111',
   'Alice', 'alice@test.invalid', 'admin'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', '11111111-1111-1111-1111-111111111111',
   'Arun',  'arun@test.invalid',  'member'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222',
   'Bob',   'bob@test.invalid',   'admin');

insert into public.lockers (id, family_id, enc) values
  ('a1111111-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', '\x01a10c'::bytea),
  ('b1111111-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', '\x01b10c'::bytea);

insert into public.jewelry (id, family_id, enc, owner_id, status, current_locker_id) values
  ('a2222222-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   '\x01a17e'::bytea, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'in_locker',
   'a1111111-0000-0000-0000-000000000001'),
  ('b2222222-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222',
   '\x01b17e'::bytea, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'in_locker',
   'b1111111-0000-0000-0000-000000000001');

-- Key material. Again opaque — what matters is the reachability, not the maths.
insert into public.member_public_keys (member_id, family_id, public_key) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', '\x01a1'::bytea),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', '11111111-1111-1111-1111-111111111111', '\x01c1'::bytea),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', '\x01b1'::bytea);

insert into public.member_keys
  (member_id, family_id, wrapped_private_key, passphrase_salt) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111',
   '\x01a1c0ffee'::bytea, '\x0a'::bytea),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', '11111111-1111-1111-1111-111111111111',
   '\x01c1c0ffee'::bytea, '\x0c'::bytea),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222',
   '\x01b1c0ffee'::bytea, '\x0b'::bytea);

-- ------------------------------------------------- 1. read isolation ----

set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';

do $$
declare n int;
begin
  select count(*) into n from public.jewelry;
  if n <> 1 then
    raise exception 'FAIL: Alice sees % jewelry rows, expected only her own 1', n;
  end if;

  select count(*) into n from public.jewelry where family_id = '22222222-2222-2222-2222-222222222222';
  if n <> 0 then
    raise exception 'FAIL: Alice can see Family B jewelry';
  end if;

  select count(*) into n from public.lockers;
  if n <> 1 then raise exception 'FAIL: Alice sees % lockers, expected 1', n; end if;

  select count(*) into n from public.members;
  if n <> 2 then raise exception 'FAIL: Alice sees % members, expected 2', n; end if;

  select count(*) into n from public.families;
  if n <> 1 then raise exception 'FAIL: Alice sees % families, expected 1', n; end if;

  raise notice 'PASS  read isolation — Alice sees only Family A';
end;
$$;

-- --------------------------------------- 2. cannot write across families ----

do $$
declare n int;
begin
  -- Targeting another family's id must be rejected by WITH CHECK.
  begin
    insert into public.jewelry (family_id, enc, status, current_locker_id)
    values ('22222222-2222-2222-2222-222222222222', '\x01ff'::bytea, 'in_locker',
            'b1111111-0000-0000-0000-000000000001');
    raise exception 'FAIL: Alice inserted jewelry into Family B';
  exception
    when insufficient_privilege then null;   -- expected
  end;

  -- An UPDATE that cannot see the row simply affects nothing, which is the
  -- correct outcome but worth asserting rather than assuming.
  update public.jewelry set enc = '\x01dead'::bytea
    where id = 'b2222222-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'FAIL: Alice modified % Family B rows', n;
  end if;

  raise notice 'PASS  write isolation — Alice cannot touch Family B';
end;
$$;

-- ------------------------------------------- 3. movement history is fixed ----

do $$
begin
  begin
    insert into public.movements (family_id, jewelry_id, type)
    values ('11111111-1111-1111-1111-111111111111',
            'a2222222-0000-0000-0000-000000000001', 'takeout');
    raise exception 'FAIL: a movement row was inserted directly';
  exception
    when insufficient_privilege then null;   -- expected: no insert policy exists
  end;
  raise notice 'PASS  movements are append-only via functions, not direct writes';
end;
$$;

-- ---------------------------------------------- 4. state machine enforced ----

do $$
declare v_status public.item_status;
begin
  perform public.take_out(
    array['a2222222-0000-0000-0000-000000000001']::uuid[],
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
    '\x01726561736f6e'::bytea, current_date + 3, null
  );

  select status into v_status from public.jewelry
    where id = 'a2222222-0000-0000-0000-000000000001';
  if v_status <> 'with_member' then
    raise exception 'FAIL: expected with_member after take_out, got %', v_status;
  end if;

  -- Second takeout must fail: it is already out. This is the double-checkout
  -- case the unique partial index and the status guard exist to prevent.
  begin
    perform public.take_out(
      array['a2222222-0000-0000-0000-000000000001']::uuid[],
      'cccccccc-cccc-cccc-cccc-cccccccccccc',
      null, current_date + 3, null
    );
    raise exception 'FAIL: the same item was taken out twice';
  exception
    when sqlstate '22023' then null;   -- expected
  end;

  raise notice 'PASS  state machine — take_out works once and refuses a repeat';
end;
$$;

-- ------------------------------------- 5. cross-family function call fails ----

do $$
begin
  begin
    perform public.take_out(
      array['b2222222-0000-0000-0000-000000000001']::uuid[],
      'cccccccc-cccc-cccc-cccc-cccccccccccc',
      null, current_date + 3, null
    );
    raise exception 'FAIL: Alice took out a Family B item through the RPC';
  exception
    when insufficient_privilege then null;   -- expected
  end;
  raise notice 'PASS  SECURITY DEFINER functions re-check family membership';
end;
$$;

-- ---------------------------------- 6. audit entries carry no readable text ----
-- The whole point of replacing `detail` with `params`: the server writes the
-- log without ever holding a name.

do $$
declare v_params jsonb;
begin
  select params into v_params from public.audit_logs
    where action_key = 'audit.tookOut' order by at desc limit 1;
  if v_params is null then
    raise exception 'FAIL: take_out wrote no audit entry';
  end if;
  if v_params ? 'name' or v_params ? 'detail' then
    raise exception 'FAIL: audit params contain readable text: %', v_params;
  end if;
  if not (v_params ? 'holderId') then
    raise exception 'FAIL: audit params lost the holder reference: %', v_params;
  end if;
  raise notice 'PASS  audit log stores ids and counts, never names';
end;
$$;

-- --------------------------------------- 7. private key material is sealed ----

do $$
declare n int;
begin
  -- Alice is an admin. She still must not see Arun's wrapped private key —
  -- if she could, an admin could open the vault without anyone's passphrase.
  select count(*) into n from public.member_keys;
  if n <> 1 then
    raise exception 'FAIL: Alice sees % member_keys rows, expected only her own', n;
  end if;

  select count(*) into n from public.member_keys
    where member_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  if n <> 0 then
    raise exception 'FAIL: an admin can read another member''s wrapped private key';
  end if;

  -- Public keys are a different matter: admitting a new member needs theirs.
  select count(*) into n from public.member_public_keys;
  if n <> 2 then
    raise exception 'FAIL: Alice sees % public keys in her family, expected 2', n;
  end if;

  -- And nothing at all from the other family.
  select count(*) into n from public.member_public_keys
    where family_id = '22222222-2222-2222-2222-222222222222';
  if n <> 0 then
    raise exception 'FAIL: public keys leak across families';
  end if;

  raise notice 'PASS  private keys are owner-only; public keys are family-wide';
end;
$$;

-- ------------------------------- 8. the PIN blob is not directly selectable ----
-- This is the one that keeps a six-digit PIN defensible. If member_devices ever
-- gains a select policy, the blob can be pulled and attacked offline, and this
-- assertion is what catches that mistake.

do $$
declare
  n   int;
  dev uuid;
begin
  dev := public.enroll_device('Test phone', '\x01c0ffee'::bytea, '\x0abc'::bytea, 600000, 1);

  select count(*) into n from public.member_devices;
  if n <> 0 then
    raise exception 'FAIL: member_devices is directly selectable — the PIN can be attacked offline';
  end if;

  -- The harmless columns are still reachable, through a function that does not
  -- return the wrapped key.
  select count(*) into n from public.list_devices();
  if n <> 1 then
    raise exception 'FAIL: list_devices returned % rows, expected 1', n;
  end if;

  raise notice 'PASS  wrapped device key is unreachable except through begin_device_unlock';
end;
$$;

-- --------------------------------------------- 9. PIN attempts are counted ----

do $$
declare
  dev uuid;
  i   int;
begin
  select id into dev from public.list_devices() limit 1;

  -- Five attempts are allowed; the fifth sets the lock.
  for i in 1..5 loop
    perform public.begin_device_unlock(dev);
  end loop;

  begin
    perform public.begin_device_unlock(dev);
    raise exception 'FAIL: a sixth PIN attempt was allowed — there is no rate limit';
  exception
    when insufficient_privilege then null;   -- expected: locked out
  end;

  raise notice 'PASS  five wrong PINs lock the device';
end;
$$;

-- ------------------------------------------ 10. member vs admin rights ----

set local request.jwt.claims = '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc","role":"authenticated"}';

do $$
begin
  -- Arun is a plain member: he can move jewelry but not add or write it off.
  begin
    insert into public.jewelry (family_id, enc, status, current_locker_id)
    values ('11111111-1111-1111-1111-111111111111', '\x01ee'::bytea, 'in_locker',
            'a1111111-0000-0000-0000-000000000001');
    raise exception 'FAIL: a non-admin inserted jewelry';
  exception
    when insufficient_privilege then null;   -- expected
  end;

  begin
    perform public.mark_lost('a2222222-0000-0000-0000-000000000001', '\x01ff'::bytea);
    raise exception 'FAIL: a non-admin marked an item lost';
  exception
    when insufficient_privilege then null;   -- expected
  end;

  -- Nor may he admit somebody to the vault.
  begin
    perform public.grant_family_key(
      'cccccccc-cccc-cccc-cccc-cccccccccccc', '\x01aa'::bytea, '\x01bb'::bytea, 1);
    raise exception 'FAIL: a non-admin granted vault access';
  exception
    when insufficient_privilege then null;   -- expected
  end;

  -- But returning an item is squarely his job.
  perform public.return_items(
    array['a2222222-0000-0000-0000-000000000001']::uuid[],
    'a1111111-0000-0000-0000-000000000001'
  );

  raise notice 'PASS  roles — member can return items, cannot add, write off or admit';
end;
$$;

-- ------------------------------------------ 11. the other family is intact ----

set local request.jwt.claims = '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';

do $$
declare n int; blob bytea;
begin
  select count(*) into n from public.jewelry;
  if n <> 1 then raise exception 'FAIL: Bob sees % rows, expected 1', n; end if;

  select enc into blob from public.jewelry limit 1;
  if blob <> '\x01b17e'::bytea then
    raise exception 'FAIL: Family B data was altered — enc is now %', blob;
  end if;

  select count(*) into n from public.member_keys;
  if n <> 1 then
    raise exception 'FAIL: Bob sees % member_keys rows, expected only his own', n;
  end if;

  raise notice 'PASS  Family B is untouched by everything Family A did';
end;
$$;

reset role;

do $$ begin raise notice '--- all RLS and key isolation checks passed ---'; end; $$;

-- Nothing above is kept.
rollback;
