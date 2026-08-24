-- Biofinger AT-301 attendance foundation.
-- Stores device identity, user mapping, and raw device events before converting them to payroll attendance logs.

insert into public.permissions (key, label, group_name, description)
values
  ('biofinger.view', 'Lihat Biofinger', 'Absensi', 'Melihat perangkat Biofinger, mapping user, dan raw event absensi fingerprint.'),
  ('biofinger.manage', 'Kelola Biofinger', 'Absensi', 'Mengatur perangkat Biofinger, mapping user device ke karyawan DMS, dan proses import.')
on conflict (key) do update set
  label = excluded.label,
  group_name = excluded.group_name,
  description = excluded.description;

with role_permission_seed(role_code, permission_key, enabled) as (
  values
    ('ROLE-OWNER', 'biofinger.view', true),
    ('ROLE-OWNER', 'biofinger.manage', true),
    ('ROLE-HR', 'biofinger.view', true),
    ('ROLE-HR', 'biofinger.manage', true),
    ('ROLE-ADMIN', 'biofinger.view', true),
    ('ROLE-ADMIN', 'biofinger.manage', true),
    ('ROLE-FIN', 'biofinger.view', true),
    ('ROLE-SPV', 'biofinger.view', true),
    ('ROLE-VIEWER', 'biofinger.view', true)
)
insert into public.role_permissions (role_id, permission_key, enabled)
select roles.id, role_permission_seed.permission_key, role_permission_seed.enabled
from role_permission_seed
join public.roles on roles.code = role_permission_seed.role_code
on conflict (role_id, permission_key) do update set
  enabled = excluded.enabled,
  updated_at = now();

create table if not exists public.attendance_devices (
  id uuid primary key default gen_random_uuid(),
  device_code text not null unique,
  name text not null,
  vendor text not null default 'Biofinger',
  model text,
  serial_number text unique,
  mac_address text,
  ip_address inet,
  port integer not null default 4370 check (port > 0 and port <= 65535),
  protocol text not null default 'zk-4370',
  work_location_id uuid references public.work_locations(id) on delete set null,
  attendance_kiosk_id uuid references public.attendance_kiosks(id) on delete set null,
  status text not null default 'active' check (status in ('active', 'inactive', 'maintenance')),
  last_seen_at timestamptz,
  last_sync_at timestamptz,
  sync_cursor_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_attendance_devices_status on public.attendance_devices(status);
create index if not exists idx_attendance_devices_serial_number on public.attendance_devices(serial_number);
create index if not exists idx_attendance_devices_work_location_id on public.attendance_devices(work_location_id);
create index if not exists idx_attendance_devices_last_sync_at on public.attendance_devices(last_sync_at desc);

drop trigger if exists trg_attendance_devices_updated_at on public.attendance_devices;
create trigger trg_attendance_devices_updated_at
before update on public.attendance_devices
for each row execute function public.set_updated_at();

insert into public.attendance_devices (
  device_code,
  name,
  vendor,
  model,
  serial_number,
  mac_address,
  ip_address,
  port,
  protocol,
  status,
  last_seen_at,
  metadata,
  notes
)
values (
  'BIO-AT301-001',
  'Biofinger AT-301 Main Gate',
  'Biofinger',
  'AT-301',
  'GED7244800117',
  '00:17:61:13:16:ad',
  '192.168.1.201',
  4370,
  'zk-4370',
  'active',
  now(),
  '{"produce_date":"2024-11-28 18:18:53","firmware":"Ver 6.60 Apr 13 2022","platform":"ZLM60_TFT","source":"verified-local-rj45"}'::jsonb,
  'Perangkat AT-301 pertama yang sudah terbaca lokal via LAN.'
)
on conflict (device_code) do update set
  name = excluded.name,
  vendor = excluded.vendor,
  model = excluded.model,
  serial_number = excluded.serial_number,
  mac_address = excluded.mac_address,
  ip_address = excluded.ip_address,
  port = excluded.port,
  protocol = excluded.protocol,
  status = excluded.status,
  last_seen_at = excluded.last_seen_at,
  metadata = public.attendance_devices.metadata || excluded.metadata,
  notes = excluded.notes,
  updated_at = now();

create table if not exists public.employee_attendance_device_links (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid references public.employees(id) on delete set null,
  attendance_device_id uuid not null references public.attendance_devices(id) on delete cascade,
  external_user_id text not null,
  external_uid integer,
  external_name text,
  privilege integer,
  status text not null default 'pending' check (status in ('pending', 'active', 'ignored', 'inactive')),
  matched_by text not null default 'manual' check (matched_by in ('manual', 'employee_code', 'name', 'import')),
  last_seen_at timestamptz,
  last_synced_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (attendance_device_id, external_user_id)
);

create unique index if not exists idx_employee_attendance_device_links_device_employee_unique
on public.employee_attendance_device_links(attendance_device_id, employee_id)
where employee_id is not null;

create index if not exists idx_employee_attendance_device_links_employee_id on public.employee_attendance_device_links(employee_id);
create index if not exists idx_employee_attendance_device_links_status on public.employee_attendance_device_links(status);
create index if not exists idx_employee_attendance_device_links_external_user_id on public.employee_attendance_device_links(external_user_id);

drop trigger if exists trg_employee_attendance_device_links_updated_at on public.employee_attendance_device_links;
create trigger trg_employee_attendance_device_links_updated_at
before update on public.employee_attendance_device_links
for each row execute function public.set_updated_at();

create table if not exists public.biofinger_attendance_events (
  id uuid primary key default gen_random_uuid(),
  attendance_device_id uuid not null references public.attendance_devices(id) on delete cascade,
  device_serial_number text,
  external_user_id text not null,
  employee_id uuid references public.employees(id) on delete set null,
  device_event_at timestamptz not null,
  attendance_date date not null,
  punch integer,
  status_code integer,
  normalized_event_type text not null default 'unknown' check (normalized_event_type in ('check_in', 'check_out', 'unknown')),
  import_status text not null default 'pending' check (import_status in ('pending', 'mapped', 'converted', 'ignored', 'error')),
  source_hash text not null unique,
  raw_payload jsonb not null default '{}'::jsonb,
  converted_attendance_log_id uuid references public.attendance_logs(id) on delete set null,
  imported_at timestamptz not null default now(),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_biofinger_attendance_events_device_event_at on public.biofinger_attendance_events(attendance_device_id, device_event_at desc);
create index if not exists idx_biofinger_attendance_events_employee_id on public.biofinger_attendance_events(employee_id);
create index if not exists idx_biofinger_attendance_events_external_user_id on public.biofinger_attendance_events(external_user_id);
create index if not exists idx_biofinger_attendance_events_import_status on public.biofinger_attendance_events(import_status);
create index if not exists idx_biofinger_attendance_events_attendance_date on public.biofinger_attendance_events(attendance_date desc);
create unique index if not exists idx_biofinger_attendance_events_converted_log_unique
on public.biofinger_attendance_events(converted_attendance_log_id)
where converted_attendance_log_id is not null;

drop trigger if exists trg_biofinger_attendance_events_updated_at on public.biofinger_attendance_events;
create trigger trg_biofinger_attendance_events_updated_at
before update on public.biofinger_attendance_events
for each row execute function public.set_updated_at();

alter table public.attendance_logs
  add column if not exists attendance_device_id uuid references public.attendance_devices(id) on delete set null,
  add column if not exists biofinger_event_id uuid references public.biofinger_attendance_events(id) on delete set null;

create index if not exists idx_attendance_logs_attendance_device_id on public.attendance_logs(attendance_device_id);
create unique index if not exists idx_attendance_logs_biofinger_event_id_unique
on public.attendance_logs(biofinger_event_id)
where biofinger_event_id is not null;

alter table public.attendance_logs drop constraint if exists attendance_logs_source_check;
alter table public.attendance_logs
  add constraint attendance_logs_source_check check (source in ('field_app', 'management', 'seed', 'kiosk', 'biofinger'));

alter table public.attendance_logs drop constraint if exists attendance_logs_media_check;
alter table public.attendance_logs
  add constraint attendance_logs_media_check check (attendance_media is null or attendance_media in ('barcode', 'rfid', 'face', 'gps', 'manual', 'fingerprint'));

alter table public.attendance_devices enable row level security;
alter table public.employee_attendance_device_links enable row level security;
alter table public.biofinger_attendance_events enable row level security;

drop policy if exists "Production read attendance devices" on public.attendance_devices;
create policy "Production read attendance devices"
on public.attendance_devices for select
to authenticated
using (
  public.has_app_permission('biofinger.view')
  or public.has_app_permission('attendance.view')
  or public.has_app_permission('employees.view')
);

drop policy if exists "Production manage attendance devices" on public.attendance_devices;
create policy "Production manage attendance devices"
on public.attendance_devices for all
to authenticated
using (
  public.has_app_permission('biofinger.manage')
  or public.has_app_permission('attendance.review')
  or public.has_app_permission('employees.manage')
)
with check (
  public.has_app_permission('biofinger.manage')
  or public.has_app_permission('attendance.review')
  or public.has_app_permission('employees.manage')
);

drop policy if exists "Production read employee attendance device links" on public.employee_attendance_device_links;
create policy "Production read employee attendance device links"
on public.employee_attendance_device_links for select
to authenticated
using (
  public.has_app_permission('biofinger.view')
  or public.has_app_permission('attendance.view')
  or public.has_app_permission('employees.view')
);

drop policy if exists "Production manage employee attendance device links" on public.employee_attendance_device_links;
create policy "Production manage employee attendance device links"
on public.employee_attendance_device_links for all
to authenticated
using (
  public.has_app_permission('biofinger.manage')
  or public.has_app_permission('attendance.review')
  or public.has_app_permission('employees.manage')
)
with check (
  public.has_app_permission('biofinger.manage')
  or public.has_app_permission('attendance.review')
  or public.has_app_permission('employees.manage')
);

drop policy if exists "Production read biofinger attendance events" on public.biofinger_attendance_events;
create policy "Production read biofinger attendance events"
on public.biofinger_attendance_events for select
to authenticated
using (
  public.has_app_permission('biofinger.view')
  or public.has_app_permission('attendance.view')
);

drop policy if exists "Production manage biofinger attendance events" on public.biofinger_attendance_events;
create policy "Production manage biofinger attendance events"
on public.biofinger_attendance_events for all
to authenticated
using (
  public.has_app_permission('biofinger.manage')
  or public.has_app_permission('attendance.review')
)
with check (
  public.has_app_permission('biofinger.manage')
  or public.has_app_permission('attendance.review')
);

insert into public.audit_logs (actor_name, action, target_table, target_id, status, metadata)
values
  ('System', 'Create Biofinger AT-301 attendance foundation', 'attendance_devices', '20260824000100', 'success', '{"source":"migration","module":"biofinger","device":"AT-301"}'::jsonb);
