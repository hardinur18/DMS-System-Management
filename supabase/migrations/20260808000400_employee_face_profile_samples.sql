alter table public.employee_face_profiles
  add column if not exists reference_image_paths jsonb not null default '[]'::jsonb;

update public.employee_face_profiles
set reference_image_paths = case
  when reference_image_path is null or reference_image_path = '' then '[]'::jsonb
  else jsonb_build_array(reference_image_path)
end
where reference_image_paths = '[]'::jsonb;

insert into public.audit_logs (
  actor_name,
  action,
  target_table,
  status,
  metadata
) values (
  'system',
  'Add multi-sample employee face enrollment',
  'employee_face_profiles',
  'success',
  '{"source":"migration","samples":3,"path_pattern":"profiles/{employee_code}/reference-{1..3}"}'::jsonb
);
