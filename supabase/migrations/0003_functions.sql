-- Movement state machine
--
-- Custody changes run here rather than as client-side updates, for three
-- reasons: the transitions stay enforced even if someone talks to the API
-- directly, each change writes its movement row and audit entry atomically, and
-- `movements` can stay append-only with no write policy at all.
--
-- Every function is SECURITY DEFINER, which means RLS does not apply inside it.
-- So each one re-checks family membership itself — that check is the only thing
-- standing between a caller and another family's data.
--
--        ┌──────────────────────────────────────┐
--        │                                      │
--   in_locker ──takeout──▶ with_member ──return─┤
--        │                                      │
--        ├──transfer──▶ in_transit ──arrive─────┤
--        │                                      │
--        └──service───▶ at_jeweler ──collect────┘
--
--   any ──▶ lost   (admin only, requires a reason)

-- Resolves the caller's family, refusing anyone who is not an active member.
create or replace function public.require_family()
returns uuid
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_family uuid;
begin
  v_family := public.current_family_id();
  if v_family is null then
    raise exception 'Not an active member of any family'
      using errcode = '42501';
  end if;
  return v_family;
end;
$$;

-- Writes an audit entry. `detail` is built from proper nouns, numbers and
-- arrows rather than sentences, so it reads the same in English and Tamil.
create or replace function public.write_audit(
  p_family      uuid,
  p_action_key  text,
  p_entity_type public.audit_entity,
  p_entity_id   uuid,
  p_detail      text
)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  insert into public.audit_logs (family_id, actor_id, action_key, entity_type, entity_id, detail)
  values (p_family, auth.uid(), p_action_key, p_entity_type, p_entity_id, coalesce(p_detail, ''));
$$;

-- ------------------------------------------------------------- take out ----

create or replace function public.take_out(
  p_jewelry_ids      uuid[],
  p_holder_id        uuid,
  p_reason           text default null,
  p_expected_return  date default null,
  p_event_id         uuid default null
)
returns setof public.jewelry
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_family uuid := public.require_family();
  v_holder public.members;
  v_item   public.jewelry;
  v_from   text;
begin
  select * into v_holder from public.members
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
      raise exception 'Cannot take out "%": it is %', v_item.name, v_item.status
        using errcode = '22023';
    end if;

    select name into v_from from public.lockers where id = v_item.current_locker_id;

    insert into public.movements (
      family_id, jewelry_id, type, from_location, to_location,
      actor_id, holder_id, reason, expected_return_on, event_id
    ) values (
      v_family, v_item.id, 'takeout', coalesce(v_from, '—'), v_holder.display_name,
      auth.uid(), p_holder_id, p_reason, p_expected_return, p_event_id
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
    array_length(p_jewelry_ids, 1) || ' × → ' || v_holder.display_name
      || coalesce(' (' || nullif(p_reason, '') || ')', '')
  );
end;
$$;

-- --------------------------------------------------------------- return ----
-- Takes an array, so returning 3 of 5 items is a first-class action rather than
-- something the caller has to fake with five separate calls.

create or replace function public.return_items(
  p_jewelry_ids uuid[],
  p_to_locker_id uuid
)
returns setof public.jewelry
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_family uuid := public.require_family();
  v_locker public.lockers;
  v_item   public.jewelry;
begin
  select * into v_locker from public.lockers
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
      raise exception 'Cannot return "%": it is %', v_item.name, v_item.status
        using errcode = '22023';
    end if;

    update public.movements
      set returned_at = now()
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
    array_length(p_jewelry_ids, 1) || ' × → ' || v_locker.name
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
    raise exception 'Nothing to extend: "%" is %', v_item.name, v_item.status
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
    v_item.name || ' · ' || coalesce(v_old::text, '—') || ' → ' || p_new_date::text
  );

  return v_item;
end;
$$;

-- ------------------------------------------------------------- transfer ----

create or replace function public.start_transfer(
  p_jewelry_ids  uuid[],
  p_to_locker_id uuid,
  p_reason       text default null
)
returns setof public.jewelry
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_family uuid := public.require_family();
  v_to     public.lockers;
  v_item   public.jewelry;
  v_from   text;
begin
  select * into v_to from public.lockers
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
      raise exception 'Cannot transfer "%": it is %', v_item.name, v_item.status
        using errcode = '22023';
    end if;
    if v_item.current_locker_id = p_to_locker_id then
      raise exception '"%" is already in that locker', v_item.name using errcode = '22023';
    end if;

    select name into v_from from public.lockers where id = v_item.current_locker_id;

    insert into public.movements (
      family_id, jewelry_id, type, from_location, to_location, actor_id, reason
    ) values (
      v_family, v_item.id, 'transfer', coalesce(v_from, '—'), v_to.name, auth.uid(), p_reason
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
    array_length(p_jewelry_ids, 1) || ' × → ' || v_to.name
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
      raise exception '"%" is not in transit', v_item.name using errcode = '22023';
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
    array_length(p_jewelry_ids, 1) || ' ×'
  );
end;
$$;

-- -------------------------------------------------------------- jeweler ----

create or replace function public.send_to_jeweler(
  p_jewelry_id      uuid,
  p_jeweler         text,
  p_reason          text default null,
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
  v_from   text;
begin
  if coalesce(trim(p_jeweler), '') = '' then
    raise exception 'A jeweler name is required' using errcode = '22023';
  end if;

  select * into v_item from public.jewelry
    where id = p_jewelry_id and family_id = v_family for update;
  if not found then
    raise exception 'Item not found in this family' using errcode = '42501';
  end if;
  if v_item.status <> 'in_locker' then
    raise exception 'Cannot send "%": it is %', v_item.name, v_item.status
      using errcode = '22023';
  end if;

  select name into v_from from public.lockers where id = v_item.current_locker_id;

  insert into public.movements (
    family_id, jewelry_id, type, from_location, to_location,
    actor_id, reason, expected_return_on
  ) values (
    v_family, p_jewelry_id, 'service', coalesce(v_from, '—'), p_jeweler,
    auth.uid(), p_reason, p_expected_return
  );

  update public.jewelry set
    status             = 'at_jeweler',
    current_locker_id  = null,
    current_holder_id  = null,
    jeweler            = p_jeweler,
    expected_return_on = p_expected_return
  where id = p_jewelry_id
  returning * into v_item;

  perform public.write_audit(
    v_family, 'audit.sentForService', 'jewelry', p_jewelry_id,
    v_item.name || ' → ' || p_jeweler
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
    raise exception '"%" is not at a jeweler', v_item.name using errcode = '22023';
  end if;

  update public.movements set returned_at = now()
    where jewelry_id = p_jewelry_id and returned_at is null;

  update public.jewelry set
    status             = 'in_locker',
    current_locker_id  = p_to_locker_id,
    expected_return_on = null
  where id = p_jewelry_id
  returning * into v_item;

  perform public.write_audit(
    v_family, 'audit.collectedFromJeweler', 'jewelry', p_jewelry_id, v_item.name
  );

  return v_item;
end;
$$;

-- ----------------------------------------------------------------- lost ----
-- Admin-only and irreversible by design: this is the one transition that should
-- feel heavy.

create or replace function public.mark_lost(p_jewelry_id uuid, p_reason text)
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
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'A reason is required' using errcode = '22023';
  end if;

  select * into v_item from public.jewelry
    where id = p_jewelry_id and family_id = v_family for update;
  if not found then
    raise exception 'Item not found in this family' using errcode = '42501';
  end if;

  insert into public.movements (family_id, jewelry_id, type, from_location, to_location, actor_id, reason)
  values (v_family, p_jewelry_id, 'lost', '—', '—', auth.uid(), p_reason);

  update public.jewelry set
    status            = 'lost',
    current_locker_id = null,
    current_holder_id = null
  where id = p_jewelry_id
  returning * into v_item;

  perform public.write_audit(
    v_family, 'audit.markedLost', 'jewelry', p_jewelry_id, v_item.name || ' · ' || p_reason
  );

  return v_item;
end;
$$;

-- -------------------------------------------------------- locker visits ----

create or replace function public.record_locker_visit(
  p_locker_id     uuid,
  p_discrepancies jsonb default '[]'::jsonb,
  p_notes         text  default null
)
returns public.locker_visits
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_family uuid := public.require_family();
  v_locker public.lockers;
  v_visit  public.locker_visits;
begin
  select * into v_locker from public.lockers
    where id = p_locker_id and family_id = v_family;
  if not found then
    raise exception 'Locker not found in this family' using errcode = '42501';
  end if;

  insert into public.locker_visits (family_id, locker_id, visited_by, discrepancies, notes)
  values (v_family, p_locker_id, auth.uid(), coalesce(p_discrepancies, '[]'::jsonb), p_notes)
  returning * into v_visit;

  update public.lockers set last_visited_on = current_date where id = p_locker_id;

  perform public.write_audit(
    v_family, 'audit.verifiedLocker', 'locker', p_locker_id, v_locker.name
  );

  return v_visit;
end;
$$;

-- ------------------------------------------------------------ gold rate ----
-- Updating the rate also snapshots it, so past valuations stay answerable.

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
    '₹' || coalesce(v_old, 0)::text || ' → ₹' || p_rate::text
  );

  return v_row;
end;
$$;

-- ---------------------------------------------------------------- grants ----
-- anon gets nothing: an unauthenticated caller must not be able to move gold.

revoke execute on all functions in schema public from public, anon;

grant execute on function public.require_family()                                    to authenticated;
grant execute on function public.take_out(uuid[], uuid, text, date, uuid)             to authenticated;
grant execute on function public.return_items(uuid[], uuid)                           to authenticated;
grant execute on function public.extend_return(uuid, date)                            to authenticated;
grant execute on function public.start_transfer(uuid[], uuid, text)                   to authenticated;
grant execute on function public.confirm_arrival(uuid[])                              to authenticated;
grant execute on function public.send_to_jeweler(uuid, text, text, date)              to authenticated;
grant execute on function public.collect_from_jeweler(uuid, uuid)                     to authenticated;
grant execute on function public.mark_lost(uuid, text)                                to authenticated;
grant execute on function public.record_locker_visit(uuid, jsonb, text)               to authenticated;
grant execute on function public.set_gold_rate(numeric)                               to authenticated;
grant execute on function public.current_family_id()                                  to authenticated;
grant execute on function public.is_admin()                                           to authenticated;
grant execute on function public.in_my_family(uuid)                                   to authenticated;
