-- Backfill GPS evidence for existing dummy attendance logs.
-- New field attendance submissions write the real employee latitude/longitude.

update public.attendance_logs as attendance_logs
set
  latitude = case
    when attendance_logs.gps_status = 'out_of_radius' then work_locations.latitude + 0.00085
    else work_locations.latitude + 0.00004
  end,
  longitude = case
    when attendance_logs.gps_status = 'out_of_radius' then work_locations.longitude + 0.00065
    else work_locations.longitude + 0.00003
  end,
  updated_at = now()
from public.work_locations
where attendance_logs.work_location_id = work_locations.id
  and attendance_logs.latitude is null
  and attendance_logs.longitude is null
  and work_locations.latitude is not null
  and work_locations.longitude is not null;

insert into public.audit_logs (actor_name, action, target_table, target_id, status, metadata)
values
  ('System', 'Backfill attendance GPS evidence', 'attendance_logs', '20260807000900', 'success', '{"source":"migration","module":"attendance-approval","note":"dummy gps evidence only"}'::jsonb);
