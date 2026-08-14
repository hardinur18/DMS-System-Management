-- Kiosk attendance foundation.
-- Supports centralized attendance gates with barcode/QR, RFID, optional face verification, and fixed work-location policy.

create table if not exists attendance_policies (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  allowed_media text[] not null default array['barcode']::text[],
  require_face boolean not null default false,
  require_location boolean not null default true,
  auto_detect_event boolean not null default true,
  allow_checkout_while_checkin_review boolean not null default true,
  block_out_of_radius boolean not null default true,
  face_score_threshold numeric not null default 85,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint attendance_policies_media_allowed check (allowed_media <@ array['barcode', 'rfid', 'face']::text[]),
  constraint attendance_policies_face_threshold_check check (face_score_threshold between 0 and 100)
);

drop trigger if exists attendance_policies_set_updated_at on attendance_policies;
create trigger attendance_policies_set_updated_at
before update on attendance_policies
for each row execute function set_updated_at();

insert into attendance_policies (code, name, description, allowed_media, require_face, require_location, auto_detect_event, block_out_of_radius, face_score_threshold)
values
  ('POLICY-FLEX', 'Multi Method', 'Barcode atau RFID dari gate lokasi. Face bisa dinyalakan per kebutuhan.', array['barcode', 'rfid']::text[], false, true, true, true, 85),
  ('POLICY-BARCODE', 'Barcode / QR', 'Absensi lewat scan barcode/QR nametag tanpa face verification.', array['barcode']::text[], false, true, true, true, 85),
  ('POLICY-RFID', 'RFID Card', 'Absensi lewat tap kartu RFID tanpa face verification.', array['rfid']::text[], false, true, true, true, 85),
  ('POLICY-BARCODE-FACE', 'Barcode + Face', 'Scan barcode/QR lalu wajib verifikasi wajah di kiosk.', array['barcode', 'face']::text[], true, true, true, true, 85),
  ('POLICY-RFID-FACE', 'RFID + Face', 'Tap RFID lalu wajib verifikasi wajah di kiosk.', array['rfid', 'face']::text[], true, true, true, true, 85),
  ('POLICY-FULL-GUARD', 'Barcode / RFID + Face', 'Barcode atau RFID wajib dilengkapi verifikasi wajah di kiosk lokasi.', array['barcode', 'rfid', 'face']::text[], true, true, true, true, 85)
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  allowed_media = excluded.allowed_media,
  require_face = excluded.require_face,
  require_location = excluded.require_location,
  auto_detect_event = excluded.auto_detect_event,
  block_out_of_radius = excluded.block_out_of_radius,
  face_score_threshold = excluded.face_score_threshold,
  updated_at = now();

alter table employees
  add column if not exists qr_token text,
  add column if not exists rfid_uid text,
  add column if not exists attendance_pin text,
  add column if not exists kiosk_access_enabled boolean not null default true,
  add column if not exists attendance_policy_id uuid references attendance_policies(id) on delete set null,
  add column if not exists last_card_issued_at timestamptz;

update employees
set qr_token = 'DMS-' || employee_code || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))
where qr_token is null;

update employees
set attendance_policy_id = (select id from attendance_policies where code = 'POLICY-FLEX')
where attendance_policy_id is null;

create unique index if not exists employees_qr_token_unique_idx on employees(qr_token) where qr_token is not null;
create unique index if not exists employees_rfid_uid_unique_idx on employees(rfid_uid) where rfid_uid is not null and rfid_uid <> '';

create table if not exists attendance_kiosks (
  id uuid primary key default gen_random_uuid(),
  kiosk_code text not null unique,
  name text not null,
  work_location_id uuid not null references work_locations(id) on delete restrict,
  policy_id uuid references attendance_policies(id) on delete set null,
  device_fingerprint text,
  status text not null default 'active' check (status in ('active', 'inactive', 'maintenance')),
  last_seen_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists attendance_kiosks_set_updated_at on attendance_kiosks;
create trigger attendance_kiosks_set_updated_at
before update on attendance_kiosks
for each row execute function set_updated_at();

insert into attendance_kiosks (kiosk_code, name, work_location_id, policy_id, notes)
select
  'KSK-' || regexp_replace(upper(wl.code), '^LOC-', ''),
  wl.name || ' Gate',
  wl.id,
  coalesce((select id from attendance_policies where code = 'POLICY-FLEX'), (select id from attendance_policies order by created_at asc limit 1)),
  'Kiosk otomatis dari lokasi kerja aktif.'
from work_locations wl
where wl.is_active is not false
on conflict (kiosk_code) do update set
  name = excluded.name,
  work_location_id = excluded.work_location_id,
  policy_id = excluded.policy_id,
  updated_at = now();

alter table attendance_logs
  add column if not exists kiosk_id uuid references attendance_kiosks(id) on delete set null,
  add column if not exists attendance_media text,
  add column if not exists scan_value_hash text;

alter table attendance_logs drop constraint if exists attendance_logs_source_check;
alter table attendance_logs
  add constraint attendance_logs_source_check check (source in ('field_app', 'management', 'seed', 'kiosk'));

alter table attendance_logs drop constraint if exists attendance_logs_media_check;
alter table attendance_logs
  add constraint attendance_logs_media_check check (attendance_media is null or attendance_media in ('barcode', 'rfid', 'face', 'gps', 'manual'));

alter table attendance_policies enable row level security;
alter table attendance_kiosks enable row level security;

drop policy if exists "attendance_policies_read" on attendance_policies;
create policy "attendance_policies_read" on attendance_policies
for select to authenticated using (
  public.has_app_permission('attendance.view')
  or public.has_app_permission('employees.view')
  or public.has_app_permission('master_data.view')
);

drop policy if exists "attendance_policies_manage" on attendance_policies;
create policy "attendance_policies_manage" on attendance_policies
for all to authenticated using (
  public.has_app_permission('attendance.review')
  or public.has_app_permission('employees.manage')
  or public.has_app_permission('master_data.manage')
) with check (
  public.has_app_permission('attendance.review')
  or public.has_app_permission('employees.manage')
  or public.has_app_permission('master_data.manage')
);

drop policy if exists "attendance_kiosks_read" on attendance_kiosks;
create policy "attendance_kiosks_read" on attendance_kiosks
for select to authenticated using (
  public.has_app_permission('attendance.view')
  or public.has_app_permission('employees.view')
);

drop policy if exists "attendance_kiosks_manage" on attendance_kiosks;
create policy "attendance_kiosks_manage" on attendance_kiosks
for all to authenticated using (
  public.has_app_permission('attendance.review')
  or public.has_app_permission('employees.manage')
) with check (
  public.has_app_permission('attendance.review')
  or public.has_app_permission('employees.manage')
);

insert into permissions (key, label, group_name, description)
values
  ('kiosks.view', 'Lihat Kiosk Absensi', 'Absensi', 'Melihat perangkat kiosk, policy, dan gate absensi.'),
  ('kiosks.manage', 'Kelola Kiosk Absensi', 'Absensi', 'Mengatur perangkat kiosk, policy, barcode, dan RFID absensi.')
on conflict (key) do update set
  label = excluded.label,
  group_name = excluded.group_name,
  description = excluded.description;

insert into role_permissions (role_id, permission_key, enabled)
select r.id, p.key, true
from roles r
cross join permissions p
where r.code in ('ROLE-OWNER', 'ROLE-HR', 'ROLE-ADMIN')
  and p.key in ('kiosks.view', 'kiosks.manage')
on conflict (role_id, permission_key) do update set
  enabled = excluded.enabled,
  updated_at = now();

insert into role_permissions (role_id, permission_key, enabled)
select r.id, p.key, true
from roles r
cross join permissions p
where r.code in ('ROLE-SPV')
  and p.key in ('kiosks.view')
on conflict (role_id, permission_key) do update set
  enabled = excluded.enabled,
  updated_at = now();
