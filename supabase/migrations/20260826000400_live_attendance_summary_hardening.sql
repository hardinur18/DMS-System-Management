-- Live attendance reads settled daily rows by date range.
-- These indexes keep monitoring and recap pages stable when attendance data grows.

create index if not exists idx_attendance_daily_summaries_date_employee
on public.attendance_daily_summaries(attendance_date desc, employee_id);

create index if not exists idx_attendance_logs_employee_date_event_at
on public.attendance_logs(employee_id, attendance_date, event_type, event_at desc);

comment on table public.attendance_daily_summaries is
  'Daily settled attendance source for Live Absensi, Rekap Absensi, and payroll reconciliation.';

insert into public.audit_logs (actor_name, action, target_table, target_id, status, metadata)
values
  ('System', 'Harden live attendance summary indexes', 'attendance_daily_summaries', '20260826000400', 'success', '{"source":"migration","module":"attendance","summary":"live-attendance"}'::jsonb);
