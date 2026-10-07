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
        and attendance_daily_summaries.workday_counted = true
        and attendance_daily_summaries.payroll_cycle_id is null
      union
      select attendance_logs.employee_id
      from public.attendance_logs
      where attendance_logs.attendance_date between normalized_start and (normalized_end + 1)
        and attendance_logs.workday_counted = true
        and attendance_logs.payroll_cycle_id is null
      union
      select leave_requests.employee_id
      from public.leave_requests
      where leave_requests.start_date <= normalized_end
        and leave_requests.end_date >= normalized_start
        and leave_requests.status = 'approved'
        and leave_requests.payroll_cycle_id is null
      union
      select overtime_requests.employee_id
      from public.overtime_requests
      where overtime_requests.overtime_date between normalized_start and normalized_end
        and overtime_requests.status = 'approved'
        and overtime_requests.payroll_cycle_id is null
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
  ('System', 'Optimize scoped live payroll refresh', 'payroll_cycles', '20261007000200', 'success', '{"source":"migration","module":"attendance","summary":"skip-fresh-payroll-links"}'::jsonb);

notify pgrst, 'reload schema';
