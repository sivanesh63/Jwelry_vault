-- Proof that Row Level Security actually isolates families.
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

begin;

-- ------------------------------------------------------------ fixtures ----

\set fam_a  '11111111-1111-1111-1111-111111111111'
\set fam_b  '22222222-2222-2222-2222-222222222222'
\set alice  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
\set arun   'cccccccc-cccc-cccc-cccc-cccccccccccc'
\set bob    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'

insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at)
values
  (:'alice', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'alice@test.invalid', '', now(), now(), now()),
  (:'arun',  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'arun@test.invalid',  '', now(), now(), now()),
  (:'bob',   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'bob@test.invalid',   '', now(), now(), now());

insert into public.families (id, name) values
  (:'fam_a', 'Family A'),
  (:'fam_b', 'Family B');

insert into public.members (id, family_id, display_name, email, role) values
  (:'alice', :'fam_a', 'Alice', 'alice@test.invalid', 'admin'),
  (:'arun',  :'fam_a', 'Arun',  'arun@test.invalid',  'member'),
  (:'bob',   :'fam_b', 'Bob',   'bob@test.invalid',   'admin');

insert into public.lockers (id, family_id, name) values
  ('a1111111-0000-0000-0000-000000000001', :'fam_a', 'A Locker'),
  ('b1111111-0000-0000-0000-000000000001', :'fam_b', 'B Locker');

insert into public.jewelry (id, family_id, name, owner_id, status, current_locker_id, net_gold_weight) values
  ('a2222222-0000-0000-0000-000000000001', :'fam_a', 'A Necklace', :'alice', 'in_locker',
   'a1111111-0000-0000-0000-000000000001', 50),
  ('b2222222-0000-0000-0000-000000000001', :'fam_b', 'B Necklace', :'bob', 'in_locker',
   'b1111111-0000-0000-0000-000000000001', 50);

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
    insert into public.jewelry (family_id, name, status, current_locker_id)
    values ('22222222-2222-2222-2222-222222222222', 'Smuggled', 'in_locker',
            'b1111111-0000-0000-0000-000000000001');
    raise exception 'FAIL: Alice inserted jewelry into Family B';
  exception
    when insufficient_privilege then null;   -- expected
  end;

  -- An UPDATE that cannot see the row simply affects nothing, which is the
  -- correct outcome but worth asserting rather than assuming.
  update public.jewelry set name = 'Renamed'
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
    'Testing', current_date + 3, null
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
      'Again', current_date + 3, null
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
      'Reaching across', current_date + 3, null
    );
    raise exception 'FAIL: Alice took out a Family B item through the RPC';
  exception
    when insufficient_privilege then null;   -- expected
  end;
  raise notice 'PASS  SECURITY DEFINER functions re-check family membership';
end;
$$;

-- ----------------------------------------------- 6. member vs admin rights ----

set local request.jwt.claims = '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc","role":"authenticated"}';

do $$
begin
  -- Arun is a plain member: he can move jewelry but not add or rename it.
  begin
    insert into public.jewelry (family_id, name, status, current_locker_id)
    values ('11111111-1111-1111-1111-111111111111', 'Member added', 'in_locker',
            'a1111111-0000-0000-0000-000000000001');
    raise exception 'FAIL: a non-admin inserted jewelry';
  exception
    when insufficient_privilege then null;   -- expected
  end;

  begin
    perform public.mark_lost('a2222222-0000-0000-0000-000000000001', 'test');
    raise exception 'FAIL: a non-admin marked an item lost';
  exception
    when insufficient_privilege then null;   -- expected
  end;

  -- But returning an item is squarely his job.
  perform public.return_items(
    array['a2222222-0000-0000-0000-000000000001']::uuid[],
    'a1111111-0000-0000-0000-000000000001'
  );

  raise notice 'PASS  roles — member can return items, cannot add or write off';
end;
$$;

-- ------------------------------------------ 7. the other family is intact ----

set local request.jwt.claims = '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';

do $$
declare n int; nm text;
begin
  select count(*) into n from public.jewelry;
  if n <> 1 then raise exception 'FAIL: Bob sees % rows, expected 1', n; end if;

  select name into nm from public.jewelry limit 1;
  if nm <> 'B Necklace' then
    raise exception 'FAIL: Family B data was altered — name is now %', nm;
  end if;

  raise notice 'PASS  Family B is untouched by everything Family A did';
end;
$$;

reset role;

do $$ begin raise notice '--- all RLS isolation checks passed ---'; end; $$;

-- Nothing above is kept.
rollback;
