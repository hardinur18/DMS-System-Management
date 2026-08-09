alter table public.payroll_cycles
  add column if not exists locked_at timestamptz,
  add column if not exists processed_at timestamptz,
  add column if not exists processed_by uuid references public.app_users(id) on delete set null,
  add column if not exists net_amount numeric(14, 2) not null default 0 check (net_amount >= 0);

alter table public.payroll_cycles
  drop constraint if exists payroll_cycles_status_check;

alter table public.payroll_cycles
  add constraint payroll_cycles_status_check
  check (status in ('active', 'ready', 'locked', 'paid', 'void'));

create index if not exists idx_payroll_cycles_locked_at on public.payroll_cycles(locked_at desc);
create index if not exists idx_payroll_cycles_processed_by on public.payroll_cycles(processed_by);

update public.payroll_cycles
set net_amount = greatest(coalesce(gross_amount, 0) + coalesce(overtime_amount, 0), 0),
    updated_at = now()
where coalesce(net_amount, 0) = 0
  and (coalesce(gross_amount, 0) + coalesce(overtime_amount, 0)) > 0;

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
      net_amount,
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
      case
        when employees.salary_type = 'monthly' and employees.prorate_enabled = false then employees.monthly_salary
        when employees.salary_type = 'monthly' then round((employees.monthly_salary / 26) * cycle_source.work_days_count, 2)
        else round(employees.daily_salary * cycle_source.work_days_count, 2)
      end as net_amount,
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
      gross_amount = case
        when public.payroll_cycles.status in ('locked', 'paid') then public.payroll_cycles.gross_amount
        else excluded.gross_amount
      end,
      net_amount = case
        when public.payroll_cycles.status in ('locked', 'paid') then public.payroll_cycles.net_amount
        else excluded.net_amount
      end,
      status = case
        when public.payroll_cycles.status in ('locked', 'paid') then public.payroll_cycles.status
        else excluded.status
      end,
      ready_at = case
        when public.payroll_cycles.status in ('locked', 'paid') then public.payroll_cycles.ready_at
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
    and payroll_cycles.status not in ('locked', 'paid');

  update public.payroll_cycles
  set net_amount = greatest(coalesce(gross_amount, 0) + coalesce(overtime_amount, 0), 0),
      updated_at = now()
  where payroll_cycles.employee_id = target_employee_id
    and payroll_cycles.status not in ('locked', 'paid');

  delete from public.payroll_cycles
  where employee_id = target_employee_id
    and status not in ('locked', 'paid')
    and not exists (
      select 1
      from public.attendance_logs
      where attendance_logs.payroll_cycle_id = payroll_cycles.id
    );
end;
$$;

grant execute on function public.refresh_employee_payroll_cycles(uuid) to authenticated;
