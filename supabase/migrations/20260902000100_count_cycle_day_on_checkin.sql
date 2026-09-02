-- Payroll readiness policy.
-- A valid check-in counts the workday immediately, so cycle 26/26 moves to ready
-- without waiting for check-out settlement at the end of the day.

do $$
declare
  function_definition text;
begin
  select pg_get_functiondef('public.refresh_attendance_daily_summary(uuid, date)'::regprocedure)
  into function_definition;

  function_definition := replace(
    function_definition,
    '  if check_in_record.id is not null then
    next_workday_counted := (
      check_out_record.id is not null
      and next_attendance_status = ''valid''
    );
  end if;',
    '  if check_in_record.id is not null then
    next_workday_counted := (
      check_in_record.status = ''valid''
      and check_in_record.face_status <> ''failed''
      and coalesce(check_in_record.gps_status, ''valid'') <> ''out_of_radius''
      and next_settlement_status <> ''failed''
    );
  end if;'
  );

  if function_definition not like '%check_in_record.status = ''valid''%' then
    raise exception 'Gagal memperbarui refresh_attendance_daily_summary: pola rule lama tidak ditemukan.';
  end if;

  execute function_definition;
end;
$$;

do $$
declare
  employee_record record;
begin
  for employee_record in select id from public.employees where deleted_at is null loop
    perform public.refresh_employee_payroll_cycles(employee_record.id);
  end loop;
end;
$$;

insert into public.audit_logs (actor_name, action, target_table, target_id, status, metadata)
values
  (
    'System',
    'Count payroll cycle workday on valid check-in',
    'attendance_daily_summaries',
    '20260902000100',
    'success',
    '{"source":"migration","module":"payroll","policy":"cycle-ready-on-check-in"}'::jsonb
  );
