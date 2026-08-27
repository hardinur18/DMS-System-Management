-- Guard planned overtime requests against final payroll cycles.
-- Request lembur boleh di-update selama belum approved dan cycle payroll belum locked/paid.

create or replace function public.request_overtime(
  target_employee_id uuid,
  target_overtime_date date,
  planned_start_time time,
  planned_end_time time,
  request_reason text default ''
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_record record;
  employee_record record;
  component_record record;
  existing_record record;
  cleaned_reason text := nullif(trim(coalesce(request_reason, '')), '');
  detected_day_type text;
  planned_start_local timestamp;
  planned_end_local timestamp;
  planned_duration_minutes integer;
  result_id uuid;
begin
  if not (
    public.has_app_permission('overtime.review')
    or public.has_app_permission('payroll.process')
    or public.has_app_permission('attendance.review')
  ) then
    raise exception 'Role tidak punya akses membuat request lembur.';
  end if;

  if target_employee_id is null then
    raise exception 'Karyawan wajib dipilih.';
  end if;

  if target_overtime_date is null then
    raise exception 'Tanggal lembur wajib diisi.';
  end if;

  if planned_start_time is null or planned_end_time is null then
    raise exception 'Jam rencana lembur wajib lengkap.';
  end if;

  if cleaned_reason is null then
    raise exception 'Alasan lembur wajib diisi.';
  end if;

  select app_users.id, app_users.full_name
  into actor_record
  from public.app_users
  where app_users.auth_user_id = auth.uid()
    and app_users.status = 'active'
  limit 1;

  if actor_record.id is null then
    raise exception 'User aplikasi tidak aktif.';
  end if;

  select
    employees.id,
    employees.full_name,
    shifts.start_time as shift_start_time,
    shifts.end_time as shift_end_time
  into employee_record
  from public.employees
  left join public.shifts on shifts.id = employees.shift_id
  where employees.id = target_employee_id
    and employees.deleted_at is null
    and employees.status <> 'inactive'
  limit 1;

  if employee_record.id is null then
    raise exception 'Karyawan tidak ditemukan atau tidak aktif.';
  end if;

  select
    overtime_requests.id,
    overtime_requests.status,
    overtime_requests.payroll_cycle_id,
    payroll_cycles.status as payroll_status
  into existing_record
  from public.overtime_requests
  left join public.payroll_cycles on payroll_cycles.id = overtime_requests.payroll_cycle_id
  where overtime_requests.employee_id = target_employee_id
    and overtime_requests.overtime_date = target_overtime_date
  limit 1;

  if existing_record.status = 'approved' then
    raise exception 'Lembur tanggal ini sudah approved dan tidak bisa diganti lewat request baru.';
  end if;

  if existing_record.payroll_status in ('locked', 'paid') then
    raise exception 'Payroll cycle sudah final. Request lembur tidak bisa diubah dari form request.';
  end if;

  planned_start_local := target_overtime_date::timestamp + planned_start_time;
  planned_end_local := target_overtime_date::timestamp + planned_end_time;

  if planned_end_time <= planned_start_time then
    planned_end_local := planned_end_local + interval '1 day';
  end if;

  planned_duration_minutes := greatest(0, floor(extract(epoch from (planned_end_local - planned_start_local)) / 60))::integer;

  if planned_duration_minutes <= 0 then
    raise exception 'Durasi rencana lembur tidak valid.';
  end if;

  detected_day_type := case
    when extract(isodow from target_overtime_date) = 7 then 'sunday'
    else 'weekday'
  end;

  select id, rate_amount, overtime_basis
  into component_record
  from public.payroll_components
  where component_type = 'earning'
    and calculation_unit = 'hour'
    and auto_detect_overtime = true
    and is_active = true
    and day_type in (detected_day_type, 'all')
  order by case when day_type = detected_day_type then 0 else 1 end, sort_order asc, code asc
  limit 1;

  if component_record.id is null then
    raise exception 'Komponen lembur aktif belum disiapkan di Master Data.';
  end if;

  insert into public.overtime_requests (
    employee_id,
    payroll_component_id,
    overtime_date,
    shift_start_time,
    shift_end_time,
    overtime_minutes,
    approved_minutes,
    rate_amount,
    total_amount,
    day_type,
    overtime_basis,
    status,
    request_source,
    planned_start_at,
    planned_end_at,
    planned_minutes,
    request_reason,
    requested_by,
    requested_at,
    matched_attendance,
    notes
  )
  values (
    target_employee_id,
    component_record.id,
    target_overtime_date,
    employee_record.shift_start_time,
    employee_record.shift_end_time,
    0,
    0,
    component_record.rate_amount,
    0,
    detected_day_type,
    component_record.overtime_basis,
    'draft',
    'planned',
    planned_start_local at time zone 'Asia/Jakarta',
    planned_end_local at time zone 'Asia/Jakarta',
    planned_duration_minutes,
    cleaned_reason,
    actor_record.id,
    now(),
    false,
    format('Request lembur oleh %s. Rencana %s - %s (%s menit). Alasan: %s', actor_record.full_name, planned_start_time, planned_end_time, planned_duration_minutes, cleaned_reason)
  )
  on conflict (employee_id, overtime_date) do update set
    payroll_component_id = excluded.payroll_component_id,
    shift_start_time = excluded.shift_start_time,
    shift_end_time = excluded.shift_end_time,
    rate_amount = excluded.rate_amount,
    day_type = excluded.day_type,
    overtime_basis = excluded.overtime_basis,
    request_source = 'planned',
    planned_start_at = excluded.planned_start_at,
    planned_end_at = excluded.planned_end_at,
    planned_minutes = excluded.planned_minutes,
    request_reason = excluded.request_reason,
    requested_by = excluded.requested_by,
    requested_at = excluded.requested_at,
    status = case
      when public.overtime_requests.actual_check_out_at is not null and public.overtime_requests.overtime_minutes > 0 then 'pending'
      else 'draft'
    end,
    notes = trim(both E'\n' from concat_ws(E'\n', nullif(public.overtime_requests.notes, ''), excluded.notes)),
    updated_at = now()
  returning id into result_id;

  insert into public.audit_logs (actor_user_id, actor_name, action, target_table, target_id, status, metadata)
  values (
    actor_record.id,
    actor_record.full_name,
    case when existing_record.id is null then 'Request overtime' else 'Update overtime request' end,
    'overtime_requests',
    result_id::text,
    'success',
    jsonb_build_object(
      'employee_id', target_employee_id,
      'overtime_date', target_overtime_date,
      'planned_minutes', planned_duration_minutes,
      'overtime_basis', component_record.overtime_basis,
      'previous_status', existing_record.status,
      'payroll_status', existing_record.payroll_status,
      'source', 'rpc'
    )
  );

  return result_id;
end;
$$;

revoke all on function public.request_overtime(uuid, date, time, time, text) from public;
grant execute on function public.request_overtime(uuid, date, time, time, text) to authenticated;
grant execute on function public.request_overtime(uuid, date, time, time, text) to service_role;

insert into public.audit_logs (actor_name, action, target_table, target_id, status, metadata)
values
  ('System', 'Add overtime request guardrails', 'overtime_requests', '20260827000500', 'success', '{"source":"migration","module":"overtime-request","guard":"payroll-final"}'::jsonb);
