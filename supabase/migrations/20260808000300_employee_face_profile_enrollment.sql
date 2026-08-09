-- Employee face enrollment, review status, and private profile storage.
-- One stable reference image is kept per employee to avoid duplicated biometric files.

alter table public.employee_face_profiles
  add column if not exists reference_image_path text,
  add column if not exists submitted_at timestamptz,
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid references public.app_users(id) on delete set null,
  add column if not exists review_notes text;

alter table public.employee_face_profiles
  drop constraint if exists employee_face_profiles_status_check;

update public.employee_face_profiles
set status = case
  when status = 'enrolled' then 'approved'
  when status = 'review' then 'pending_review'
  else status
end;

alter table public.employee_face_profiles
  add constraint employee_face_profiles_status_check
  check (status in ('unenrolled', 'pending_review', 'approved', 'rejected', 'disabled'));

create index if not exists idx_employee_face_profiles_employee_status
on public.employee_face_profiles(employee_id, status);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'employee-face-profiles',
  'employee-face-profiles',
  false,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Read employee face profile images" on storage.objects;
create policy "Read employee face profile images"
on storage.objects for select
to authenticated
using (
  bucket_id = 'employee-face-profiles'
);

drop policy if exists "Manage employee face profile images" on storage.objects;
create policy "Manage employee face profile images"
on storage.objects for all
to authenticated
using (
  bucket_id = 'employee-face-profiles'
  and (
    public.has_app_permission('employees.manage')
    or public.has_app_permission('attendance.review')
  )
)
with check (
  bucket_id = 'employee-face-profiles'
  and (
    public.has_app_permission('employees.manage')
    or public.has_app_permission('attendance.review')
  )
);

insert into public.audit_logs (actor_name, action, target_table, target_id, status, metadata)
values (
  'System',
  'Create employee face enrollment storage',
  'employee_face_profiles',
  '20260808000300',
  'success',
  '{"source":"migration","bucket":"employee-face-profiles","path_pattern":"profiles/{employee_code}/reference"}'::jsonb
);
