-- Track password setup/reset links requested from Pengguna & Akses.

alter table public.app_users
  add column if not exists password_setup_sent_at timestamptz,
  add column if not exists password_reset_sent_at timestamptz;

insert into public.audit_logs (actor_name, action, target_table, target_id, status, metadata)
values
  ('System', 'Enable app user password actions', 'app_users', '20260806000300', 'success', '{"source":"migration"}'::jsonb);
