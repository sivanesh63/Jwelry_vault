-- Everyone runs the vault; only admins decide who is in it
--
-- The original split made adding jewelry, configuring lockers and changing the
-- gold rate admin-only. That is the right shape for an organisation and the
-- wrong one for a family of five: the person who buys a bangle is not reliably
-- the person holding the admin flag, and a record that is annoying to update is
-- a record that stops being true.
--
-- So the line moves. Anything about the *contents* of the vault is now open to
-- every active member. Anything about *who can see the vault at all* stays with
-- admins, because that is the decision with no undo:
--
--   admin only        invite, admit, deactivate, and the recovery key
--   every member      everything else
--
-- Nothing here weakens family isolation. Every policy below still funnels
-- through in_my_family(), which is what tests/rls_isolation.sql proves. The
-- only thing being relaxed is the distinction between two people who are
-- already inside the same vault and already hold the same decryption key —
-- which is worth being honest about: an admin never had cryptographic power a
-- member lacked. They held the same family key. This makes the interface match
-- what was always true.

-- ------------------------------------------------------------- families ----
-- Gold rate, vault name, price visibility, reminder lead times.

alter policy families_update on public.families
  using (id = public.current_family_id())
  with check (id = public.current_family_id());

-- -------------------------------------------------------------- lockers ----

alter policy lockers_insert on public.lockers
  with check (public.in_my_family(family_id));

alter policy lockers_update on public.lockers
  using (public.in_my_family(family_id))
  with check (public.in_my_family(family_id));

-- -------------------------------------------------------------- jewelry ----
-- Still no delete policy, and that is not an oversight. Archiving remains the
-- only removal, because a deleted item orphans the movement history that says
-- where it has been — and that history is most of what the vault is for.

alter policy jewelry_insert on public.jewelry
  with check (public.in_my_family(family_id));

alter policy jewelry_update on public.jewelry
  using (public.in_my_family(family_id))
  with check (public.in_my_family(family_id));

-- --------------------------------------------------------------- events ----

alter policy events_delete on public.events
  using (public.in_my_family(family_id));

-- ------------------------------------------------------------ documents ----

alter policy documents_delete on public.documents
  using (public.in_my_family(family_id));

-- ----------------------------------------------------------- valuations ----

alter policy valuations_insert on public.valuations
  with check (public.in_my_family(family_id));

-- -------------------------------------------------------------- storage ----
-- Deleting a photo or a document, same reasoning.

drop policy if exists "photos are removable by admins" on storage.objects;
create policy "photos are removable within the family"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'jewelry-photos'
    and public.in_my_family(public.storage_family(name))
  );

drop policy if exists "documents are removable by admins" on storage.objects;
create policy "documents are removable within the family"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'documents'
    and public.in_my_family(public.storage_family(name))
  );

-- ------------------------------------------------------------ functions ----
-- Two carried their own is_admin check inside the body, where a policy change
-- cannot reach it.

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
  -- The admin check is gone; the reason is not. This is the one transition
  -- that should feel heavy, and requiring somebody to write down what happened
  -- is what makes it feel that way.
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

-- --------------------------------------------------- deliberately unchanged ----
--
--   members_insert / members_update   inviting and deactivating stay admin-only
--   grant_family_key                  admitting somebody is the decision that
--                                     hands over the decryption key
--   pending_admissions                lists who is waiting to be let in
--   family_keys_insert / update       replacing the recovery key invalidates
--                                     every printed copy in the locker
--
-- Every audit entry still records who did what. Widening who may act makes the
-- log matter more, not less.
