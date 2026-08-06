-- DMS employees live CRUD.
-- Employee directory is separated from management app users and uses master data as dropdown sources.

insert into public.permissions (key, label, group_name, description)
values
  ('employees.view', 'Lihat Karyawan', 'Karyawan', 'Melihat direktori karyawan dan relasi master data.'),
  ('employees.manage', 'Kelola Karyawan', 'Karyawan', 'Tambah, ubah, nonaktifkan, dan hapus data karyawan.')
on conflict (key) do update set
  label = excluded.label,
  group_name = excluded.group_name,
  description = excluded.description;

with role_permission_seed(role_code, permission_key, enabled) as (
  values
    ('ROLE-OWNER', 'employees.view', true),
    ('ROLE-OWNER', 'employees.manage', true),
    ('ROLE-HR', 'employees.view', true),
    ('ROLE-HR', 'employees.manage', true),
    ('ROLE-ADMIN', 'employees.view', true),
    ('ROLE-ADMIN', 'employees.manage', true),
    ('ROLE-FIN', 'employees.view', true),
    ('ROLE-SPV', 'employees.view', true),
    ('ROLE-VIEWER', 'employees.view', true)
)
insert into public.role_permissions (role_id, permission_key, enabled)
select roles.id, role_permission_seed.permission_key, role_permission_seed.enabled
from role_permission_seed
join public.roles on roles.code = role_permission_seed.role_code
on conflict (role_id, permission_key) do update set
  enabled = excluded.enabled,
  updated_at = now();

create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  employee_code text not null unique,
  full_name text not null,
  nik text unique,
  phone text,
  email text,
  division_id uuid references public.divisions(id) on delete set null,
  position_id uuid references public.positions(id) on delete set null,
  work_location_id uuid references public.work_locations(id) on delete set null,
  shift_id uuid references public.shifts(id) on delete set null,
  daily_salary numeric(14, 2) not null default 0 check (daily_salary >= 0),
  join_date date,
  payroll_cycle_days integer not null default 0 check (payroll_cycle_days >= 0 and payroll_cycle_days <= 26),
  status text not null default 'active' check (status in ('active', 'review', 'inactive')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_employees_employee_code on public.employees(employee_code);
create index if not exists idx_employees_division_id on public.employees(division_id);
create index if not exists idx_employees_position_id on public.employees(position_id);
create index if not exists idx_employees_work_location_id on public.employees(work_location_id);
create index if not exists idx_employees_shift_id on public.employees(shift_id);
create index if not exists idx_employees_status on public.employees(status);
create index if not exists idx_employees_created_at on public.employees(created_at desc);

drop trigger if exists trg_employees_updated_at on public.employees;
create trigger trg_employees_updated_at
before update on public.employees
for each row execute function public.set_updated_at();

alter table public.employees enable row level security;

drop policy if exists "Production read employees" on public.employees;
create policy "Production read employees"
on public.employees for select
to authenticated
using (public.has_app_permission('employees.view'));

drop policy if exists "Production manage employees" on public.employees;
create policy "Production manage employees"
on public.employees for all
to authenticated
using (public.has_app_permission('employees.manage'))
with check (public.has_app_permission('employees.manage'));

with master_refs as (
  select
    (select id from public.divisions where code in ('DIV-PRD', 'DIV-PRODUKSI') or name = 'Produksi' order by sort_order nulls last, code limit 1) as div_prd,
    (select id from public.divisions where code = 'DIV-PCK' or name = 'Packing' order by sort_order nulls last, code limit 1) as div_pck,
    (select id from public.divisions where code = 'DIV-FIN' or name = 'Finance' order by sort_order nulls last, code limit 1) as div_fin,
    (select id from public.divisions where code = 'DIV-WHS' or name = 'Warehouse' order by sort_order nulls last, code limit 1) as div_whs,
    (select id from public.positions where code = 'POS-OPR' or name = 'Operator' order by sort_order nulls last, code limit 1) as pos_opr,
    (select id from public.positions where code = 'POS-PCK' or name = 'Staff Packing' order by sort_order nulls last, code limit 1) as pos_pck,
    (select id from public.positions where code = 'POS-FIN' or name = 'Finance Staff' order by sort_order nulls last, code limit 1) as pos_fin,
    (select id from public.positions where code = 'POS-WHS' or name = 'Staff Warehouse' order by sort_order nulls last, code limit 1) as pos_whs,
    (select id from public.positions where code = 'POS-SPV' or name = 'Supervisor' order by sort_order nulls last, code limit 1) as pos_spv,
    (select id from public.work_locations where code = 'LOC-GDU' or name = 'Gudang Utama' order by sort_order nulls last, code limit 1) as loc_gdu,
    (select id from public.work_locations where code = 'LOC-KAD' or name = 'Kantor Admin' order by sort_order nulls last, code limit 1) as loc_kad,
    (select id from public.work_locations where code = 'LOC-WKS' or name = 'Workshop' order by sort_order nulls last, code limit 1) as loc_wks,
    (select id from public.shifts where code = 'SFT-PAGI' or name = 'Pagi' order by sort_order nulls last, code limit 1) as shift_pagi
),
employee_seed(employee_code, full_name, nik, phone, email, division_id, position_id, work_location_id, shift_id, daily_salary, join_date, payroll_cycle_days, status, notes) as (
  select 'EMP-001', 'Rizky Pratama', '3271010101010001', '081234560001', 'rizky.pratama@dms.local', div_prd, pos_opr, loc_gdu, shift_pagi, 150000, date '2026-07-01', 26, 'active', 'Operator produksi aktif.' from master_refs
  union all
  select 'EMP-002', 'Nadya Lestari', '3271010101010002', '081234560002', 'nadya.lestari@dms.local', div_pck, pos_pck, loc_gdu, shift_pagi, 140000, date '2026-07-08', 21, 'active', 'Tim packing dan fulfillment.' from master_refs
  union all
  select 'EMP-003', 'Aldi Saputra', '3271010101010003', '081234560003', 'aldi.saputra@dms.local', div_fin, pos_fin, loc_kad, shift_pagi, 180000, date '2026-06-12', 26, 'review', 'Data payroll perlu review HR.' from master_refs
  union all
  select 'EMP-004', 'Sinta Maharani', '3271010101010004', '081234560004', 'sinta.maharani@dms.local', div_fin, pos_fin, loc_kad, shift_pagi, 180000, date '2026-05-20', 18, 'active', 'Finance dan admin payroll.' from master_refs
  union all
  select 'EMP-005', 'Bagas Maulana', '3271010101010005', '081234560005', 'bagas.maulana@dms.local', div_whs, pos_whs, loc_gdu, shift_pagi, 145000, date '2026-07-15', 12, 'review', 'Perlu pengecekan absensi dan status kerja.' from master_refs
  union all
  select 'EMP-006', 'Fajar Nugroho', '3271010101010006', '081234560006', 'fajar.nugroho@dms.local', div_prd, pos_spv, loc_wks, shift_pagi, 170000, date '2026-04-10', 26, 'active', 'Supervisor operasional workshop.' from master_refs
)
insert into public.employees (employee_code, full_name, nik, phone, email, division_id, position_id, work_location_id, shift_id, daily_salary, join_date, payroll_cycle_days, status, notes)
select employee_code, full_name, nik, phone, email, division_id, position_id, work_location_id, shift_id, daily_salary, join_date, payroll_cycle_days, status, notes
from employee_seed
on conflict (employee_code) do update set
  full_name = excluded.full_name,
  nik = excluded.nik,
  phone = excluded.phone,
  email = excluded.email,
  division_id = excluded.division_id,
  position_id = excluded.position_id,
  work_location_id = excluded.work_location_id,
  shift_id = excluded.shift_id,
  daily_salary = excluded.daily_salary,
  join_date = excluded.join_date,
  payroll_cycle_days = excluded.payroll_cycle_days,
  status = excluded.status,
  notes = excluded.notes,
  updated_at = now();

insert into public.audit_logs (actor_name, action, target_table, target_id, status, metadata)
values
  ('System', 'Create employees live CRUD', 'employees', '20260807000100', 'success', '{"source":"migration","module":"employees"}'::jsonb);
