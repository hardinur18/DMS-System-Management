-- Payroll payment ledger.
-- Paid payroll harus menjadi transaksi audit, bukan hanya perubahan status cycle.

create table if not exists public.payroll_cycle_items (
  id uuid primary key default gen_random_uuid(),
  payroll_cycle_id uuid not null references public.payroll_cycles(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  item_type text not null check (item_type in ('base_salary', 'overtime', 'bonus', 'deduction', 'cash_advance', 'adjustment')),
  item_name text not null,
  source_table text,
  source_id uuid,
  quantity numeric(14, 2) not null default 1,
  unit_amount numeric(14, 2) not null default 0,
  amount numeric(14, 2) not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_payroll_cycle_items_cycle on public.payroll_cycle_items(payroll_cycle_id);
create index if not exists idx_payroll_cycle_items_employee on public.payroll_cycle_items(employee_id);
create index if not exists idx_payroll_cycle_items_type on public.payroll_cycle_items(item_type);

drop trigger if exists trg_payroll_cycle_items_updated_at on public.payroll_cycle_items;
create trigger trg_payroll_cycle_items_updated_at
before update on public.payroll_cycle_items
for each row execute function public.set_updated_at();

create table if not exists public.payroll_payments (
  id uuid primary key default gen_random_uuid(),
  payment_no text not null unique,
  payroll_cycle_id uuid not null unique references public.payroll_cycles(id) on delete restrict,
  employee_id uuid not null references public.employees(id) on delete restrict,
  employee_code text not null default '',
  employee_name text not null default '',
  cycle_number integer not null default 0,
  period_started_at date,
  period_closed_at date,
  gross_amount numeric(14, 2) not null default 0 check (gross_amount >= 0),
  overtime_amount numeric(14, 2) not null default 0 check (overtime_amount >= 0),
  net_amount numeric(14, 2) not null default 0 check (net_amount >= 0),
  paid_amount numeric(14, 2) not null default 0 check (paid_amount >= 0),
  payment_method text not null default 'bank_transfer' check (payment_method in ('cash', 'bank_transfer', 'ewallet', 'other')),
  payment_reference text,
  paid_at timestamptz not null default now(),
  paid_by uuid references public.app_users(id) on delete set null,
  paid_by_name text not null default '',
  status text not null default 'paid' check (status in ('paid', 'void', 'reversed')),
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_payroll_payments_employee on public.payroll_payments(employee_id, paid_at desc);
create index if not exists idx_payroll_payments_paid_at on public.payroll_payments(paid_at desc);
create index if not exists idx_payroll_payments_status on public.payroll_payments(status);

drop trigger if exists trg_payroll_payments_updated_at on public.payroll_payments;
create trigger trg_payroll_payments_updated_at
before update on public.payroll_payments
for each row execute function public.set_updated_at();

alter table public.payroll_cycle_items enable row level security;
alter table public.payroll_payments enable row level security;

drop policy if exists "Production read payroll cycle items" on public.payroll_cycle_items;
create policy "Production read payroll cycle items"
on public.payroll_cycle_items for select
to authenticated
using (public.has_app_permission('payroll.view'));

drop policy if exists "Production manage payroll cycle items" on public.payroll_cycle_items;
create policy "Production manage payroll cycle items"
on public.payroll_cycle_items for all
to authenticated
using (public.has_app_permission('payroll.process'))
with check (public.has_app_permission('payroll.process'));

drop policy if exists "Production read payroll payments" on public.payroll_payments;
create policy "Production read payroll payments"
on public.payroll_payments for select
to authenticated
using (public.has_app_permission('payroll.view'));

drop policy if exists "Production manage payroll payments" on public.payroll_payments;
create policy "Production manage payroll payments"
on public.payroll_payments for all
to authenticated
using (public.has_app_permission('payroll.process'))
with check (public.has_app_permission('payroll.process'));

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
    raise exception 'Payroll cycle tidak ditemukan.';
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
        'approved_minutes', overtime_record.approved_minutes
      )
    );
  end loop;
end;
$$;

revoke all on function public.rebuild_payroll_cycle_items(uuid) from public;
revoke execute on function public.rebuild_payroll_cycle_items(uuid) from authenticated;
grant execute on function public.rebuild_payroll_cycle_items(uuid) to service_role;

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
    raise exception 'ID payroll cycle wajib ada.';
  end if;

  select *
  into cycle_record
  from public.payroll_cycles
  where id = target_cycle_id
  for update;

  if not found then
    raise exception 'Payroll cycle tidak ditemukan.';
  end if;

  if cycle_record.status <> 'locked' then
    raise exception 'Payroll wajib locked sebelum dibayar.';
  end if;

  if exists (select 1 from public.payroll_payments where payroll_cycle_id = target_cycle_id and status = 'paid') then
    raise exception 'Payroll cycle ini sudah punya transaksi pembayaran.';
  end if;

  select employee_code, full_name
  into employee_record
  from public.employees
  where id = cycle_record.employee_id;

  if not found then
    raise exception 'Karyawan payroll tidak ditemukan.';
  end if;

  select count(*)
  into review_count
  from public.attendance_logs
  where employee_id = cycle_record.employee_id
    and status = 'review'
    and (cycle_record.period_started_at is null or attendance_date >= cycle_record.period_started_at)
    and (cycle_record.period_closed_at is null or attendance_date <= cycle_record.period_closed_at);

  if review_count > 0 then
    raise exception 'Masih ada absensi review di periode payroll ini.';
  end if;

  select count(*)
  into open_overtime_count
  from public.overtime_requests
  where employee_id = cycle_record.employee_id
    and status in ('draft', 'pending')
    and (cycle_record.period_started_at is null or overtime_date >= cycle_record.period_started_at)
    and (cycle_record.period_closed_at is null or overtime_date <= cycle_record.period_closed_at);

  if open_overtime_count > 0 then
    raise exception 'Masih ada lembur draft/pending di periode payroll ini.';
  end if;

  perform public.rebuild_payroll_cycle_items(target_cycle_id);

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
select
  'PAY-' || to_char(coalesce(payroll_cycles.paid_at, payroll_cycles.updated_at, now()) at time zone 'Asia/Jakarta', 'YYYYMMDD') || '-' || upper(left(replace(payroll_cycles.id::text, '-', ''), 8)),
  payroll_cycles.id,
  payroll_cycles.employee_id,
  coalesce(employees.employee_code, ''),
  coalesce(employees.full_name, ''),
  coalesce(payroll_cycles.cycle_number, 0),
  payroll_cycles.period_started_at,
  payroll_cycles.period_closed_at,
  coalesce(payroll_cycles.gross_amount, 0),
  coalesce(payroll_cycles.overtime_amount, 0),
  greatest(coalesce(payroll_cycles.net_amount, coalesce(payroll_cycles.gross_amount, 0) + coalesce(payroll_cycles.overtime_amount, 0)), 0),
  greatest(coalesce(payroll_cycles.net_amount, coalesce(payroll_cycles.gross_amount, 0) + coalesce(payroll_cycles.overtime_amount, 0)), 0),
  'other',
  'Migrasi paid lama',
  coalesce(payroll_cycles.paid_at, payroll_cycles.updated_at, now()),
  payroll_cycles.processed_by,
  coalesce(app_users.full_name, ''),
  'paid',
  trim(both E'\n' from concat_ws(E'\n', nullif(payroll_cycles.notes, ''), 'Payment ledger dibuat dari status paid existing.')),
  jsonb_build_object('source', 'migration', 'migration', '20260828000100')
from public.payroll_cycles
join public.employees on employees.id = payroll_cycles.employee_id
left join public.app_users on app_users.id = payroll_cycles.processed_by
where payroll_cycles.status = 'paid'
on conflict (payroll_cycle_id) do nothing;

do $$
declare
  cycle_record record;
begin
  for cycle_record in
    select id from public.payroll_cycles where status in ('locked', 'paid')
  loop
    perform public.rebuild_payroll_cycle_items(cycle_record.id);
  end loop;
end;
$$;

insert into public.audit_logs (actor_name, action, target_table, target_id, status, metadata)
values
  ('System', 'Create payroll payment ledger', 'payroll_payments', '20260828000100', 'success', '{"source":"migration","module":"payroll-ledger"}'::jsonb);
