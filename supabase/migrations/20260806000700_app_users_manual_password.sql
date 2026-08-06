-- Track manual password setup/reset performed by management.

alter table public.app_users
  add column if not exists password_manual_set_at timestamptz;

insert into public.audit_logs (actor_name, action, target_table, target_id, status, metadata)
values
  ('System', 'Enable manual app user password tracking', 'app_users', '20260806000700', 'success', '{"source":"migration"}'::jsonb);
