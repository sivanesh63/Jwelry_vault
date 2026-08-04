-- Turning a login into a family member
--
-- Supabase Auth only creates a row in auth.users. Nothing in it knows which
-- family the person belongs to, so without the bridge below an invited user
-- signs in successfully and then sees an empty vault — the most confusing
-- possible failure.
--
-- Two entry points:
--   * bootstrap_family() — the very first person, who has nobody to invite them
--   * handle_new_user()  — everyone after that, invited by an admin

-- Derives "SI" from "Sivanesh", "LA" from "Lakshmi Devi".
create or replace function public.initials_of(full_name text)
returns text
language sql
immutable
as $$
  select upper(
    coalesce(substr(split_part(trim(full_name), ' ', 1), 1, 1), '') ||
    coalesce(substr(split_part(trim(full_name), ' ', 2), 1, 1), '')
  )
$$;

-- ------------------------------------------------------------ first run ----
--
-- Creates a family and makes the caller its admin. Refuses if the caller is
-- already in one, so it cannot be used to escalate or to strand your own data
-- in a second empty family.

create or replace function public.bootstrap_family(
  p_family_name text,
  p_display_name text
)
returns public.families
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_family public.families;
  v_email  text;
begin
  if auth.uid() is null then
    raise exception 'Must be signed in' using errcode = '42501';
  end if;

  if exists (select 1 from public.members where id = auth.uid()) then
    raise exception 'You already belong to a family' using errcode = '42501';
  end if;

  if coalesce(trim(p_family_name), '') = '' or coalesce(trim(p_display_name), '') = '' then
    raise exception 'Family name and your name are both required' using errcode = '22023';
  end if;

  select email into v_email from auth.users where id = auth.uid();

  insert into public.families (name, gold_rate_updated_on)
  values (trim(p_family_name), current_date)
  returning * into v_family;

  insert into public.members (id, family_id, display_name, email, role, initials)
  values (auth.uid(), v_family.id, trim(p_display_name), coalesce(v_email, ''), 'admin',
          public.initials_of(p_display_name));

  insert into public.audit_logs (family_id, actor_id, action_key, entity_type, entity_id, detail)
  values (v_family.id, auth.uid(), 'audit.createdEvent', 'settings', v_family.id, v_family.name);

  return v_family;
end;
$$;

-- ------------------------------------------------------- invited members ----
--
-- An admin invites through Supabase Auth, passing family_id, display_name and
-- role in the invite metadata. This trigger turns that into a member row the
-- moment the auth user is created, so their first sign-in lands in a populated
-- vault rather than an empty one.
--
-- It deliberately does nothing when metadata is absent: that is the
-- bootstrap_family() path, or a stray signup that should not silently join
-- anyone's family.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_family uuid;
  v_name   text;
  v_role   public.member_role;
begin
  v_family := (new.raw_user_meta_data ->> 'family_id')::uuid;
  if v_family is null then
    return new;
  end if;

  -- Ignore an invented family id rather than creating a dangling member.
  if not exists (select 1 from public.families where id = v_family) then
    return new;
  end if;

  v_name := coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
                     split_part(new.email, '@', 1));

  begin
    v_role := coalesce((new.raw_user_meta_data ->> 'role')::public.member_role, 'member');
  exception
    when invalid_text_representation then v_role := 'member';
  end;

  insert into public.members (id, family_id, display_name, email, role, initials)
  values (new.id, v_family, v_name, new.email, v_role, public.initials_of(v_name))
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- --------------------------------------------------------------- grants ----

revoke execute on function public.bootstrap_family(text, text) from public, anon;
grant  execute on function public.bootstrap_family(text, text) to authenticated;

-- handle_new_user is trigger-only; nobody calls it directly.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
