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
  payment_total_amount numeric(14, 2);
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

  select count(*), count(distinct selected_overtime_requests.employee_id)
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

  select selected_overtime_requests.employee_id
  into target_employee_id
  from selected_overtime_requests
  limit 1;

  select employees.employee_code, employees.full_name
  into employee_record
  from public.employees
  where employees.id = target_employee_id;

  if not found then
    raise exception 'Karyawan lembur tidak ditemukan.';
  end if;

  if exists (
    select 1
    from selected_overtime_requests
    where selected_overtime_requests.status <> 'approved'
  ) then
    raise exception 'Hanya lembur Approved yang bisa dibayar.';
  end if;

  if exists (
    select 1
    from selected_overtime_requests
    where coalesce(selected_overtime_requests.overtime_payment_policy, 'separate') <> 'separate'
  ) then
    raise exception 'Lembur ini diatur ikut gaji 26 hari, bukan pembayaran terpisah.';
  end if;

  if exists (
    select 1
    from selected_overtime_requests
    where coalesce(selected_overtime_requests.overtime_payment_status, 'unpaid') = 'paid'
       or selected_overtime_requests.overtime_payment_id is not null
  ) then
    raise exception 'Ada lembur yang sudah pernah dibayar.';
  end if;

  if exists (
    select 1
    from selected_overtime_requests
    where coalesce(selected_overtime_requests.approved_minutes, selected_overtime_requests.overtime_minutes, 0) <= 0
       or coalesce(selected_overtime_requests.total_amount, 0) <= 0
  ) then
    raise exception 'Durasi dan nominal lembur wajib lebih dari 0.';
  end if;

  select
    min(selected_overtime_requests.overtime_date),
    max(selected_overtime_requests.overtime_date),
    sum(coalesce(selected_overtime_requests.approved_minutes, selected_overtime_requests.overtime_minutes, 0))::integer,
    sum(coalesce(selected_overtime_requests.total_amount, 0))
  into period_start, period_end, total_minutes, payment_total_amount
  from selected_overtime_requests;

  normalized_method := case
    when payment_method in ('cash', 'bank_transfer', 'ewallet', 'other') then payment_method
    else 'bank_transfer'
  end;
  normalized_paid_at := coalesce(paid_at, now());
  normalized_paid_amount := coalesce(paid_amount, payment_total_amount);

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
    payment_total_amount,
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
    selected_overtime_requests.id,
    selected_overtime_requests.employee_id,
    selected_overtime_requests.overtime_date,
    coalesce(selected_overtime_requests.approved_minutes, selected_overtime_requests.overtime_minutes, 0),
    coalesce(selected_overtime_requests.rate_amount, 0),
    coalesce(selected_overtime_requests.total_amount, 0)
  from selected_overtime_requests;

  update public.overtime_requests
  set
    overtime_payment_status = 'paid',
    overtime_payment_id = payment_record.id,
    overtime_paid_at = normalized_paid_at,
    overtime_paid_by = actor_user_id,
    overtime_payment_note = nullif(trim(coalesce(note_text, '')), ''),
    updated_at = now()
  where overtime_requests.id = any(target_overtime_request_ids);

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
      'overtime_amount', payment_total_amount,
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
    'overtime_amount', payment_total_amount
  );
end;
$$;

revoke all on function public.mark_overtime_requests_paid(uuid[], uuid, text, text, text, timestamptz, numeric, text) from public;
revoke execute on function public.mark_overtime_requests_paid(uuid[], uuid, text, text, text, timestamptz, numeric, text) from authenticated;
grant execute on function public.mark_overtime_requests_paid(uuid[], uuid, text, text, text, timestamptz, numeric, text) to service_role;

insert into public.audit_logs (actor_name, action, target_table, target_id, status, metadata)
select
  'System',
  'Fix overtime payment RPC ambiguity',
  'overtime_payments',
  '20260915000100',
  'success',
  '{"source":"migration","module":"payroll","summary":"qualify-overtime-payment-total-amount"}'::jsonb
where not exists (
  select 1
  from public.audit_logs
  where target_table = 'overtime_payments'
    and target_id = '20260915000100'
    and action = 'Fix overtime payment RPC ambiguity'
);
