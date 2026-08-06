-- Track verified email ownership and manual-password follow-up requirements.

alter table public.app_users
  add column if not exists email_verified_at timestamptz,
  add column if not exists force_password_change boolean not null default false;

create index if not exists idx_app_users_email_verified_at on public.app_users(email_verified_at);

insert into public.audit_logs (actor_name, action, target_table, target_id, status, metadata)
values
  ('System', 'Enable app user email verification and password policy flags', 'app_users', '20260806000800', 'success', '{"source":"migration"}'::jsonb);
