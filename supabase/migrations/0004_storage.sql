-- Storage buckets and their access rules
--
-- All three are private. A public bucket would expose every jewelry photo to
-- anyone who guessed a URL — no auth, no logging, no way to revoke. The app
-- reads through short-lived signed URLs instead.
--
-- Path convention: <family_id>/<rest>. The family id being the first path
-- segment is what makes the policies below possible — it lets Postgres decide
-- access from the object name alone, without a lookup.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('jewelry-photos', 'jewelry-photos', false, 5242880,
   array['image/jpeg', 'image/png', 'image/webp', 'image/heic']),
  ('documents', 'documents', false, 10485760,
   array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
  ('backups', 'backups', false, 52428800,
   array['application/json', 'application/gzip'])
on conflict (id) do nothing;

-- The 5 MB photo cap is a backstop, not the plan: the app compresses to roughly
-- 400 KB in the browser first. That difference decides whether ~600 photos fit
-- in the free tier or ~80.

-- First path segment as a uuid, or null when it is not one.
create or replace function public.storage_family(object_name text)
returns uuid
language plpgsql
immutable
as $$
begin
  return (string_to_array(object_name, '/'))[1]::uuid;
exception
  when others then return null;   -- malformed prefix simply matches nothing
end;
$$;

-- ------------------------------------------------------- jewelry photos ----

create policy "photos are readable within the family"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'jewelry-photos'
    and public.in_my_family(public.storage_family(name))
  );

create policy "photos are writable within the family"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'jewelry-photos'
    and public.in_my_family(public.storage_family(name))
  );

create policy "photos are replaceable within the family"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'jewelry-photos'
    and public.in_my_family(public.storage_family(name))
  );

create policy "photos are removable by admins"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'jewelry-photos'
    and public.in_my_family(public.storage_family(name))
    and public.is_admin()
  );

-- ------------------------------------------------------------ documents ----

create policy "documents are readable within the family"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'documents'
    and public.in_my_family(public.storage_family(name))
  );

create policy "documents are writable within the family"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'documents'
    and public.in_my_family(public.storage_family(name))
  );

create policy "documents are removable by admins"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'documents'
    and public.in_my_family(public.storage_family(name))
    and public.is_admin()
  );

-- -------------------------------------------------------------- backups ----
-- Deliberately no policy for the authenticated role. Only the Worker, holding
-- the service_role key, touches this bucket. Nothing in the browser should be
-- able to read or overwrite a backup.
