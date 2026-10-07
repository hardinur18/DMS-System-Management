create index if not exists idx_payroll_cycles_operational_scope
on public.payroll_cycles(status, cycle_number desc, employee_id);

create index if not exists idx_payroll_cycles_period_closed_at_desc
on public.payroll_cycles(period_closed_at desc);

create or replace function public.refresh_employee_payroll_cycles_for_attendance_range(
  target_start_date date,
  target_end_date date
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_start date := coalesce(target_start_date, current_date);
  normalized_end date := coalesce(target_end_date, coalesce(target_start_date, current_date));
  affected_employee record;
  refreshed_count integer := 0;
begin
  if normalized_end < normalized_start then
    normalized_end := normalized_start;
  end if;

  for affected_employee in
    select distinct employees.id
    from public.employees
    join (
      select attendance_daily_summaries.employee_id
      from public.attendance_daily_summaries
      where attendance_daily_summaries.attendance_date between normalized_start and normalized_end
      union
      select attendance_logs.employee_id
      from public.attendance_logs
      where attendance_logs.attendance_date between normalized_start and (normalized_end + 1)
      union
      select leave_requests.employee_id
      from public.leave_requests
      where leave_requests.start_date <= normalized_end
        and leave_requests.end_date >= normalized_start
      union
      select overtime_requests.employee_id
      from public.overtime_requests
      where overtime_requests.overtime_date between normalized_start and normalized_end
    ) affected on affected.employee_id = employees.id
    where employees.deleted_at is null
  loop
    perform public.refresh_employee_payroll_cycles(affected_employee.id);
    refreshed_count := refreshed_count + 1;
  end loop;

  return refreshed_count;
end;
$$;

grant execute on function public.refresh_employee_payroll_cycles_for_attendance_range(date, date) to authenticated;
grant execute on function public.refresh_employee_payroll_cycles_for_attendance_range(date, date) to service_role;

insert into public.audit_logs (actor_name, action, target_table, target_id, status, metadata)
values
  ('System', 'Scope live attendance payroll refresh', 'payroll_cycles', '20261007000100', 'success', '{"source":"migration","module":"attendance","summary":"scoped-payroll-refresh"}'::jsonb);

notify pgrst, 'reload schema';
