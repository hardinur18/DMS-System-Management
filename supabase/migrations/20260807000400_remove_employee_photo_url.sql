-- Employee photos use Storage path only; public URL is derived at render time.

alter table public.employees
drop column if exists photo_url;

insert into public.audit_logs (actor_name, action, target_table, target_id, status, metadata)
values
  ('System', 'Remove employee photo url column', 'employees', '20260807000400', 'success', '{"source":"migration","storage_column":"photo_path"}'::jsonb);
