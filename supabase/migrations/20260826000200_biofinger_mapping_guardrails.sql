-- Biofinger mapping guardrails.
-- Centralizes mapping writes so UI changes are validated and audited by the backend.

create or replace function public.update_biofinger_user_mapping(
  target_link_id uuid,
  target_employee_id uuid default null,
  target_status text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_role text := coalesce(auth.role(), current_setting('request.jwt.claim.role', true), '');
  actor_app_user_id uuid;
  actor_display_name text := 'Management App';
  device_code text := '';
  device_name text := '';
  device_serial_number text := '';
  employee_status text := '';
  next_employee_code text := '';
  next_employee_name text := '';
  link_row public.employee_attendance_device_links%rowtype;
  previous_employee_id uuid;
  previous_status text;
  next_employee_id uuid := target_employee_id;
  next_status text := coalesce(nullif(trim(target_status), ''), case when target_employee_id is null then 'pending' else 'active' end);
  next_import_status text;
  updated_events integer := 0;
begin
  if actor_role = 'authenticated'
     and not (
       (select public.has_app_permission('biofinger.manage'))
       or (select public.has_app_permission('attendance.review'))
       or (select public.has_app_permission('employees.manage'))
     ) then
    raise exception 'Tidak punya izin untuk mengubah mapping Biofinger.'
      using errcode = '42501';
  end if;

  if target_link_id is null then
    raise exception 'Mapping Biofinger wajib dipilih.';
  end if;

  if next_status not in ('pending', 'active', 'ignored', 'inactive') then
    raise exception 'Status mapping Biofinger tidak valid: %', next_status;
  end if;

  select *
  into link_row
  from public.employee_attendance_device_links
  where id = target_link_id
  for update;

  if not found then
    raise exception 'Mapping Biofinger tidak ditemukan.';
  end if;

  select attendance_devices.device_code, attendance_devices.name, attendance_devices.serial_number
  into device_code, device_name, device_serial_number
  from public.attendance_devices
  where id = link_row.attendance_device_id;

  previous_employee_id := link_row.employee_id;
  previous_status := link_row.status;

  if next_status = 'active' then
    if next_employee_id is null then
      raise exception 'Pilih karyawan DMS sebelum mengaktifkan mapping Biofinger.';
    end if;

    select employees.id, employees.employee_code, employees.full_name, employees.status
    into next_employee_id, next_employee_code, next_employee_name, employee_status
    from public.employees
    where id = next_employee_id
      and deleted_at is null;

    if not found then
      raise exception 'Karyawan DMS untuk mapping Biofinger tidak ditemukan.';
    end if;

    if employee_status <> 'active' then
      raise exception 'Karyawan % belum aktif, tidak bisa dipakai untuk mapping Biofinger.', next_employee_name;
    end if;

    if exists (
      select 1
      from public.employee_attendance_device_links other_link
      where other_link.id <> link_row.id
        and other_link.attendance_device_id = link_row.attendance_device_id
        and other_link.employee_id = next_employee_id
        and other_link.status = 'active'
    ) then
      raise exception 'Karyawan % sudah aktif di User ID Biofinger lain.', next_employee_name;
    end if;
  else
    next_employee_id := null;
  end if;

  update public.employee_attendance_device_links
  set employee_id = next_employee_id,
      status = next_status,
      matched_by = 'manual',
      last_synced_at = now(),
      updated_at = now()
  where id = link_row.id
  returning *
  into link_row;

  next_import_status := case
    when next_status = 'active' then 'mapped'
    when next_status = 'ignored' then 'ignored'
    else 'pending'
  end;

  update public.biofinger_attendance_events as events
  set employee_id = next_employee_id,
      import_status = next_import_status,
      updated_at = now()
  where events.attendance_device_id = link_row.attendance_device_id
    and events.external_user_id = link_row.external_user_id
    and events.import_status in ('pending', 'mapped', 'ignored');

  get diagnostics updated_events = row_count;

  select app_user.id, app_user.full_name
  into actor_app_user_id, actor_display_name
  from public.app_users app_user
  where app_user.auth_user_id = auth.uid()
     or app_user.id = auth.uid()
  limit 1;

  insert into public.audit_logs (
    actor_user_id,
    actor_name,
    action,
    target_table,
    target_id,
    status,
    metadata
  )
  values (
    actor_app_user_id,
    coalesce(actor_display_name, 'Management App'),
    case
      when next_status = 'active' and previous_employee_id is distinct from next_employee_id then 'Map Biofinger user'
      when next_status = 'active' then 'Refresh Biofinger mapping'
      when next_status = 'ignored' then 'Ignore Biofinger user'
      when previous_employee_id is not null and next_employee_id is null then 'Clear Biofinger mapping'
      else 'Set Biofinger mapping pending'
    end,
    'employee_attendance_device_links',
    link_row.id::text,
    'success',
    jsonb_build_object(
      'module', 'biofinger',
      'attendance_device_id', link_row.attendance_device_id,
      'device_code', coalesce(device_code, ''),
      'device_name', coalesce(device_name, ''),
      'device_serial_number', coalesce(device_serial_number, ''),
      'external_user_id', link_row.external_user_id,
      'external_uid', link_row.external_uid,
      'external_name', coalesce(link_row.external_name, ''),
      'previous_status', previous_status,
      'next_status', next_status,
      'previous_employee_id', previous_employee_id,
      'next_employee_id', next_employee_id,
      'next_employee_code', coalesce(next_employee_code, ''),
      'next_employee_name', coalesce(next_employee_name, ''),
      'events_updated', updated_events
    )
  );

  return jsonb_build_object(
    'link_id', link_row.id,
    'attendance_device_id', link_row.attendance_device_id,
    'external_user_id', link_row.external_user_id,
    'employee_id', link_row.employee_id,
    'status', link_row.status,
    'matched_by', link_row.matched_by,
    'last_synced_at', link_row.last_synced_at,
    'events_updated', updated_events
  );
end;
$$;

revoke all on function public.update_biofinger_user_mapping(uuid, uuid, text) from public;
grant execute on function public.update_biofinger_user_mapping(uuid, uuid, text) to authenticated;
grant execute on function public.update_biofinger_user_mapping(uuid, uuid, text) to service_role;

insert into public.audit_logs (actor_name, action, target_table, target_id, status, metadata)
values
  ('System', 'Create Biofinger mapping guardrails', 'employee_attendance_device_links', '20260826000200', 'success', '{"source":"migration","module":"biofinger","guardrail":"mapping-audit"}'::jsonb);
