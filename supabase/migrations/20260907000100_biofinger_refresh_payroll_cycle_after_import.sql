-- Ensure Biofinger imports advance payroll cycle counts immediately.
-- The 2026-09-03 fast conversion refreshed daily summaries but no longer
-- refreshed payroll cycles, so Live Absensi could show stale cycle days.

do $$
declare
  function_definition text;
  old_block text := '  employees_refreshed := (select count(distinct employee_id)::integer from tmp_biofinger_upserted);
  return next;';
  new_block text := '  select count(*)::integer
  into employees_refreshed
  from (
    select public.refresh_employee_payroll_cycles(affected_employees.employee_id)
    from (
      select distinct tmp_biofinger_upserted.employee_id
      from tmp_biofinger_upserted
      where tmp_biofinger_upserted.employee_id is not null
    ) as affected_employees
  ) as refreshed_employees;

  return next;';
begin
  select pg_get_functiondef('public.convert_biofinger_attendance_events(uuid, integer)'::regprocedure)
  into function_definition;

  if function_definition is null then
    raise exception 'convert_biofinger_attendance_events(uuid, integer) tidak ditemukan.';
  end if;

  if position('refresh_employee_payroll_cycles(affected_employees.employee_id)' in function_definition) > 0
     or position('refresh_employee_payroll_cycles(employee_record.employee_id)' in function_definition) > 0 then
    return;
  end if;

  if position(old_block in function_definition) = 0 then
    raise exception 'Gagal memasang auto refresh cycle: anchor employees_refreshed tidak ditemukan.';
  end if;

  function_definition := replace(function_definition, old_block, new_block);
  execute function_definition;

  if position('refresh_employee_payroll_cycles(affected_employees.employee_id)' in function_definition) = 0 then
    raise exception 'Gagal memasang auto refresh cycle Biofinger.';
  end if;
end
$$;

revoke all on function public.convert_biofinger_attendance_events(uuid, integer) from public;
grant execute on function public.convert_biofinger_attendance_events(uuid, integer) to authenticated;
grant execute on function public.convert_biofinger_attendance_events(uuid, integer) to service_role;
