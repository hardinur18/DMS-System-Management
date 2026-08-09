begin;

update public.work_locations
set
  latitude = case code
    when 'LOC-GDU' then -6.6311200
    when 'LOC-KAD' then -6.6312500
    when 'LOC-WKS' then -6.6313200
    else latitude
  end,
  longitude = case code
    when 'LOC-GDU' then 106.8050500
    when 'LOC-KAD' then 106.8052300
    when 'LOC-WKS' then 106.8049200
    else longitude
  end,
  updated_at = now()
where code in ('LOC-GDU', 'LOC-KAD', 'LOC-WKS')
  and (latitude is null or longitude is null);

insert into public.audit_logs (actor_name, action, target_table, target_id, status, metadata)
select
  'System',
  'Seed work location GPS coordinates for field attendance testing',
  'work_locations',
  '20260807000700',
  'success',
  '{"source":"migration","module":"field-attendance","note":"temporary testing coordinates"}'::jsonb
where not exists (
  select 1
  from public.audit_logs
  where target_table = 'work_locations'
    and target_id = '20260807000700'
);

commit;
