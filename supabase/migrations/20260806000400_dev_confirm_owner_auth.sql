-- Development bootstrap only: confirm and link the owner auth account for local testing.
-- Production invite/reset should use Supabase Auth email confirmation flow.

update auth.users
set
  email_confirmed_at = coalesce(email_confirmed_at, now()),
  updated_at = now()
where lower(email) = 'hardinurahman@gmail.com';

update public.app_users app_user
set
  auth_user_id = auth_user.id,
  status = 'active',
  updated_at = now()
from auth.users auth_user
where lower(app_user.email) = 'hardinurahman@gmail.com'
  and lower(auth_user.email) = 'hardinurahman@gmail.com';

insert into public.audit_logs (actor_name, action, target_table, target_id, status, metadata)
values
  ('System', 'Confirm owner auth for development', 'app_users', '20260806000400', 'success', '{"source":"migration","env":"development"}'::jsonb);
