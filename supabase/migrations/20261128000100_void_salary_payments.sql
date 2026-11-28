-- Allow salary payments to be reversed without deleting the financial audit trail.
-- A cycle may have multiple historical payment rows, but only one active paid row.

alter table public.payroll_payments
  drop constraint if exists payroll_payments_payroll_cycle_id_key;

create unique index if not exists idx_payroll_payments_cycle_active_unique
on public.payroll_payments(payroll_cycle_id)
where status = 'paid';

create or replace function public.ensure_unique_payroll_payment_no()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.payroll_payments
    where payment_no = new.payment_no
      and id <> new.id
  ) then
    new.payment_no := new.payment_no || '-R' || upper(left(replace(new.id::text, '-', ''), 4));
  end if;

  return new;
end;
$$;

drop trigger if exists trg_payroll_payments_unique_no on public.payroll_payments;
create trigger trg_payroll_payments_unique_no
before insert on public.payroll_payments
for each row execute function public.ensure_unique_payroll_payment_no();

create or replace function public.void_payroll_payment(
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
  payment_record public.payroll_payments%rowtype;
  cycle_record public.payroll_cycles%rowtype;
  updated_cycle public.payroll_cycles%rowtype;
  normalized_note text := trim(coalesce(note_text, ''));
  reversed_at timestamptz := now();
begin
  if target_payment_id is null then
    raise exception 'ID pembayaran gaji wajib ada.';
  end if;

  if length(normalized_note) < 5 then
    raise exception 'Alasan pembatalan pembayaran wajib diisi minimal 5 karakter.';
  end if;

  select *
  into payment_record
  from public.payroll_payments
  where id = target_payment_id
  for update;

  if not found then
    raise exception 'Pembayaran gaji tidak ditemukan.';
  end if;

  if payment_record.status <> 'paid' then
    raise exception 'Hanya pembayaran gaji aktif yang bisa dibatalkan.';
  end if;

  select *
  into cycle_record
  from public.payroll_cycles
  where id = payment_record.payroll_cycle_id
  for update;

  if not found then
    raise exception 'Cycle gaji pembayaran tidak ditemukan.';
  end if;

  if cycle_record.status <> 'paid' then
    raise exception 'Cycle gaji tidak berstatus Terbayar. Refresh data sebelum membatalkan pembayaran.';
  end if;

  update public.payroll_payments
  set
    status = 'void',
    notes = trim(both E'\n' from concat_ws(E'\n', nullif(notes, ''), 'Pembayaran gaji dibatalkan: ' || normalized_note)),
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'voided_at', reversed_at,
      'voided_by', actor_user_id,
      'voided_by_name', coalesce(actor_name, ''),
      'void_reason', normalized_note
    ),
    updated_at = reversed_at
  where id = target_payment_id
  returning * into payment_record;

  update public.payroll_cycles
  set
    status = 'locked',
    paid_at = null,
    processed_at = null,
    processed_by = actor_user_id,
    locked_at = coalesce(locked_at, reversed_at),
    notes = trim(both E'\n' from concat_ws(E'\n', nullif(notes, ''), 'Finance batalkan pembayaran gaji: ' || normalized_note)),
    updated_at = reversed_at
  where id = cycle_record.id
  returning * into updated_cycle;

  insert into public.audit_logs (actor_user_id, actor_name, action, target_table, target_id, status, metadata)
  values (
    actor_user_id,
    actor_name,
    'Void payroll payment',
    'payroll_payments',
    target_payment_id::text,
    'success',
    jsonb_build_object(
      'employee_id', payment_record.employee_id,
      'employee_code', payment_record.employee_code,
      'employee_name', payment_record.employee_name,
      'payroll_cycle_id', payment_record.payroll_cycle_id,
      'cycle_number', payment_record.cycle_number,
      'payment_no', payment_record.payment_no,
      'paid_amount', payment_record.paid_amount,
      'previous_payment_status', 'paid',
      'next_payment_status', 'void',
      'previous_cycle_status', cycle_record.status,
      'next_cycle_status', updated_cycle.status,
      'reason', normalized_note,
      'source', 'rpc'
    )
  );

  return jsonb_build_object(
    'payment', to_jsonb(payment_record),
    'payroll', to_jsonb(updated_cycle)
  );
end;
$$;

revoke all on function public.void_payroll_payment(uuid, uuid, text, text) from public;
revoke execute on function public.void_payroll_payment(uuid, uuid, text, text) from authenticated;
grant execute on function public.void_payroll_payment(uuid, uuid, text, text) to service_role;

insert into public.audit_logs (actor_name, action, target_table, target_id, status, metadata)
values (
  'System',
  'Add salary payment reversal workflow',
  'payroll_payments',
  '20261128000100',
  'success',
  '{"source":"migration","module":"payroll-ledger","feature":"void-salary-payment"}'::jsonb
);
