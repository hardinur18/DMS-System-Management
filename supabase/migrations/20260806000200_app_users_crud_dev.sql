-- DMS app user CRUD support for development.
-- App users are internal management profiles and can be linked to auth.users later.

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'app_users_id_fkey'
      and conrelid = 'public.app_users'::regclass
  ) then
    alter table public.app_users
      drop constraint app_users_id_fkey;
  end if;
end $$;

alter table public.app_users
  alter column id set default gen_random_uuid(),
  add column if not exists auth_user_id uuid unique references auth.users(id) on delete set null,
  add column if not exists notes text;

create index if not exists idx_app_users_auth_user_id on public.app_users(auth_user_id);
create index if not exists idx_app_users_created_at on public.app_users(created_at desc);

drop policy if exists "Dev anon manage app users" on public.app_users;
create policy "Dev anon manage app users"
on public.app_users for all
to anon, authenticated
using (true)
with check (true);

drop policy if exists "Dev anon manage audit logs" on public.audit_logs;
create policy "Dev anon manage audit logs"
on public.audit_logs for insert
to anon, authenticated
with check (true);

with seed_users(user_code, full_name, email, role_id, division_id, status, two_factor_status, last_login_at, invited_at, notes) as (
  values
  (
    'USR-001',
    'Hardinur Rahman',
    'hardinurahman@gmail.com',
    (select id from public.roles where code = 'ROLE-OWNER'),
    (select id from public.divisions where code = 'DIV-MGT' or name = 'Management' limit 1),
    'active',
    'enabled',
    now() - interval '18 minutes',
    now() - interval '12 days',
    'Owner access development seed.'
  ),
  (
    'USR-002',
    'Sinta Maharani',
    'sinta@dms.local',
    (select id from public.roles where code = 'ROLE-HR'),
    (select id from public.divisions where code = 'DIV-HR' or name = 'HR' limit 1),
    'active',
    'enabled',
    now() - interval '42 minutes',
    now() - interval '9 days',
    'HR manager development seed.'
  ),
  (
    'USR-003',
    'Aldi Finance',
    'aldi.finance@dms.local',
    (select id from public.roles where code = 'ROLE-FIN'),
    (select id from public.divisions where code = 'DIV-FIN' or name = 'Finance' limit 1),
    'invited',
    'pending',
    null,
    now() - interval '2 days',
    'Finance invite development seed.'
  ),
  (
    'USR-004',
    'Fajar Supervisor',
    'fajar.ops@dms.local',
    (select id from public.roles where code = 'ROLE-SPV'),
    (select id from public.divisions where code = 'DIV-PRD' or name = 'Produksi' limit 1),
    'active',
    'disabled',
    now() - interval '1 day',
    now() - interval '8 days',
    'Supervisor development seed.'
  )
)
insert into public.app_users (user_code, full_name, email, role_id, division_id, status, two_factor_status, last_login_at, invited_at, notes)
select seed_users.user_code, seed_users.full_name, seed_users.email, seed_users.role_id, seed_users.division_id, seed_users.status, seed_users.two_factor_status, seed_users.last_login_at, seed_users.invited_at, seed_users.notes
from seed_users
where not exists (
  select 1
  from public.app_users app_user
  where app_user.user_code = seed_users.user_code
     or app_user.email = seed_users.email
);

insert into public.audit_logs (actor_name, action, target_table, target_id, status, metadata)
values
  ('System', 'Enable app user CRUD dev support', 'app_users', '20260806000200', 'success', '{"source":"migration"}'::jsonb);
