-- Pisahkan jalur pembayaran lembur: bisa ikut gaji 26 hari atau dibayar terpisah mingguan/custom.

alter table public.overtime_requests
add column if not exists overtime_payment_policy text not null default 'separate';

update public.overtime_requests
set overtime_payment_policy = 'separate'
where overtime_payment_policy is null;

alter table public.overtime_requests
drop constraint if exists overtime_requests_overtime_payment_policy_check;

alter table public.overtime_requests
add constraint overtime_requests_overtime_payment_policy_check
check (overtime_payment_policy in ('separate', 'salary_cycle'));

create index if not exists idx_overtime_requests_payment_policy
on public.overtime_requests(overtime_payment_policy);

-- Data lama yang sudah approved dan belum pernah dibayar terpisah dianggap ikut gaji.
-- Ini menjaga perilaku lama tetap aman; request baru default-nya tetap Bayar Terpisah.
update public.overtime_requests
set overtime_payment_policy = 'salary_cycle'
where payroll_cycle_id is not null
  and status = 'approved'
  and overtime_payment_id is null
  and coalesce(overtime_requests.overtime_payment_status, 'unpaid') <> 'paid';

create or replace function public.apply_overtime_payment_policy_to_payroll_cycle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  salary_cycle_overtime numeric(14, 2);
begin
  if new.status in ('paid', 'void') then
    return new;
  end if;

  select coalesce(sum(coalesce(overtime_requests.total_amount, 0)), 0)
  into salary_cycle_overtime
  from public.overtime_requests
  where overtime_requests.payroll_cycle_id = new.id
    and overtime_requests.status = 'approved'
    and coalesce(overtime_requests.overtime_payment_status, 'unpaid') <> 'paid'
    and coalesce(overtime_requests.overtime_payment_policy, 'separate') = 'salary_cycle';

  new.overtime_amount := salary_cycle_overtime;
  new.net_amount := greatest(coalesce(new.gross_amount, 0) + salary_cycle_overtime, 0);
  return new;
end;
$$;

drop trigger if exists trg_payroll_cycles_overtime_payment_policy on public.payroll_cycles;
create trigger trg_payroll_cycles_overtime_payment_policy
before insert or update of gross_amount, overtime_amount, net_amount, status
on public.payroll_cycles
for each row execute function public.apply_overtime_payment_policy_to_payroll_cycle();

create or replace function public.request_overtime(
  target_employee_id uuid,
  target_overtime_date date,
  planned_start_time time,
  planned_end_time time,
  request_reason text,
  target_payment_policy text
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
  target_cycle_id uuid;
  target_cycle_status text;
  target_cycle_number integer;
  cleaned_reason text := nullif(trim(coalesce(request_reason, '')), '');
  normalized_payment_policy text := case when target_payment_policy = 'salary_cycle' then 'salary_cycle' else 'separate' end;
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
    overtime_requests.overtime_payment_policy,
    overtime_requests.payroll_cycle_id,
    payroll_cycles.status as payroll_status
  into existing_record
  from public.overtime_requests
  left join public.payroll_cycles on payroll_cycles.id = overtime_requests.payroll_cycle_id
  where overtime_requests.employee_id = target_employee_id
    and overtime_requests.overtime_date = target_overtime_date
  limit 1;

  if normalized_payment_policy = 'salary_cycle' then
    select
      payroll_cycles.id,
      payroll_cycles.status,
      payroll_cycles.cycle_number
    into target_cycle_id, target_cycle_status, target_cycle_number
    from public.payroll_cycles
    where payroll_cycles.employee_id = target_employee_id
      and target_overtime_date >= payroll_cycles.period_started_at
      and (
        payroll_cycles.period_closed_at is null
        or target_overtime_date <= payroll_cycles.period_closed_at
      )
    order by payroll_cycles.cycle_number desc, payroll_cycles.period_started_at desc
    limit 1;
  end if;

  if existing_record.status = 'approved' then
    raise exception 'Lembur tanggal ini sudah approved dan tidak bisa diganti lewat request baru.';
  end if;

  if normalized_payment_policy = 'salary_cycle'
     and coalesce(existing_record.payroll_status, target_cycle_status) in ('locked', 'paid', 'void') then
    raise exception 'Gaji 26 hari sudah final. Lembur ikut gaji tidak bisa diubah dari form request.';
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
    payroll_cycle_id,
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
    overtime_payment_policy,
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
    case when normalized_payment_policy = 'salary_cycle' then target_cycle_id else null end,
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
    normalized_payment_policy,
    planned_start_local at time zone 'Asia/Jakarta',
    planned_end_local at time zone 'Asia/Jakarta',
    planned_duration_minutes,
    cleaned_reason,
    actor_record.id,
    now(),
    false,
    format('Request lembur oleh %s. Rencana %s - %s (%s menit). Pembayaran: %s. Alasan: %s', actor_record.full_name, planned_start_time, planned_end_time, planned_duration_minutes, normalized_payment_policy, cleaned_reason)
  )
  on conflict (employee_id, overtime_date) do update set
    payroll_component_id = excluded.payroll_component_id,
    payroll_cycle_id = case
      when excluded.overtime_payment_policy = 'salary_cycle' then excluded.payroll_cycle_id
      else public.overtime_requests.payroll_cycle_id
    end,
    shift_start_time = excluded.shift_start_time,
    shift_end_time = excluded.shift_end_time,
    rate_amount = excluded.rate_amount,
    day_type = excluded.day_type,
    overtime_basis = excluded.overtime_basis,
    request_source = 'planned',
    overtime_payment_policy = excluded.overtime_payment_policy,
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
      'overtime_payment_policy', normalized_payment_policy,
      'previous_status', existing_record.status,
      'payroll_cycle_id', coalesce(target_cycle_id, existing_record.payroll_cycle_id),
      'payroll_cycle_number', target_cycle_number,
      'payroll_status', coalesce(existing_record.payroll_status, target_cycle_status),
      'source', 'rpc'
    )
  );

  perform public.refresh_employee_payroll_cycles(target_employee_id);

  return result_id;
end;
$$;

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
begin
  return public.request_overtime(
    target_employee_id,
    target_overtime_date,
    planned_start_time,
    planned_end_time,
    request_reason,
    'separate'
  );
end;
$$;

revoke all on function public.request_overtime(uuid, date, time, time, text) from public;
grant execute on function public.request_overtime(uuid, date, time, time, text) to authenticated;
grant execute on function public.request_overtime(uuid, date, time, time, text) to service_role;

revoke all on function public.request_overtime(uuid, date, time, time, text, text) from public;
grant execute on function public.request_overtime(uuid, date, time, time, text, text) to authenticated;
grant execute on function public.request_overtime(uuid, date, time, time, text, text) to service_role;

create or replace function public.rebuild_payroll_cycle_items(target_cycle_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  cycle_record record;
  overtime_record record;
  base_quantity numeric(14, 2);
  base_unit_amount numeric(14, 2);
begin
  select
    payroll_cycles.*,
    employees.employee_code,
    employees.full_name
  into cycle_record
  from public.payroll_cycles
  join public.employees on employees.id = payroll_cycles.employee_id
  where payroll_cycles.id = target_cycle_id;

  if not found then
    raise exception 'Data gaji tidak ditemukan.';
  end if;

  if cycle_record.status = 'paid'
     and exists (select 1 from public.payroll_cycle_items where payroll_cycle_id = target_cycle_id) then
    return;
  end if;

  delete from public.payroll_cycle_items
  where payroll_cycle_id = target_cycle_id;

  base_quantity := greatest(coalesce(cycle_record.work_days_count, 0), 1);
  base_unit_amount := case
    when coalesce(cycle_record.work_days_count, 0) > 0 then round(coalesce(cycle_record.gross_amount, 0) / base_quantity, 2)
    else coalesce(cycle_record.gross_amount, 0)
  end;

  insert into public.payroll_cycle_items (
    payroll_cycle_id,
    employee_id,
    item_type,
    item_name,
    source_table,
    source_id,
    quantity,
    unit_amount,
    amount,
    metadata
  )
  values (
    cycle_record.id,
    cycle_record.employee_id,
    'base_salary',
    case when cycle_record.salary_type = 'monthly' then 'Gaji bulanan' else 'Gaji harian' end,
    'payroll_cycles',
    cycle_record.id,
    base_quantity,
    base_unit_amount,
    coalesce(cycle_record.gross_amount, 0),
    jsonb_build_object(
      'employee_code', cycle_record.employee_code,
      'employee_name', cycle_record.full_name,
      'cycle_number', cycle_record.cycle_number,
      'salary_type', cycle_record.salary_type,
      'period_started_at', cycle_record.period_started_at,
      'period_closed_at', cycle_record.period_closed_at
    )
  );

  for overtime_record in
    select
      overtime_requests.*,
      coalesce(payroll_components.name, 'Lembur approved') as component_name
    from public.overtime_requests
    left join public.payroll_components on payroll_components.id = overtime_requests.payroll_component_id
    where overtime_requests.payroll_cycle_id = target_cycle_id
      and overtime_requests.status = 'approved'
      and coalesce(overtime_requests.overtime_payment_status, 'unpaid') <> 'paid'
      and coalesce(overtime_requests.overtime_payment_policy, 'separate') = 'salary_cycle'
  loop
    insert into public.payroll_cycle_items (
      payroll_cycle_id,
      employee_id,
      item_type,
      item_name,
      source_table,
      source_id,
      quantity,
      unit_amount,
      amount,
      metadata
    )
    values (
      cycle_record.id,
      cycle_record.employee_id,
      'overtime',
      overtime_record.component_name,
      'overtime_requests',
      overtime_record.id,
      round(coalesce(overtime_record.approved_minutes, overtime_record.overtime_minutes, 0)::numeric / 60, 2),
      coalesce(overtime_record.rate_amount, 0),
      coalesce(overtime_record.total_amount, 0),
      jsonb_build_object(
        'overtime_date', overtime_record.overtime_date,
        'day_type', overtime_record.day_type,
        'basis', overtime_record.overtime_basis,
        'planned_minutes', overtime_record.planned_minutes,
        'approved_minutes', overtime_record.approved_minutes,
        'overtime_payment_status', overtime_record.overtime_payment_status,
        'overtime_payment_policy', overtime_record.overtime_payment_policy
      )
    );
  end loop;
end;
$$;

revoke all on function public.rebuild_payroll_cycle_items(uuid) from public;
revoke execute on function public.rebuild_payroll_cycle_items(uuid) from authenticated;
grant execute on function public.rebuild_payroll_cycle_items(uuid) to service_role;

create or replace function public.mark_overtime_requests_paid(
  target_overtime_request_ids uuid[],
  actor_user_id uuid,
  actor_name text,
  payment_method text default 'bank_transfer',
  payment_reference text default null,
  paid_at timestamptz default now(),
  paid_amount numeric default null,
  note_text text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  request_count integer;
  employee_count integer;
  target_employee_id uuid;
  employee_record record;
  payment_record public.overtime_payments%rowtype;
  normalized_method text;
  normalized_paid_at timestamptz;
  normalized_paid_amount numeric(14, 2);
  total_minutes integer;
  total_amount numeric(14, 2);
  period_start date;
  period_end date;
  generated_payment_no text;
begin
  if target_overtime_request_ids is null or cardinality(target_overtime_request_ids) = 0 then
    raise exception 'Minimal satu request lembur wajib dipilih.';
  end if;

  drop table if exists pg_temp.selected_overtime_requests;

  create temporary table selected_overtime_requests on commit drop as
  select overtime_requests.*
  from public.overtime_requests
  where overtime_requests.id = any(target_overtime_request_ids)
  for update;

  select count(*), count(distinct employee_id)
  into request_count, employee_count
  from selected_overtime_requests;

  if request_count = 0 then
    raise exception 'Request lembur tidak ditemukan.';
  end if;

  if request_count <> cardinality(target_overtime_request_ids) then
    raise exception 'Sebagian request lembur tidak ditemukan.';
  end if;

  if employee_count <> 1 then
    raise exception 'Pembayaran lembur hanya bisa diproses per karyawan.';
  end if;

  select employee_id into target_employee_id from selected_overtime_requests limit 1;

  select employee_code, full_name
  into employee_record
  from public.employees
  where id = target_employee_id;

  if not found then
    raise exception 'Karyawan lembur tidak ditemukan.';
  end if;

  if exists (
    select 1
    from selected_overtime_requests
    where status <> 'approved'
  ) then
    raise exception 'Hanya lembur Approved yang bisa dibayar.';
  end if;

  if exists (
    select 1
    from selected_overtime_requests
    where coalesce(overtime_payment_policy, 'separate') <> 'separate'
  ) then
    raise exception 'Lembur ini diatur ikut gaji 26 hari, bukan pembayaran terpisah.';
  end if;

  if exists (
    select 1
    from selected_overtime_requests
    where coalesce(overtime_payment_status, 'unpaid') = 'paid'
       or overtime_payment_id is not null
  ) then
    raise exception 'Ada lembur yang sudah pernah dibayar.';
  end if;

  if exists (
    select 1
    from selected_overtime_requests
    where coalesce(approved_minutes, overtime_minutes, 0) <= 0
       or coalesce(total_amount, 0) <= 0
  ) then
    raise exception 'Durasi dan nominal lembur wajib lebih dari 0.';
  end if;

  select
    min(overtime_date),
    max(overtime_date),
    sum(coalesce(approved_minutes, overtime_minutes, 0))::integer,
    sum(coalesce(total_amount, 0))
  into period_start, period_end, total_minutes, total_amount
  from selected_overtime_requests;

  normalized_method := case
    when payment_method in ('cash', 'bank_transfer', 'ewallet', 'other') then payment_method
    else 'bank_transfer'
  end;
  normalized_paid_at := coalesce(paid_at, now());
  normalized_paid_amount := coalesce(paid_amount, total_amount);

  if normalized_paid_amount <= 0 then
    raise exception 'Nominal pembayaran wajib lebih dari 0.';
  end if;

  generated_payment_no := 'OT-' || to_char(normalized_paid_at at time zone 'Asia/Jakarta', 'YYYYMMDD') || '-' || upper(left(replace(gen_random_uuid()::text, '-', ''), 8));

  insert into public.overtime_payments (
    payment_no,
    employee_id,
    employee_code,
    employee_name,
    period_started_at,
    period_closed_at,
    request_count,
    overtime_minutes,
    overtime_amount,
    paid_amount,
    payment_method,
    payment_reference,
    paid_at,
    paid_by,
    paid_by_name,
    status,
    notes,
    metadata
  )
  values (
    generated_payment_no,
    target_employee_id,
    coalesce(employee_record.employee_code, ''),
    coalesce(employee_record.full_name, ''),
    period_start,
    period_end,
    request_count,
    total_minutes,
    total_amount,
    normalized_paid_amount,
    normalized_method,
    nullif(trim(coalesce(payment_reference, '')), ''),
    normalized_paid_at,
    actor_user_id,
    coalesce(actor_name, ''),
    'paid',
    nullif(trim(coalesce(note_text, '')), ''),
    jsonb_build_object(
      'source', 'edge-function',
      'payment_type', 'overtime',
      'payment_policy', 'separate',
      'request_ids', target_overtime_request_ids
    )
  )
  returning * into payment_record;

  insert into public.overtime_payment_items (
    overtime_payment_id,
    overtime_request_id,
    employee_id,
    overtime_date,
    approved_minutes,
    rate_amount,
    total_amount
  )
  select
    payment_record.id,
    id,
    employee_id,
    overtime_date,
    coalesce(approved_minutes, overtime_minutes, 0),
    coalesce(rate_amount, 0),
    coalesce(total_amount, 0)
  from selected_overtime_requests;

  update public.overtime_requests
  set
    overtime_payment_status = 'paid',
    overtime_payment_id = payment_record.id,
    overtime_paid_at = normalized_paid_at,
    overtime_paid_by = actor_user_id,
    overtime_payment_note = nullif(trim(coalesce(note_text, '')), ''),
    updated_at = now()
  where id = any(target_overtime_request_ids);

  perform public.refresh_employee_payroll_cycles(target_employee_id);

  insert into public.audit_logs (actor_user_id, actor_name, action, target_table, target_id, status, metadata)
  values (
    actor_user_id,
    actor_name,
    'Mark overtime paid',
    'overtime_payments',
    payment_record.id::text,
    'success',
    jsonb_build_object(
      'employee_id', target_employee_id,
      'employee_code', employee_record.employee_code,
      'employee_name', employee_record.full_name,
      'payment_no', payment_record.payment_no,
      'request_count', request_count,
      'overtime_minutes', total_minutes,
      'overtime_amount', total_amount,
      'paid_amount', normalized_paid_amount,
      'payment_method', normalized_method,
      'payment_policy', 'separate',
      'source', 'rpc'
    )
  );

  return jsonb_build_object(
    'payment', to_jsonb(payment_record),
    'request_count', request_count,
    'overtime_minutes', total_minutes,
    'overtime_amount', total_amount
  );
end;
$$;

create or replace function public.void_overtime_payment(
  target_payment_id uuid,
  actor_user_id uuid,
  actor_name text,
  note_text text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  payment_record public.overtime_payments%rowtype;
  affected_employee_id uuid;
  restored_count integer;
begin
  if target_payment_id is null then
    raise exception 'ID pembayaran lembur wajib ada.';
  end if;

  select *
  into payment_record
  from public.overtime_payments
  where id = target_payment_id
  for update;

  if not found then
    raise exception 'Pembayaran lembur tidak ditemukan.';
  end if;

  if payment_record.status <> 'paid' then
    raise exception 'Hanya pembayaran lembur aktif yang bisa dibatalkan.';
  end if;

  select payment_record.employee_id into affected_employee_id;

  update public.overtime_payments
  set
    status = 'void',
    notes = trim(both E'\n' from concat_ws(E'\n', nullif(notes, ''), case when nullif(trim(coalesce(note_text, '')), '') is null then 'Pembayaran lembur dibatalkan.' else 'Pembayaran lembur dibatalkan: ' || trim(note_text) end)),
    updated_at = now()
  where id = target_payment_id
  returning * into payment_record;

  update public.overtime_requests
  set
    overtime_payment_status = 'unpaid',
    overtime_payment_id = null,
    overtime_paid_at = null,
    overtime_paid_by = null,
    overtime_payment_note = null,
    updated_at = now()
  where overtime_payment_id = target_payment_id;

  get diagnostics restored_count = row_count;

  perform public.refresh_employee_payroll_cycles(affected_employee_id);

  insert into public.audit_logs (actor_user_id, actor_name, action, target_table, target_id, status, metadata)
  values (
    actor_user_id,
    actor_name,
    'Void overtime payment',
    'overtime_payments',
    target_payment_id::text,
    'success',
    jsonb_build_object(
      'employee_id', affected_employee_id,
      'payment_no', payment_record.payment_no,
      'restored_request_count', restored_count,
      'source', 'rpc'
    )
  );

  return jsonb_build_object(
    'payment', to_jsonb(payment_record),
    'restored_request_count', restored_count
  );
end;
$$;

revoke all on function public.mark_overtime_requests_paid(uuid[], uuid, text, text, text, timestamptz, numeric, text) from public;
revoke execute on function public.mark_overtime_requests_paid(uuid[], uuid, text, text, text, timestamptz, numeric, text) from authenticated;
grant execute on function public.mark_overtime_requests_paid(uuid[], uuid, text, text, text, timestamptz, numeric, text) to service_role;

revoke all on function public.void_overtime_payment(uuid, uuid, text, text) from public;
revoke execute on function public.void_overtime_payment(uuid, uuid, text, text) from authenticated;
grant execute on function public.void_overtime_payment(uuid, uuid, text, text) to service_role;

create or replace function public.mark_payroll_cycle_paid(
  target_cycle_id uuid,
  actor_user_id uuid,
  actor_name text,
  payment_method text default 'bank_transfer',
  payment_reference text default null,
  paid_at timestamptz default now(),
  paid_amount numeric default null,
  note_text text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  cycle_record record;
  employee_record record;
  payment_record public.payroll_payments%rowtype;
  updated_cycle record;
  review_count integer;
  open_overtime_count integer;
  normalized_method text;
  normalized_paid_at timestamptz;
  normalized_paid_amount numeric(14, 2);
  effective_net_amount numeric(14, 2);
  generated_payment_no text;
begin
  if target_cycle_id is null then
    raise exception 'ID gaji wajib ada.';
  end if;

  select *
  into cycle_record
  from public.payroll_cycles
  where id = target_cycle_id
  for update;

  if not found then
    raise exception 'Data gaji tidak ditemukan.';
  end if;

  if cycle_record.status <> 'locked' then
    raise exception 'Gaji wajib dikunci dulu sebelum dibayar.';
  end if;

  if exists (select 1 from public.payroll_payments where payroll_cycle_id = target_cycle_id and status = 'paid') then
    raise exception 'Gaji ini sudah punya transaksi pembayaran.';
  end if;

  select employee_code, full_name
  into employee_record
  from public.employees
  where id = cycle_record.employee_id;

  if not found then
    raise exception 'Karyawan gaji tidak ditemukan.';
  end if;

  select count(*)
  into review_count
  from public.attendance_logs
  where employee_id = cycle_record.employee_id
    and status = 'review'
    and (cycle_record.period_started_at is null or attendance_date >= cycle_record.period_started_at)
    and (cycle_record.period_closed_at is null or attendance_date <= cycle_record.period_closed_at);

  if review_count > 0 then
    raise exception 'Masih ada absensi review di periode gaji ini.';
  end if;

  select count(*)
  into open_overtime_count
  from public.overtime_requests
  where employee_id = cycle_record.employee_id
    and status in ('draft', 'pending')
    and coalesce(overtime_payment_policy, 'separate') = 'salary_cycle'
    and (cycle_record.period_started_at is null or overtime_date >= cycle_record.period_started_at)
    and (cycle_record.period_closed_at is null or overtime_date <= cycle_record.period_closed_at);

  if open_overtime_count > 0 then
    raise exception 'Masih ada lembur ikut gaji 26 hari yang belum selesai review di periode gaji ini.';
  end if;

  perform public.rebuild_payroll_cycle_items(target_cycle_id);

  update public.payroll_cycles
  set
    overtime_amount = coalesce((
      select sum(overtime_requests.total_amount)
      from public.overtime_requests
      where overtime_requests.payroll_cycle_id = target_cycle_id
        and overtime_requests.status = 'approved'
        and coalesce(overtime_requests.overtime_payment_status, 'unpaid') <> 'paid'
        and coalesce(overtime_requests.overtime_payment_policy, 'separate') = 'salary_cycle'
    ), 0),
    updated_at = now()
  where id = target_cycle_id;

  select *
  into cycle_record
  from public.payroll_cycles
  where id = target_cycle_id
  for update;

  normalized_method := case
    when payment_method in ('cash', 'bank_transfer', 'ewallet', 'other') then payment_method
    else 'bank_transfer'
  end;
  normalized_paid_at := coalesce(paid_at, now());
  effective_net_amount := greatest(coalesce(cycle_record.net_amount, coalesce(cycle_record.gross_amount, 0) + coalesce(cycle_record.overtime_amount, 0)), 0);
  normalized_paid_amount := coalesce(paid_amount, effective_net_amount);

  if normalized_paid_amount <= 0 then
    raise exception 'Nominal pembayaran wajib lebih dari 0.';
  end if;

  generated_payment_no := 'PAY-' || to_char(normalized_paid_at at time zone 'Asia/Jakarta', 'YYYYMMDD') || '-' || upper(left(replace(target_cycle_id::text, '-', ''), 8));

  insert into public.payroll_payments (
    payment_no,
    payroll_cycle_id,
    employee_id,
    employee_code,
    employee_name,
    cycle_number,
    period_started_at,
    period_closed_at,
    gross_amount,
    overtime_amount,
    net_amount,
    paid_amount,
    payment_method,
    payment_reference,
    paid_at,
    paid_by,
    paid_by_name,
    status,
    notes,
    metadata
  )
  values (
    generated_payment_no,
    cycle_record.id,
    cycle_record.employee_id,
    coalesce(employee_record.employee_code, ''),
    coalesce(employee_record.full_name, ''),
    coalesce(cycle_record.cycle_number, 0),
    cycle_record.period_started_at,
    cycle_record.period_closed_at,
    coalesce(cycle_record.gross_amount, 0),
    coalesce(cycle_record.overtime_amount, 0),
    effective_net_amount,
    normalized_paid_amount,
    normalized_method,
    nullif(trim(coalesce(payment_reference, '')), ''),
    normalized_paid_at,
    actor_user_id,
    coalesce(actor_name, ''),
    'paid',
    nullif(trim(coalesce(note_text, '')), ''),
    jsonb_build_object(
      'source', 'edge-function',
      'gross_amount', coalesce(cycle_record.gross_amount, 0),
      'overtime_amount', coalesce(cycle_record.overtime_amount, 0),
      'net_amount', effective_net_amount
    )
  )
  returning * into payment_record;

  update public.payroll_cycles
  set
    status = 'paid',
    processed_at = now(),
    paid_at = normalized_paid_at,
    processed_by = actor_user_id,
    net_amount = effective_net_amount,
    notes = trim(both E'\n' from concat_ws(E'\n', nullif(notes, ''), case when nullif(trim(coalesce(note_text, '')), '') is null then 'Finance mark paid.' else 'Finance mark paid: ' || trim(note_text) end)),
    updated_at = now()
  where id = target_cycle_id
  returning * into updated_cycle;

  insert into public.audit_logs (actor_user_id, actor_name, action, target_table, target_id, status, metadata)
  values (
    actor_user_id,
    actor_name,
    'Mark payroll paid',
    'payroll_cycles',
    target_cycle_id::text,
    'success',
    jsonb_build_object(
      'employee_id', cycle_record.employee_id,
      'employee_code', employee_record.employee_code,
      'employee_name', employee_record.full_name,
      'cycle_number', cycle_record.cycle_number,
      'previous_status', cycle_record.status,
      'next_status', 'paid',
      'payment_id', payment_record.id,
      'payment_no', payment_record.payment_no,
      'paid_amount', payment_record.paid_amount,
      'payment_method', payment_record.payment_method,
      'source', 'rpc'
    )
  );

  return jsonb_build_object(
    'payroll', to_jsonb(updated_cycle),
    'payment', to_jsonb(payment_record)
  );
end;
$$;

revoke all on function public.mark_payroll_cycle_paid(uuid, uuid, text, text, text, timestamptz, numeric, text) from public;
revoke execute on function public.mark_payroll_cycle_paid(uuid, uuid, text, text, text, timestamptz, numeric, text) from authenticated;
grant execute on function public.mark_payroll_cycle_paid(uuid, uuid, text, text, text, timestamptz, numeric, text) to service_role;

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
          select max(attendance_daily_summaries.attendance_date)
          from public.attendance_daily_summaries
          where attendance_daily_summaries.payroll_cycle_id = payroll_cycles.id
        ),
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
      and (
        latest_final_cycle.boundary_date is null
        or attendance_daily_summaries.attendance_date > latest_final_cycle.boundary_date
        or (
          attendance_daily_summaries.attendance_date = latest_final_cycle.boundary_date
          and not exists (
            select 1
            from public.attendance_daily_summaries finalized_summaries
            join public.payroll_cycles finalized_cycles
              on finalized_cycles.id = finalized_summaries.payroll_cycle_id
             and finalized_cycles.status in ('locked', 'paid', 'void')
            where finalized_summaries.employee_id = attendance_daily_summaries.employee_id
              and finalized_summaries.attendance_date = attendance_daily_summaries.attendance_date
          )
        )
      )
  ),
  grouped_days as (
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
      grouped_days.employee_id,
      grouped_days.cycle_number,
      case
        when grouped_days.base_cycle_number = 0
          and grouped_days.cycle_number = 1
          and max(grouped_days.opening_days) > 0
          then coalesce(min(grouped_days.opening_date), min(grouped_days.attendance_date))
        else min(grouped_days.attendance_date)
      end as period_started_at,
      case when max(grouped_days.cycle_day_number) >= 26 then max(grouped_days.attendance_date) else null end as period_closed_at,
      least(max(grouped_days.cycle_day_number)::integer, 26) as work_days_count
    from grouped_days
    group by grouped_days.employee_id, grouped_days.cycle_number, grouped_days.base_cycle_number
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
  update public.attendance_daily_summaries
  set payroll_cycle_id = upserted_cycles.id,
      updated_at = now()
  from grouped_days
  join upserted_cycles
    on upserted_cycles.employee_id = grouped_days.employee_id
   and upserted_cycles.cycle_number = grouped_days.cycle_number
  where attendance_daily_summaries.employee_id = grouped_days.employee_id
    and attendance_daily_summaries.attendance_date = grouped_days.attendance_date;

  update public.attendance_logs
  set payroll_cycle_id = attendance_daily_summaries.payroll_cycle_id,
      updated_at = now()
  from public.attendance_daily_summaries
  where attendance_logs.id in (attendance_daily_summaries.check_in_log_id, attendance_daily_summaries.check_out_log_id)
    and attendance_daily_summaries.payroll_cycle_id is not null;

  update public.leave_requests
  set payroll_cycle_id = payroll_cycles.id,
      updated_at = now()
  from public.payroll_cycles
  where leave_requests.employee_id = target_employee_id
    and leave_requests.employee_id = payroll_cycles.employee_id
    and leave_requests.status = 'approved'
    and leave_requests.pay_policy = 'paid'
    and payroll_cycles.status not in ('locked', 'paid', 'void')
    and leave_requests.start_date <= coalesce(payroll_cycles.period_closed_at, leave_requests.start_date)
    and leave_requests.end_date >= payroll_cycles.period_started_at;

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
    and coalesce(overtime_requests.overtime_payment_status, 'unpaid') <> 'paid'
    and payroll_cycles.status not in ('locked', 'paid', 'void');

  update public.payroll_cycles
  set overtime_amount = coalesce((
        select sum(overtime_requests.total_amount)
        from public.overtime_requests
        where overtime_requests.payroll_cycle_id = payroll_cycles.id
          and overtime_requests.status = 'approved'
          and coalesce(overtime_requests.overtime_payment_status, 'unpaid') <> 'paid'
          and coalesce(overtime_requests.overtime_payment_policy, 'separate') = 'salary_cycle'
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
      from public.attendance_daily_summaries
      where attendance_daily_summaries.payroll_cycle_id = payroll_cycles.id
    );
end;
$$;

grant execute on function public.refresh_employee_payroll_cycles(uuid) to authenticated;
grant execute on function public.refresh_employee_payroll_cycles(uuid) to service_role;

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
  ('System', 'Split overtime salary payment policy', 'overtime_requests', '20260905000100', 'success', '{"source":"migration","module":"payroll","summary":"separate-overtime-and-salary-payments"}'::jsonb);

notify pgrst, 'reload schema';
