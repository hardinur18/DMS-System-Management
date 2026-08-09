-- Attendance, field-user relation, GPS/face verification, and 26-workday payroll cycle foundation.

insert into public.permissions (key, label, group_name, description)
values
  ('attendance.view', 'Lihat Absensi', 'Absensi', 'Monitoring absensi GPS, radius lokasi, dan face verification.'),
  ('attendance.review', 'Review Absensi', 'Absensi', 'Approve, reject, dan koreksi absensi yang perlu keputusan HR.'),
  ('payroll.view', 'Lihat Payroll', 'Payroll', 'Melihat preview cycle payroll 26 hari.'),
  ('payroll.process', 'Proses Payroll', 'Payroll', 'Mengunci dan memproses cycle payroll siap bayar.')
on conflict (key) do update set
  label = excluded.label,
  group_name = excluded.group_name,
  description = excluded.description;

with role_permission_seed(role_code, permission_key, enabled) as (
  values
    ('ROLE-OWNER', 'attendance.view', true),
    ('ROLE-OWNER', 'attendance.review', true),
    ('ROLE-OWNER', 'payroll.view', true),
    ('ROLE-OWNER', 'payroll.process', true),
    ('ROLE-HR', 'attendance.view', true),
    ('ROLE-HR', 'attendance.review', true),
    ('ROLE-HR', 'payroll.view', true),
    ('ROLE-ADMIN', 'attendance.view', true),
    ('ROLE-ADMIN', 'attendance.review', true),
    ('ROLE-FIN', 'payroll.view', true),
    ('ROLE-FIN', 'payroll.process', true),
    ('ROLE-SPV', 'attendance.view', true),
    ('ROLE-SPV', 'attendance.review', true),
    ('ROLE-VIEWER', 'attendance.view', true),
    ('ROLE-VIEWER', 'payroll.view', true)
)
insert into public.role_permissions (role_id, permission_key, enabled)
select roles.id, role_permission_seed.permission_key, role_permission_seed.enabled
from role_permission_seed
join public.roles on roles.code = role_permission_seed.role_code
on conflict (role_id, permission_key) do update set
  enabled = excluded.enabled,
  updated_at = now();

alter table public.app_users
add column if not exists employee_id uuid unique references public.employees(id) on delete set null,
add column if not exists app_scope text not null default 'management';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'app_users_app_scope_check'
  ) then
    alter table public.app_users
      add constraint app_users_app_scope_check
      check (app_scope in ('management', 'field', 'both'));
  end if;
end $$;

create index if not exists idx_app_users_employee_id on public.app_users(employee_id);
create index if not exists idx_app_users_app_scope on public.app_users(app_scope);

create table if not exists public.employee_face_profiles (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null unique references public.employees(id) on delete cascade,
  status text not null default 'unenrolled' check (status in ('unenrolled', 'enrolled', 'review')),
  verification_required boolean not null default true,
  face_score_threshold numeric(5, 2) not null default 80 check (face_score_threshold >= 0 and face_score_threshold <= 100),
  embedding_ref text,
  last_verified_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_employee_face_profiles_status on public.employee_face_profiles(status);

drop trigger if exists trg_employee_face_profiles_updated_at on public.employee_face_profiles;
create trigger trg_employee_face_profiles_updated_at
before update on public.employee_face_profiles
for each row execute function public.set_updated_at();

create table if not exists public.payroll_cycles (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  cycle_number integer not null,
  period_started_at date,
  period_closed_at date,
  target_work_days integer not null default 26 check (target_work_days > 0),
  work_days_count integer not null default 0 check (work_days_count >= 0),
  salary_type text not null default 'daily' check (salary_type in ('daily', 'monthly')),
  daily_salary numeric(14, 2) not null default 0 check (daily_salary >= 0),
  monthly_salary numeric(14, 2) not null default 0 check (monthly_salary >= 0),
  payroll_method text not null default 'attendance_cycle' check (payroll_method in ('attendance_cycle', 'calendar_month', 'custom')),
  gross_amount numeric(14, 2) not null default 0 check (gross_amount >= 0),
  status text not null default 'active' check (status in ('active', 'ready', 'paid', 'void')),
  ready_at timestamptz,
  paid_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employee_id, cycle_number)
);

create index if not exists idx_payroll_cycles_employee_id on public.payroll_cycles(employee_id);
create index if not exists idx_payroll_cycles_status on public.payroll_cycles(status);
create index if not exists idx_payroll_cycles_period_started_at on public.payroll_cycles(period_started_at desc);

drop trigger if exists trg_payroll_cycles_updated_at on public.payroll_cycles;
create trigger trg_payroll_cycles_updated_at
before update on public.payroll_cycles
for each row execute function public.set_updated_at();

create table if not exists public.attendance_logs (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  app_user_id uuid references public.app_users(id) on delete set null,
  work_location_id uuid references public.work_locations(id) on delete set null,
  payroll_cycle_id uuid references public.payroll_cycles(id) on delete set null,
  attendance_date date not null default current_date,
  event_type text not null default 'check_in' check (event_type in ('check_in', 'check_out')),
  event_at timestamptz not null default now(),
  latitude numeric(10, 7),
  longitude numeric(10, 7),
  distance_m integer,
  radius_m integer,
  gps_status text not null default 'missing' check (gps_status in ('valid', 'out_of_radius', 'missing')),
  face_status text not null default 'not_required' check (face_status in ('verified', 'review', 'failed', 'not_required')),
  face_score numeric(5, 2) check (face_score is null or (face_score >= 0 and face_score <= 100)),
  status text not null default 'review' check (status in ('valid', 'review', 'rejected')),
  workday_counted boolean not null default false,
  source text not null default 'management' check (source in ('field_app', 'management', 'seed')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employee_id, attendance_date, event_type)
);

create index if not exists idx_attendance_logs_employee_date on public.attendance_logs(employee_id, attendance_date desc);
create index if not exists idx_attendance_logs_location on public.attendance_logs(work_location_id);
create index if not exists idx_attendance_logs_status on public.attendance_logs(status);
create index if not exists idx_attendance_logs_event_at on public.attendance_logs(event_at desc);

drop trigger if exists trg_attendance_logs_updated_at on public.attendance_logs;
create trigger trg_attendance_logs_updated_at
before update on public.attendance_logs
for each row execute function public.set_updated_at();

alter table public.employee_face_profiles enable row level security;
alter table public.payroll_cycles enable row level security;
alter table public.attendance_logs enable row level security;

drop policy if exists "Production read employee face profiles" on public.employee_face_profiles;
create policy "Production read employee face profiles"
on public.employee_face_profiles for select
to authenticated
using (public.has_app_permission('employees.view') or public.has_app_permission('attendance.view'));

drop policy if exists "Production manage employee face profiles" on public.employee_face_profiles;
create policy "Production manage employee face profiles"
on public.employee_face_profiles for all
to authenticated
using (public.has_app_permission('employees.manage') or public.has_app_permission('attendance.review'))
with check (public.has_app_permission('employees.manage') or public.has_app_permission('attendance.review'));

drop policy if exists "Production read payroll cycles" on public.payroll_cycles;
create policy "Production read payroll cycles"
on public.payroll_cycles for select
to authenticated
using (public.has_app_permission('payroll.view') or public.has_app_permission('attendance.view'));

drop policy if exists "Production manage payroll cycles" on public.payroll_cycles;
create policy "Production manage payroll cycles"
on public.payroll_cycles for all
to authenticated
using (public.has_app_permission('payroll.process'))
with check (public.has_app_permission('payroll.process'));

drop policy if exists "Production read attendance logs" on public.attendance_logs;
create policy "Production read attendance logs"
on public.attendance_logs for select
to authenticated
using (public.has_app_permission('attendance.view'));

drop policy if exists "Production manage attendance logs" on public.attendance_logs;
create policy "Production manage attendance logs"
on public.attendance_logs for all
to authenticated
using (public.has_app_permission('attendance.review') or public.has_app_permission('employees.manage'))
with check (public.has_app_permission('attendance.review') or public.has_app_permission('employees.manage'));

create or replace function public.refresh_employee_payroll_cycles(target_employee_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  with counted_logs as (
    select
      attendance_logs.id,
      attendance_logs.employee_id,
      attendance_logs.attendance_date,
      row_number() over (
        partition by attendance_logs.employee_id
        order by attendance_logs.attendance_date asc, attendance_logs.event_at asc
      ) as attendance_index
    from public.attendance_logs
    where attendance_logs.employee_id = target_employee_id
      and attendance_logs.event_type = 'check_in'
      and attendance_logs.status = 'valid'
      and attendance_logs.workday_counted = true
  ),
  grouped_logs as (
    select
      counted_logs.*,
      (((counted_logs.attendance_index - 1) / 26) + 1)::integer as cycle_number
    from counted_logs
  ),
  cycle_source as (
    select
      grouped_logs.employee_id,
      grouped_logs.cycle_number,
      min(grouped_logs.attendance_date) as period_started_at,
      case when count(*) >= 26 then max(grouped_logs.attendance_date) else null end as period_closed_at,
      least(count(*)::integer, 26) as work_days_count
    from grouped_logs
    group by grouped_logs.employee_id, grouped_logs.cycle_number
  ),
  upserted_cycles as (
    insert into public.payroll_cycles (
      employee_id,
      cycle_number,
      period_started_at,
      period_closed_at,
      work_days_count,
      salary_type,
      daily_salary,
      monthly_salary,
      payroll_method,
      gross_amount,
      status,
      ready_at
    )
    select
      cycle_source.employee_id,
      cycle_source.cycle_number,
      cycle_source.period_started_at,
      cycle_source.period_closed_at,
      cycle_source.work_days_count,
      employees.salary_type,
      employees.daily_salary,
      employees.monthly_salary,
      employees.payroll_method,
      case
        when employees.salary_type = 'monthly' and employees.prorate_enabled = false then employees.monthly_salary
        when employees.salary_type = 'monthly' then round((employees.monthly_salary / 26) * cycle_source.work_days_count, 2)
        else round(employees.daily_salary * cycle_source.work_days_count, 2)
      end as gross_amount,
      case when cycle_source.work_days_count >= 26 then 'ready' else 'active' end as status,
      case when cycle_source.work_days_count >= 26 then now() else null end as ready_at
    from cycle_source
    join public.employees on employees.id = cycle_source.employee_id
    on conflict (employee_id, cycle_number) do update set
      period_started_at = excluded.period_started_at,
      period_closed_at = excluded.period_closed_at,
      work_days_count = excluded.work_days_count,
      salary_type = excluded.salary_type,
      daily_salary = excluded.daily_salary,
      monthly_salary = excluded.monthly_salary,
      payroll_method = excluded.payroll_method,
      gross_amount = excluded.gross_amount,
      status = case
        when public.payroll_cycles.status = 'paid' then 'paid'
        else excluded.status
      end,
      ready_at = case
        when public.payroll_cycles.status = 'paid' then public.payroll_cycles.ready_at
        else excluded.ready_at
      end,
      updated_at = now()
    returning id, employee_id, cycle_number
  )
  update public.attendance_logs
  set payroll_cycle_id = upserted_cycles.id,
      updated_at = now()
  from grouped_logs
  join upserted_cycles
    on upserted_cycles.employee_id = grouped_logs.employee_id
   and upserted_cycles.cycle_number = grouped_logs.cycle_number
  where attendance_logs.id = grouped_logs.id;

  delete from public.payroll_cycles
  where employee_id = target_employee_id
    and status <> 'paid'
    and not exists (
      select 1
      from public.attendance_logs
      where attendance_logs.payroll_cycle_id = payroll_cycles.id
    );
end;
$$;

create or replace function public.refresh_all_employee_payroll_cycles()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  employee_record record;
begin
  for employee_record in
    select id from public.employees where deleted_at is null
  loop
    perform public.refresh_employee_payroll_cycles(employee_record.id);
  end loop;
end;
$$;

grant execute on function public.refresh_employee_payroll_cycles(uuid) to authenticated;
grant execute on function public.refresh_all_employee_payroll_cycles() to authenticated;

insert into public.employee_face_profiles (employee_id, status, verification_required, face_score_threshold, last_verified_at, notes)
select
  employees.id,
  case when employees.status = 'active' then 'enrolled' else 'review' end,
  true,
  80,
  now() - interval '1 day',
  'Seed face profile untuk validasi awal.'
from public.employees
where employees.deleted_at is null
on conflict (employee_id) do nothing;

with ordered_users as (
  select app_users.id, row_number() over (order by app_users.created_at asc, app_users.user_code asc) as row_number
  from public.app_users
  where app_users.employee_id is null
),
ordered_employees as (
  select employees.id, row_number() over (order by employees.employee_code asc) as row_number
  from public.employees
  where employees.deleted_at is null
)
update public.app_users
set employee_id = ordered_employees.id,
    app_scope = case when app_users.app_scope = 'management' then 'both' else app_users.app_scope end,
    updated_at = now()
from ordered_users
join ordered_employees on ordered_employees.row_number = ordered_users.row_number
where app_users.id = ordered_users.id
  and app_users.employee_id is null;

insert into public.attendance_logs (
  employee_id,
  app_user_id,
  work_location_id,
  attendance_date,
  event_type,
  event_at,
  latitude,
  longitude,
  distance_m,
  radius_m,
  gps_status,
  face_status,
  face_score,
  status,
  workday_counted,
  source,
  notes
)
select
  employees.id,
  app_users.id,
  employees.work_location_id,
  current_date - ((employees.payroll_cycle_days - seed.day_index)::integer),
  'check_in',
  (current_date - ((employees.payroll_cycle_days - seed.day_index)::integer))::timestamptz + time '08:00',
  work_locations.latitude,
  work_locations.longitude,
  case
    when employees.status = 'review' and seed.day_index = employees.payroll_cycle_days then coalesce(work_locations.radius_m, 100) + 38
    else greatest(8, least(coalesce(work_locations.radius_m, 100) - 12, 42))
  end,
  work_locations.radius_m,
  case
    when employees.status = 'review' and seed.day_index = employees.payroll_cycle_days then 'out_of_radius'
    else 'valid'
  end,
  case
    when employees.status = 'review' and seed.day_index = employees.payroll_cycle_days then 'review'
    else 'verified'
  end,
  case
    when employees.status = 'review' and seed.day_index = employees.payroll_cycle_days then 72
    else 94 + (seed.day_index % 5)
  end,
  case
    when employees.status = 'review' and seed.day_index = employees.payroll_cycle_days then 'review'
    else 'valid'
  end,
  case
    when employees.status = 'review' and seed.day_index = employees.payroll_cycle_days then false
    else true
  end,
  'seed',
  'Seed absensi awal dari payroll_cycle_days karyawan.'
from public.employees
left join public.work_locations on work_locations.id = employees.work_location_id
left join public.app_users on app_users.employee_id = employees.id
cross join lateral generate_series(1, greatest(employees.payroll_cycle_days, 0)) as seed(day_index)
where employees.deleted_at is null
  and employees.payroll_cycle_days > 0
on conflict (employee_id, attendance_date, event_type) do nothing;

select public.refresh_all_employee_payroll_cycles();

insert into public.audit_logs (actor_name, action, target_table, target_id, status, metadata)
values
  ('System', 'Create attendance and payroll cycle foundation', 'attendance_logs', '20260807000600', 'success', '{"source":"migration","module":"attendance-payroll"}'::jsonb);
