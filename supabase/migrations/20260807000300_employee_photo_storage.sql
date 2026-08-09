-- Employee photo storage.
-- One stable object path per employee keeps CRUD from piling up duplicate files.

alter table public.employees
add column if not exists photo_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'employee-photos',
  'employee-photos',
  true,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types,
  updated_at = now();

drop policy if exists "Read employee photos" on storage.objects;
create policy "Read employee photos"
on storage.objects for select
to authenticated
using (
  bucket_id = 'employee-photos'
  and public.has_app_permission('employees.view')
);

drop policy if exists "Insert employee photos" on storage.objects;
create policy "Insert employee photos"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'employee-photos'
  and public.has_app_permission('employees.manage')
);

drop policy if exists "Update employee photos" on storage.objects;
create policy "Update employee photos"
on storage.objects for update
to authenticated
using (
  bucket_id = 'employee-photos'
  and public.has_app_permission('employees.manage')
)
with check (
  bucket_id = 'employee-photos'
  and public.has_app_permission('employees.manage')
);

drop policy if exists "Delete employee photos" on storage.objects;
create policy "Delete employee photos"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'employee-photos'
  and public.has_app_permission('employees.manage')
);

insert into public.audit_logs (actor_name, action, target_table, target_id, status, metadata)
values
  ('System', 'Create employee photo storage', 'employees', '20260807000300', 'success', '{"source":"migration","bucket":"employee-photos","path_pattern":"employees/{employee_code}/profile"}'::jsonb);
