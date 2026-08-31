-- Overtime payment ledger.
-- Lembur approved bisa dibayar terpisah mingguan/custom tanpa ikut dihitung ulang di payroll cycle.

alter table public.overtime_requests
add column if not exists overtime_payment_status text not null default 'unpaid',
add column if not exists overtime_payment_id uuid,
add column if not exists overtime_paid_at timestamptz,
add column if not exists overtime_paid_by uuid references public.app_users(id) on delete set null,
add column if not exists overtime_payment_note text;

update public.overtime_requests
set overtime_payment_status = 'unpaid'
where overtime_payment_status is null;

alter table public.overtime_requests
drop constraint if exists overtime_requests_overtime_payment_status_check;

alter table public.overtime_requests
add constraint overtime_requests_overtime_payment_status_check
check (overtime_payment_status in ('unpaid', 'paid', 'void'));

create table if not exists public.overtime_payments (
  id uuid primary key default gen_random_uuid(),
  payment_no text not null unique,
  employee_id uuid not null references public.employees(id) on delete restrict,
  employee_code text not null default '',
  employee_name text not null default '',
  period_started_at date not null,
  period_closed_at date not null,
  request_count integer not null default 0 check (request_count >= 0),
  overtime_minutes integer not null default 0 check (overtime_minutes >= 0),
  overtime_amount numeric(14, 2) not null default 0 check (overtime_amount >= 0),
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

create table if not exists public.overtime_payment_items (
  id uuid primary key default gen_random_uuid(),
  overtime_payment_id uuid not null references public.overtime_payments(id) on delete cascade,
  overtime_request_id uuid not null unique references public.overtime_requests(id) on delete restrict,
  employee_id uuid not null references public.employees(id) on delete restrict,
  overtime_date date not null,
  approved_minutes integer not null default 0 check (approved_minutes >= 0),
  rate_amount numeric(14, 2) not null default 0 check (rate_amount >= 0),
  total_amount numeric(14, 2) not null default 0 check (total_amount >= 0),
  created_at timestamptz not null default now()
);

create index if not exists idx_overtime_payments_employee on public.overtime_payments(employee_id, paid_at desc);
create index if not exists idx_overtime_payments_paid_at on public.overtime_payments(paid_at desc);
create index if not exists idx_overtime_payments_status on public.overtime_payments(status);
create index if not exists idx_overtime_payment_items_payment on public.overtime_payment_items(overtime_payment_id);
create index if not exists idx_overtime_payment_items_employee_date on public.overtime_payment_items(employee_id, overtime_date desc);
create index if not exists idx_overtime_requests_payment_status on public.overtime_requests(overtime_payment_status);
create index if not exists idx_overtime_requests_payment_id on public.overtime_requests(overtime_payment_id);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'overtime_requests_overtime_payment_id_fkey'
      and conrelid = 'public.overtime_requests'::regclass
  ) then
    alter table public.overtime_requests
    add constraint overtime_requests_overtime_payment_id_fkey
    foreign key (overtime_payment_id)
    references public.overtime_payments(id)
    on delete set null;
  end if;
end;
$$;

drop trigger if exists trg_overtime_payments_updated_at on public.overtime_payments;
create trigger trg_overtime_payments_updated_at
before update on public.overtime_payments
for each row execute function public.set_updated_at();

alter table public.overtime_payments enable row level security;
alter table public.overtime_payment_items enable row level security;

drop policy if exists "Production read overtime payments" on public.overtime_payments;
create policy "Production read overtime payments"
on public.overtime_payments for select
to authenticated
using (public.has_app_permission('payroll.view') or public.has_app_permission('overtime.view'));

drop policy if exists "Production manage overtime payments" on public.overtime_payments;
create policy "Production manage overtime payments"
on public.overtime_payments for all
to authenticated
using (public.has_app_permission('payroll.process'))
with check (public.has_app_permission('payroll.process'));

drop policy if exists "Production read overtime payment items" on public.overtime_payment_items;
create policy "Production read overtime payment items"
on public.overtime_payment_items for select
to authenticated
using (public.has_app_permission('payroll.view') or public.has_app_permission('overtime.view'));

drop policy if exists "Production manage overtime payment items" on public.overtime_payment_items;
create policy "Production manage overtime payment items"
on public.overtime_payment_items for all
to authenticated
using (public.has_app_permission('payroll.process'))
with check (public.has_app_permission('payroll.process'));

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
  locked_cycle_count integer;
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

  select count(*)
  into locked_cycle_count
  from selected_overtime_requests
  join public.payroll_cycles
    on payroll_cycles.id = selected_overtime_requests.payroll_cycle_id
   and payroll_cycles.status in ('locked', 'paid', 'void');

  if locked_cycle_count > 0 then
    raise exception 'Ada lembur yang sudah masuk payroll final/terbayar, tidak bisa dibayar terpisah.';
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
  locked_cycle_count integer;
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

  select count(*)
  into locked_cycle_count
  from public.overtime_payment_items
  join public.overtime_requests
    on overtime_requests.id = overtime_payment_items.overtime_request_id
  join public.payroll_cycles
    on payroll_cycles.id = overtime_requests.payroll_cycle_id
   and payroll_cycles.status in ('locked', 'paid', 'void')
  where overtime_payment_items.overtime_payment_id = target_payment_id;

  if locked_cycle_count > 0 then
    raise exception 'Pembayaran lembur tidak bisa dibatalkan karena cycle terkait sudah final/terbayar.';
  end if;

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
      and coalesce(overtime_requests.overtime_payment_status, 'unpaid') <> 'paid'
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
        'overtime_payment_status', overtime_record.overtime_payment_status
      )
    );
  end loop;
end;
$$;

revoke all on function public.rebuild_payroll_cycle_items(uuid) from public;
revoke execute on function public.rebuild_payroll_cycle_items(uuid) from authenticated;
grant execute on function public.rebuild_payroll_cycle_items(uuid) to service_role;

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
  ('System', 'Create overtime payment ledger', 'overtime_payments', '20260831000300', 'success', '{"source":"migration","module":"payroll","summary":"separate-overtime-payments"}'::jsonb);

notify pgrst, 'reload schema';
