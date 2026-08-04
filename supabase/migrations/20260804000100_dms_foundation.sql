-- DMS System Management foundation schema.
-- Scope: user access, role permission, master data, work location, and audit log.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.roles (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null unique,
  description text,
  level integer not null default 100,
  is_system boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.permissions (
  key text primary key,
  label text not null,
  group_name text not null,
  description text,
  created_at timestamptz not null default now()
);

create table if not exists public.role_permissions (
  role_id uuid not null references public.roles(id) on delete cascade,
  permission_key text not null references public.permissions(key) on delete cascade,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (role_id, permission_key)
);

create table if not exists public.divisions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null unique,
  description text,
  owner_role_id uuid references public.roles(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.positions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  division_id uuid references public.divisions(id) on delete set null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (name, division_id)
);

create table if not exists public.work_locations (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null unique,
  address text,
  latitude numeric(10, 7),
  longitude numeric(10, 7),
  radius_m integer not null default 100 check (radius_m > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.app_users (
  id uuid primary key references auth.users(id) on delete cascade,
  user_code text unique,
  full_name text not null,
  email text not null unique,
  role_id uuid references public.roles(id) on delete set null,
  division_id uuid references public.divisions(id) on delete set null,
  status text not null default 'invited' check (status in ('active', 'invited', 'locked')),
  two_factor_status text not null default 'pending' check (two_factor_status in ('enabled', 'pending', 'disabled')),
  last_login_at timestamptz,
  invited_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references public.app_users(id) on delete set null,
  actor_name text,
  action text not null,
  target_table text,
  target_id text,
  status text not null default 'success' check (status in ('success', 'pending', 'review', 'failed')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_role_permissions_role_id on public.role_permissions(role_id);
create index if not exists idx_divisions_active on public.divisions(is_active);
create index if not exists idx_positions_division_id on public.positions(division_id);
create index if not exists idx_positions_active on public.positions(is_active);
create index if not exists idx_work_locations_active on public.work_locations(is_active);
create index if not exists idx_app_users_role_id on public.app_users(role_id);
create index if not exists idx_app_users_division_id on public.app_users(division_id);
create index if not exists idx_app_users_status on public.app_users(status);
create index if not exists idx_audit_logs_created_at on public.audit_logs(created_at desc);

drop trigger if exists trg_roles_updated_at on public.roles;
create trigger trg_roles_updated_at
before update on public.roles
for each row execute function public.set_updated_at();

drop trigger if exists trg_role_permissions_updated_at on public.role_permissions;
create trigger trg_role_permissions_updated_at
before update on public.role_permissions
for each row execute function public.set_updated_at();

drop trigger if exists trg_divisions_updated_at on public.divisions;
create trigger trg_divisions_updated_at
before update on public.divisions
for each row execute function public.set_updated_at();

drop trigger if exists trg_positions_updated_at on public.positions;
create trigger trg_positions_updated_at
before update on public.positions
for each row execute function public.set_updated_at();

drop trigger if exists trg_work_locations_updated_at on public.work_locations;
create trigger trg_work_locations_updated_at
before update on public.work_locations
for each row execute function public.set_updated_at();

drop trigger if exists trg_app_users_updated_at on public.app_users;
create trigger trg_app_users_updated_at
before update on public.app_users
for each row execute function public.set_updated_at();

alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.divisions enable row level security;
alter table public.positions enable row level security;
alter table public.work_locations enable row level security;
alter table public.app_users enable row level security;
alter table public.audit_logs enable row level security;

drop policy if exists "Authenticated can read roles" on public.roles;
create policy "Authenticated can read roles"
on public.roles for select
to authenticated
using (true);

drop policy if exists "Authenticated can read permissions" on public.permissions;
create policy "Authenticated can read permissions"
on public.permissions for select
to authenticated
using (true);

drop policy if exists "Authenticated can read role permissions" on public.role_permissions;
create policy "Authenticated can read role permissions"
on public.role_permissions for select
to authenticated
using (true);

drop policy if exists "Authenticated can read divisions" on public.divisions;
create policy "Authenticated can read divisions"
on public.divisions for select
to authenticated
using (true);

drop policy if exists "Authenticated can read positions" on public.positions;
create policy "Authenticated can read positions"
on public.positions for select
to authenticated
using (true);

drop policy if exists "Authenticated can read work locations" on public.work_locations;
create policy "Authenticated can read work locations"
on public.work_locations for select
to authenticated
using (true);

drop policy if exists "Users can read own app profile" on public.app_users;
create policy "Users can read own app profile"
on public.app_users for select
to authenticated
using (id = auth.uid());

drop policy if exists "Authenticated can read audit logs" on public.audit_logs;
create policy "Authenticated can read audit logs"
on public.audit_logs for select
to authenticated
using (true);

insert into public.roles (code, name, description, level, is_system, is_active)
values
  ('ROLE-OWNER', 'Owner', 'Full access untuk owner dan super admin DMS.', 10, true, true),
  ('ROLE-HR', 'HR Manager', 'Mengelola karyawan, absensi, payroll view, dan kasbon.', 20, true, true),
  ('ROLE-FIN', 'Finance', 'Mengelola payroll, kasbon, bonus, dan potongan.', 30, true, true),
  ('ROLE-SPV', 'Supervisor', 'Monitoring lapangan dan review absensi tim.', 40, true, true),
  ('ROLE-ADMIN', 'Admin', 'Operasional administrasi dan master data.', 50, true, true),
  ('ROLE-VIEWER', 'Viewer', 'Akses baca terbatas untuk monitoring.', 90, true, true)
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  level = excluded.level,
  is_system = excluded.is_system,
  is_active = excluded.is_active,
  updated_at = now();

insert into public.permissions (key, label, group_name, description)
values
  ('dashboard.view', 'Akses Dashboard', 'Dashboard', 'Buka ringkasan KPI dan monitoring utama.'),
  ('users.view', 'Lihat User', 'User Management', 'Melihat daftar user management app.'),
  ('users.create', 'Invite User', 'User Management', 'Membuat undangan user baru.'),
  ('users.edit', 'Edit User', 'User Management', 'Mengubah profil, status, dan role user.'),
  ('users.lock', 'Lock User', 'User Management', 'Membekukan akses user bermasalah.'),
  ('master_data.view', 'Lihat Master Data', 'Master Data', 'Akses divisi, jabatan, shift, lokasi, dan komponen gaji.'),
  ('master_data.manage', 'Kelola Master Data', 'Master Data', 'Tambah, ubah, dan nonaktifkan master data.'),
  ('attendance.view', 'Lihat Absensi', 'Absensi', 'Monitoring absensi GPS dan face verification.'),
  ('attendance.review', 'Review Absensi', 'Absensi', 'Approve atau reject absensi bermasalah.'),
  ('payroll.view', 'Lihat Payroll', 'Payroll', 'Melihat cycle 26 hari, draft gaji, bonus, dan potongan.'),
  ('payroll.process', 'Proses Payroll', 'Payroll', 'Lock dan proses gaji siap bayar.'),
  ('cash_advance.manage', 'Kelola Kasbon', 'Finance', 'Approve, cicil, dan potong kasbon.'),
  ('role_permissions.manage', 'Kelola Role Permission', 'Sistem', 'Ubah permission role dan custom access.'),
  ('audit_logs.view', 'Lihat Audit Log', 'Sistem', 'Melihat riwayat aktivitas dan perubahan sistem.')
on conflict (key) do update set
  label = excluded.label,
  group_name = excluded.group_name,
  description = excluded.description;

with role_permission_seed(role_code, permission_key) as (
  values
    ('ROLE-OWNER', 'dashboard.view'),
    ('ROLE-OWNER', 'users.view'),
    ('ROLE-OWNER', 'users.create'),
    ('ROLE-OWNER', 'users.edit'),
    ('ROLE-OWNER', 'users.lock'),
    ('ROLE-OWNER', 'master_data.view'),
    ('ROLE-OWNER', 'master_data.manage'),
    ('ROLE-OWNER', 'attendance.view'),
    ('ROLE-OWNER', 'attendance.review'),
    ('ROLE-OWNER', 'payroll.view'),
    ('ROLE-OWNER', 'payroll.process'),
    ('ROLE-OWNER', 'cash_advance.manage'),
    ('ROLE-OWNER', 'role_permissions.manage'),
    ('ROLE-OWNER', 'audit_logs.view'),
    ('ROLE-HR', 'dashboard.view'),
    ('ROLE-HR', 'users.view'),
    ('ROLE-HR', 'users.create'),
    ('ROLE-HR', 'users.edit'),
    ('ROLE-HR', 'master_data.view'),
    ('ROLE-HR', 'master_data.manage'),
    ('ROLE-HR', 'attendance.view'),
    ('ROLE-HR', 'attendance.review'),
    ('ROLE-HR', 'payroll.view'),
    ('ROLE-HR', 'cash_advance.manage'),
    ('ROLE-HR', 'audit_logs.view'),
    ('ROLE-FIN', 'dashboard.view'),
    ('ROLE-FIN', 'master_data.view'),
    ('ROLE-FIN', 'payroll.view'),
    ('ROLE-FIN', 'payroll.process'),
    ('ROLE-FIN', 'cash_advance.manage'),
    ('ROLE-FIN', 'audit_logs.view'),
    ('ROLE-SPV', 'dashboard.view'),
    ('ROLE-SPV', 'users.view'),
    ('ROLE-SPV', 'attendance.view'),
    ('ROLE-SPV', 'attendance.review'),
    ('ROLE-SPV', 'master_data.view'),
    ('ROLE-ADMIN', 'dashboard.view'),
    ('ROLE-ADMIN', 'users.view'),
    ('ROLE-ADMIN', 'users.create'),
    ('ROLE-ADMIN', 'master_data.view'),
    ('ROLE-ADMIN', 'master_data.manage'),
    ('ROLE-ADMIN', 'attendance.view'),
    ('ROLE-ADMIN', 'audit_logs.view'),
    ('ROLE-VIEWER', 'dashboard.view'),
    ('ROLE-VIEWER', 'users.view'),
    ('ROLE-VIEWER', 'master_data.view'),
    ('ROLE-VIEWER', 'attendance.view'),
    ('ROLE-VIEWER', 'payroll.view')
)
insert into public.role_permissions (role_id, permission_key, enabled)
select roles.id, role_permission_seed.permission_key, true
from role_permission_seed
join public.roles on roles.code = role_permission_seed.role_code
on conflict (role_id, permission_key) do update set
  enabled = excluded.enabled,
  updated_at = now();

with role_refs as (
  select code, id from public.roles
)
insert into public.divisions (code, name, description, owner_role_id, is_active)
values
  ('DIV-MGT', 'Management', 'Owner dan pengelola utama sistem.', (select id from role_refs where code = 'ROLE-OWNER'), true),
  ('DIV-HR', 'HR', 'Divisi HR dan people operation.', (select id from role_refs where code = 'ROLE-HR'), true),
  ('DIV-FIN', 'Finance', 'Divisi finance, payroll, dan kasbon.', (select id from role_refs where code = 'ROLE-FIN'), true),
  ('DIV-PRD', 'Produksi', 'Tim produksi operasional.', (select id from role_refs where code = 'ROLE-SPV'), true),
  ('DIV-PCK', 'Packing', 'Tim packing dan fulfilment.', (select id from role_refs where code = 'ROLE-SPV'), true),
  ('DIV-WHS', 'Warehouse', 'Tim gudang dan stok barang.', (select id from role_refs where code = 'ROLE-SPV'), true)
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  owner_role_id = excluded.owner_role_id,
  is_active = excluded.is_active,
  updated_at = now();

with division_refs as (
  select code, id from public.divisions
)
insert into public.positions (code, name, division_id, description, is_active)
values
  ('POS-OWNER', 'Owner', (select id from division_refs where code = 'DIV-MGT'), 'Owner bisnis dan sistem.', true),
  ('POS-HRM', 'HR Manager', (select id from division_refs where code = 'DIV-HR'), 'Mengelola HR, absensi, dan data karyawan.', true),
  ('POS-FIN', 'Finance Staff', (select id from division_refs where code = 'DIV-FIN'), 'Mengelola payroll dan kasbon.', true),
  ('POS-SPV', 'Supervisor', (select id from division_refs where code = 'DIV-PRD'), 'Memimpin operasional lapangan.', true),
  ('POS-OPR', 'Operator', (select id from division_refs where code = 'DIV-PRD'), 'Operator produksi.', true),
  ('POS-PCK', 'Staff Packing', (select id from division_refs where code = 'DIV-PCK'), 'Staff packing dan fulfilment.', true),
  ('POS-WHS', 'Staff Warehouse', (select id from division_refs where code = 'DIV-WHS'), 'Staff gudang.', true)
on conflict (code) do update set
  name = excluded.name,
  division_id = excluded.division_id,
  description = excluded.description,
  is_active = excluded.is_active,
  updated_at = now();

insert into public.work_locations (code, name, address, latitude, longitude, radius_m, is_active)
values
  ('LOC-GDU', 'Gudang Utama', 'Alamat gudang utama DMS', null, null, 100, true),
  ('LOC-KAD', 'Kantor Admin', 'Alamat kantor admin DMS', null, null, 80, true),
  ('LOC-WKS', 'Workshop', 'Alamat workshop DMS', null, null, 120, true)
on conflict (code) do update set
  name = excluded.name,
  address = excluded.address,
  latitude = excluded.latitude,
  longitude = excluded.longitude,
  radius_m = excluded.radius_m,
  is_active = excluded.is_active,
  updated_at = now();

insert into public.audit_logs (actor_name, action, target_table, target_id, status, metadata)
values
  ('System', 'Seed foundation data', 'foundation', '20260804000100', 'success', '{"source":"migration"}'::jsonb);
