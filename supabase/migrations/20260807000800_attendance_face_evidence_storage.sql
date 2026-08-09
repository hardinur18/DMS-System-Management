-- Attendance face evidence storage.
-- One stable object path per attendance log keeps face evidence CRUD clean.

alter table public.attendance_logs
add column if not exists face_snapshot_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'attendance-faces',
  'attendance-faces',
  true,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types,
  updated_at = now();

drop policy if exists "Read attendance face evidence" on storage.objects;
create policy "Read attendance face evidence"
on storage.objects for select
to authenticated
using (
  bucket_id = 'attendance-faces'
  and (
    public.has_app_permission('attendance.view')
    or public.has_app_permission('attendance.review')
  )
);

drop policy if exists "Insert attendance face evidence" on storage.objects;
create policy "Insert attendance face evidence"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'attendance-faces'
  and (
    public.has_app_permission('attendance.review')
    or public.has_app_permission('employees.manage')
  )
);

drop policy if exists "Update attendance face evidence" on storage.objects;
create policy "Update attendance face evidence"
on storage.objects for update
to authenticated
using (
  bucket_id = 'attendance-faces'
  and (
    public.has_app_permission('attendance.review')
    or public.has_app_permission('employees.manage')
  )
)
with check (
  bucket_id = 'attendance-faces'
  and (
    public.has_app_permission('attendance.review')
    or public.has_app_permission('employees.manage')
  )
);

drop policy if exists "Delete attendance face evidence" on storage.objects;
create policy "Delete attendance face evidence"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'attendance-faces'
  and (
    public.has_app_permission('attendance.review')
    or public.has_app_permission('employees.manage')
  )
);

insert into public.audit_logs (actor_name, action, target_table, target_id, status, metadata)
values
  ('System', 'Create attendance face evidence storage', 'attendance_logs', '20260807000800', 'success', '{"source":"migration","bucket":"attendance-faces","path_pattern":"attendance/{employee_code}/{date}-{event_type}"}'::jsonb);
