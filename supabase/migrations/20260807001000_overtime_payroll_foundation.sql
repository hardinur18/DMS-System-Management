-- Overtime foundation: payroll component hourly rates, auto detection from check-out,
-- approval workflow, and payroll cycle preview amount.

insert into public.permissions (key, label, group_name, description)
values
  ('overtime.view', 'Lihat Lembur', 'Payroll', 'Melihat kandidat dan histori lembur dari absensi check-out.'),
  ('overtime.review', 'Review Lembur', 'Payroll', 'Approve atau reject lembur sebelum masuk preview payroll.')
on conflict (key) do update set
  label = excluded.label,
  group_name = excluded.group_name,
  description = excluded.description;

with role_permission_seed(role_code, permission_key, enabled) as (
  values
    ('ROLE-OWNER', 'overtime.view', true),
    ('ROLE-OWNER', 'overtime.review', true),
    ('ROLE-HR', 'overtime.view', true),
    ('ROLE-HR', 'overtime.review', true),
    ('ROLE-FIN', 'overtime.view', true),
    ('ROLE-FIN', 'overtime.review', true),
    ('ROLE-ADMIN', 'overtime.view', true),
    ('ROLE-SPV', 'overtime.view', true)
)
insert into public.role_permissions (role_id, permission_key, enabled)
select roles.id, role_permission_seed.permission_key, role_permission_seed.enabled
from role_permission_seed
join public.roles on roles.code = role_permission_seed.role_code
on conflict (role_id, permission_key) do update set
  enabled = excluded.enabled,
  updated_at = now();

alter table public.payroll_components
add column if not exists calculation_unit text not null default 'fixed',
add column if not exists rate_amount numeric(14, 2) not null default 0,
add column if not exists day_type text not null default 'all',
add column if not exists auto_detect_overtime boolean not null default false,
add column if not exists requires_approval boolean not null default true;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'payroll_components_calculation_unit_check') then
    alter table public.payroll_components
      add constraint payroll_components_calculation_unit_check
      check (calculation_unit in ('fixed', 'hour', 'day'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'payroll_components_day_type_check') then
    alter table public.payroll_components
      add constraint payroll_components_day_type_check
      check (day_type in ('all', 'weekday', 'sunday', 'holiday'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'payroll_components_rate_amount_check') then
    alter table public.payroll_components
      add constraint payroll_components_rate_amount_check
      check (rate_amount >= 0);
  end if;
end $$;

create index if not exists idx_payroll_components_overtime on public.payroll_components(auto_detect_overtime, day_type, is_active);

insert into public.payroll_components (
  code,
  name,
  component_type,
  description,
  calculation_unit,
  rate_amount,
  day_type,
  auto_detect_overtime,
  requires_approval,
  is_active,
  sort_order
)
values
  ('OT-WEEKDAY', 'Lembur Weekday', 'earning', 'Rate lembur per jam untuk hari kerja Senin-Sabtu.', 'hour', 20000, 'weekday', true, true, true, 30),
  ('OT-SUNDAY', 'Lembur Minggu', 'earning', 'Rate lembur per jam khusus hari Minggu.', 'hour', 30000, 'sunday', true, true, true, 40)
on conflict (code) do update set
  name = excluded.name,
  component_type = excluded.component_type,
  description = excluded.description,
  calculation_unit = excluded.calculation_unit,
  rate_amount = excluded.rate_amount,
  day_type = excluded.day_type,
  auto_detect_overtime = excluded.auto_detect_overtime,
  requires_approval = excluded.requires_approval,
  is_active = excluded.is_active,
  sort_order = excluded.sort_order,
  updated_at = now();

alter table public.payroll_cycles
add column if not exists overtime_amount numeric(14, 2) not null default 0 check (overtime_amount >= 0);

create table if not exists public.overtime_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  attendance_log_id uuid references public.attendance_logs(id) on delete set null,
  payroll_cycle_id uuid references public.payroll_cycles(id) on delete set null,
  payroll_component_id uuid references public.payroll_components(id) on delete set null,
  overtime_date date not null,
  shift_start_time time,
  shift_end_time time,
  actual_check_out_at timestamptz,
  overtime_minutes integer not null default 0 check (overtime_minutes >= 0),
  approved_minutes integer not null default 0 check (approved_minutes >= 0),
  rate_amount numeric(14, 2) not null default 0 check (rate_amount >= 0),
  total_amount numeric(14, 2) not null default 0 check (total_amount >= 0),
  day_type text not null default 'weekday' check (day_type in ('weekday', 'sunday', 'holiday')),
  status text not null default 'pending' check (status in ('draft', 'pending', 'approved', 'rejected')),
  notes text,
  reviewed_by uuid references public.app_users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employee_id, overtime_date)
);

create index if not exists idx_overtime_requests_employee_date on public.overtime_requests(employee_id, overtime_date desc);
create index if not exists idx_overtime_requests_status on public.overtime_requests(status);
create index if not exists idx_overtime_requests_payroll_cycle on public.overtime_requests(payroll_cycle_id);

drop trigger if exists trg_overtime_requests_updated_at on public.overtime_requests;
create trigger trg_overtime_requests_updated_at
before update on public.overtime_requests
for each row execute function public.set_updated_at();

alter table public.overtime_requests enable row level security;

drop policy if exists "Production read overtime requests" on public.overtime_requests;
create policy "Production read overtime requests"
on public.overtime_requests for select
to authenticated
using (public.has_app_permission('overtime.view') or public.has_app_permission('payroll.view'));

drop policy if exists "Production manage overtime requests" on public.overtime_requests;
create policy "Production manage overtime requests"
on public.overtime_requests for all
to authenticated
using (public.has_app_permission('overtime.review') or public.has_app_permission('payroll.process'))
with check (public.has_app_permission('overtime.review') or public.has_app_permission('payroll.process'));

create or replace function public.detect_employee_overtime(target_employee_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  with checkout_logs as (
    select
      attendance_logs.id as attendance_log_id,
      attendance_logs.employee_id,
      attendance_logs.attendance_date,
      attendance_logs.event_at,
      shifts.start_time,
      shifts.end_time,
      timezone('Asia/Jakarta', attendance_logs.event_at) as actual_local_at,
      (
        attendance_logs.attendance_date::timestamp
        + shifts.end_time
        + case when shifts.end_time <= shifts.start_time then interval '1 day' else interval '0 minutes' end
      ) as scheduled_end_at,
      case
        when extract(isodow from attendance_logs.attendance_date) = 7 then 'sunday'
        else 'weekday'
      end as detected_day_type
    from public.attendance_logs
    join public.employees on employees.id = attendance_logs.employee_id
    left join public.shifts on shifts.id = employees.shift_id
    where attendance_logs.employee_id = target_employee_id
      and attendance_logs.event_type = 'check_out'
      and attendance_logs.status <> 'rejected'
      and shifts.start_time is not null
      and shifts.end_time is not null
  ),
  candidates as (
    select
      checkout_logs.*,
      greatest(0, floor(extract(epoch from (checkout_logs.actual_local_at - checkout_logs.scheduled_end_at)) / 60))::integer as overtime_minutes
    from checkout_logs
  ),
  candidates_with_component as (
    select
      candidates.*,
      payroll_components.id as payroll_component_id,
      payroll_components.rate_amount
    from candidates
    join lateral (
      select id, rate_amount
      from public.payroll_components
      where component_type = 'earning'
        and calculation_unit = 'hour'
        and auto_detect_overtime = true
        and is_active = true
        and day_type in (candidates.detected_day_type, 'all')
      order by case when day_type = candidates.detected_day_type then 0 else 1 end, sort_order asc, code asc
      limit 1
    ) as payroll_components on true
    where candidates.overtime_minutes > 0
  )
  insert into public.overtime_requests (
    employee_id,
    attendance_log_id,
    payroll_component_id,
    overtime_date,
    shift_start_time,
    shift_end_time,
    actual_check_out_at,
    overtime_minutes,
    approved_minutes,
    rate_amount,
    total_amount,
    day_type,
    status,
    notes
  )
  select
    candidates_with_component.employee_id,
    candidates_with_component.attendance_log_id,
    candidates_with_component.payroll_component_id,
    candidates_with_component.attendance_date,
    candidates_with_component.start_time,
    candidates_with_component.end_time,
    candidates_with_component.event_at,
    candidates_with_component.overtime_minutes,
    0,
    candidates_with_component.rate_amount,
    0,
    candidates_with_component.detected_day_type,
    'pending',
    'Auto-detected dari check-out melewati jam selesai shift.'
  from candidates_with_component
  on conflict (employee_id, overtime_date) do update set
    attendance_log_id = excluded.attendance_log_id,
    payroll_component_id = excluded.payroll_component_id,
    shift_start_time = excluded.shift_start_time,
    shift_end_time = excluded.shift_end_time,
    actual_check_out_at = excluded.actual_check_out_at,
    overtime_minutes = excluded.overtime_minutes,
    rate_amount = excluded.rate_amount,
    day_type = excluded.day_type,
    notes = case
      when public.overtime_requests.notes is null or public.overtime_requests.notes = '' then excluded.notes
      else public.overtime_requests.notes
    end,
    status = case
      when public.overtime_requests.status in ('approved', 'rejected') then public.overtime_requests.status
      else 'pending'
    end,
    approved_minutes = case
      when public.overtime_requests.status = 'approved' then public.overtime_requests.approved_minutes
      else 0
    end,
    total_amount = case
      when public.overtime_requests.status = 'approved' then public.overtime_requests.total_amount
      else 0
    end,
    updated_at = now();
end;
$$;

create or replace function public.detect_all_overtime_requests()
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
    perform public.detect_employee_overtime(employee_record.id);
  end loop;
end;
$$;

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
      overtime_amount,
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
      0 as overtime_amount,
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
    returning id, employee_id, cycle_number, period_started_at, period_closed_at
  )
  update public.attendance_logs
  set payroll_cycle_id = upserted_cycles.id,
      updated_at = now()
  from grouped_logs
  join upserted_cycles
    on upserted_cycles.employee_id = grouped_logs.employee_id
   and upserted_cycles.cycle_number = grouped_logs.cycle_number
  where attendance_logs.id = grouped_logs.id;

  update public.overtime_requests
  set payroll_cycle_id = payroll_cycles.id,
      updated_at = now()
  from public.payroll_cycles
  where overtime_requests.employee_id = target_employee_id
    and payroll_cycles.employee_id = target_employee_id
    and overtime_requests.overtime_date >= payroll_cycles.period_started_at
    and (
      payroll_cycles.period_closed_at is null
      or overtime_requests.overtime_date <= payroll_cycles.period_closed_at
    )
    and overtime_requests.status <> 'rejected'
    and payroll_cycles.status <> 'void';

  update public.payroll_cycles
  set overtime_amount = coalesce((
        select sum(overtime_requests.total_amount)
        from public.overtime_requests
        where overtime_requests.payroll_cycle_id = payroll_cycles.id
          and overtime_requests.status = 'approved'
      ), 0),
      updated_at = now()
  where payroll_cycles.employee_id = target_employee_id
    and payroll_cycles.status <> 'paid';

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

grant execute on function public.detect_employee_overtime(uuid) to authenticated;
grant execute on function public.detect_all_overtime_requests() to authenticated;
grant execute on function public.refresh_employee_payroll_cycles(uuid) to authenticated;

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
  current_date,
  'check_out',
  (current_date::timestamp + shifts.end_time + interval '90 minutes') at time zone 'Asia/Jakarta',
  work_locations.latitude,
  work_locations.longitude,
  greatest(8, least(coalesce(work_locations.radius_m, 100) - 15, 35)),
  work_locations.radius_m,
  'valid',
  'verified',
  92,
  'valid',
  false,
  'seed',
  'Seed check-out lembur untuk validasi overtime.'
from public.employees
left join public.app_users on app_users.employee_id = employees.id
left join public.work_locations on work_locations.id = employees.work_location_id
left join public.shifts on shifts.id = employees.shift_id
where employees.deleted_at is null
  and employees.status = 'active'
  and shifts.end_time is not null
order by employees.employee_code
limit 2
on conflict (employee_id, attendance_date, event_type) do nothing;

select public.detect_all_overtime_requests();
select public.refresh_all_employee_payroll_cycles();

insert into public.audit_logs (actor_name, action, target_table, target_id, status, metadata)
values
  ('System', 'Create overtime payroll foundation', 'overtime_requests', '20260807001000', 'success', '{"source":"migration","module":"overtime-payroll"}'::jsonb);
