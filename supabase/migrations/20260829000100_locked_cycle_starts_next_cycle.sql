-- Locked payroll cycles are final work-cycle boundaries.
-- New attendance after a locked/unpaid cycle must start the next active cycle.

create or replace function public.refresh_employee_payroll_cycles(target_employee_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  with employee_settings as (
    select
      employees.id as employee_id,
      case
        when employees.payroll_method = 'attendance_cycle'
          then least(greatest(coalesce(employees.payroll_cycle_days, 0), 0), 26)
        else 0
      end as opening_days,
      case
        when employees.payroll_method = 'attendance_cycle'
          then coalesce(employees.payroll_cycle_opening_date, employees.join_date)
        else employees.join_date
      end as opening_date
    from public.employees
    where employees.id = target_employee_id
  ),
  final_cycle_bounds as (
    select
      payroll_cycles.employee_id,
      payroll_cycles.cycle_number,
      coalesce(
        payroll_cycles.period_closed_at,
        (
          select max(attendance_logs.attendance_date)
          from public.attendance_logs
          where attendance_logs.payroll_cycle_id = payroll_cycles.id
        ),
        payroll_cycles.period_started_at
      ) as boundary_date
    from public.payroll_cycles
    where payroll_cycles.employee_id = target_employee_id
      and payroll_cycles.status in ('locked', 'paid', 'void')
  ),
  latest_final_cycle as (
    select
      final_cycle_bounds.employee_id,
      coalesce(max(final_cycle_bounds.cycle_number), 0) as base_cycle_number,
      max(final_cycle_bounds.boundary_date) as boundary_date
    from final_cycle_bounds
    group by final_cycle_bounds.employee_id
  ),
  counted_days as (
    select
      attendance_daily_summaries.check_in_log_id as id,
      attendance_daily_summaries.employee_id,
      attendance_daily_summaries.attendance_date,
      coalesce(latest_final_cycle.base_cycle_number, 0) as base_cycle_number,
      case
        when coalesce(latest_final_cycle.base_cycle_number, 0) = 0 then employee_settings.opening_days
        else 0
      end as opening_days,
      employee_settings.opening_date,
      row_number() over (
        partition by attendance_daily_summaries.employee_id
        order by attendance_daily_summaries.attendance_date asc
      ) as attendance_index
    from public.attendance_daily_summaries
    join employee_settings on employee_settings.employee_id = attendance_daily_summaries.employee_id
    left join latest_final_cycle on latest_final_cycle.employee_id = attendance_daily_summaries.employee_id
    where attendance_daily_summaries.employee_id = target_employee_id
      and attendance_daily_summaries.workday_counted = true
      and attendance_daily_summaries.check_in_log_id is not null
      and (
        latest_final_cycle.boundary_date is null
        or attendance_daily_summaries.attendance_date > latest_final_cycle.boundary_date
        or (
          attendance_daily_summaries.attendance_date = latest_final_cycle.boundary_date
          and not exists (
            select 1
            from public.attendance_logs finalized_logs
            join public.payroll_cycles finalized_cycles
              on finalized_cycles.id = finalized_logs.payroll_cycle_id
             and finalized_cycles.status in ('locked', 'paid', 'void')
            where finalized_logs.id = attendance_daily_summaries.check_in_log_id
          )
        )
      )
    union all
    select
      attendance_logs.id,
      attendance_logs.employee_id,
      attendance_logs.attendance_date,
      coalesce(latest_final_cycle.base_cycle_number, 0) as base_cycle_number,
      case
        when coalesce(latest_final_cycle.base_cycle_number, 0) = 0 then employee_settings.opening_days
        else 0
      end as opening_days,
      employee_settings.opening_date,
      row_number() over (
        partition by attendance_logs.employee_id
        order by attendance_logs.attendance_date asc, attendance_logs.event_at asc
      ) as attendance_index
    from public.attendance_logs
    join employee_settings on employee_settings.employee_id = attendance_logs.employee_id
    left join latest_final_cycle on latest_final_cycle.employee_id = attendance_logs.employee_id
    where attendance_logs.employee_id = target_employee_id
      and attendance_logs.event_type = 'check_in'
      and attendance_logs.status = 'valid'
      and attendance_logs.workday_counted = true
      and not exists (
        select 1
        from public.attendance_daily_summaries
        where attendance_daily_summaries.check_in_log_id = attendance_logs.id
      )
      and (
        latest_final_cycle.boundary_date is null
        or attendance_logs.attendance_date > latest_final_cycle.boundary_date
      )
  ),
  grouped_logs as (
    select
      counted_days.*,
      (counted_days.opening_days + counted_days.attendance_index)::integer as running_workday_number,
      (
        counted_days.base_cycle_number
        + (((counted_days.opening_days + counted_days.attendance_index - 1) / 26) + 1)::integer
      ) as cycle_number,
      (((counted_days.opening_days + counted_days.attendance_index - 1) % 26) + 1)::integer as cycle_day_number
    from counted_days
  ),
  cycle_source as (
    select
      grouped_logs.employee_id,
      grouped_logs.cycle_number,
      case
        when grouped_logs.base_cycle_number = 0
          and grouped_logs.cycle_number = 1
          and max(grouped_logs.opening_days) > 0
          then coalesce(min(grouped_logs.opening_date), min(grouped_logs.attendance_date))
        else min(grouped_logs.attendance_date)
      end as period_started_at,
      case when max(grouped_logs.cycle_day_number) >= 26 then max(grouped_logs.attendance_date) else null end as period_closed_at,
      least(max(grouped_logs.cycle_day_number)::integer, 26) as work_days_count
    from grouped_logs
    group by grouped_logs.employee_id, grouped_logs.cycle_number, grouped_logs.base_cycle_number
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
      period_started_at = case
        when public.payroll_cycles.status in ('locked', 'paid', 'void') then public.payroll_cycles.period_started_at
        else excluded.period_started_at
      end,
      period_closed_at = case
        when public.payroll_cycles.status in ('locked', 'paid', 'void') then public.payroll_cycles.period_closed_at
        else excluded.period_closed_at
      end,
      work_days_count = case
        when public.payroll_cycles.status in ('locked', 'paid', 'void') then public.payroll_cycles.work_days_count
        else excluded.work_days_count
      end,
      salary_type = case
        when public.payroll_cycles.status in ('locked', 'paid', 'void') then public.payroll_cycles.salary_type
        else excluded.salary_type
      end,
      daily_salary = case
        when public.payroll_cycles.status in ('locked', 'paid', 'void') then public.payroll_cycles.daily_salary
        else excluded.daily_salary
      end,
      monthly_salary = case
        when public.payroll_cycles.status in ('locked', 'paid', 'void') then public.payroll_cycles.monthly_salary
        else excluded.monthly_salary
      end,
      payroll_method = case
        when public.payroll_cycles.status in ('locked', 'paid', 'void') then public.payroll_cycles.payroll_method
        else excluded.payroll_method
      end,
      gross_amount = case
        when public.payroll_cycles.status in ('locked', 'paid', 'void') then public.payroll_cycles.gross_amount
        else excluded.gross_amount
      end,
      net_amount = case
        when public.payroll_cycles.status in ('locked', 'paid', 'void') then public.payroll_cycles.net_amount
        else excluded.net_amount
      end,
      status = case
        when public.payroll_cycles.status in ('locked', 'paid', 'void') then public.payroll_cycles.status
        else excluded.status
      end,
      ready_at = case
        when public.payroll_cycles.status in ('locked', 'paid', 'void') then public.payroll_cycles.ready_at
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

  update public.attendance_logs
  set payroll_cycle_id = check_in_logs.payroll_cycle_id,
      updated_at = now()
  from public.attendance_daily_summaries
  join public.attendance_logs check_in_logs
    on check_in_logs.id = attendance_daily_summaries.check_in_log_id
  where attendance_logs.id = attendance_daily_summaries.check_out_log_id;

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
    and payroll_cycles.status not in ('locked', 'paid', 'void');

  update public.payroll_cycles
  set overtime_amount = coalesce((
        select sum(overtime_requests.total_amount)
        from public.overtime_requests
        where overtime_requests.payroll_cycle_id = payroll_cycles.id
          and overtime_requests.status = 'approved'
      ), 0),
      updated_at = now()
  where payroll_cycles.employee_id = target_employee_id
    and payroll_cycles.status not in ('locked', 'paid', 'void');

  update public.payroll_cycles
  set net_amount = greatest(coalesce(gross_amount, 0) + coalesce(overtime_amount, 0), 0),
      updated_at = now()
  where payroll_cycles.employee_id = target_employee_id
    and payroll_cycles.status not in ('locked', 'paid', 'void');

  delete from public.payroll_cycles
  where employee_id = target_employee_id
    and status not in ('locked', 'paid', 'void')
    and not exists (
      select 1
      from public.attendance_logs
      where attendance_logs.payroll_cycle_id = payroll_cycles.id
    );
end;
$$;

grant execute on function public.refresh_employee_payroll_cycles(uuid) to authenticated;

select public.refresh_all_employee_payroll_cycles();

insert into public.audit_logs (actor_name, action, target_table, target_id, status, metadata)
values
  (
    'System',
    'Set locked payroll cycle as next-cycle boundary',
    'payroll_cycles',
    '20260829000100',
    'success',
    '{"source":"migration","module":"payroll","policy":"locked-cycle-opens-next-cycle"}'::jsonb
  );
