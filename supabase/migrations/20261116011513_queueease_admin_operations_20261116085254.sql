-- QueueEase administrator read aggregates and system-setting writes.
-- Local draft only. Do not apply without explicit review and approval.

begin;

-- Prevent frontend clients from bypassing the filtered settings RPC with a
-- direct PostgREST SELECT. The table's existing admin-only RLS policy remains
-- enabled, and trusted SECURITY DEFINER RPCs owned by postgres retain access.
revoke select, insert, update, delete, truncate, references, trigger
  on table public.system_settings from public, anon, authenticated;

-- Compact aggregate data for the existing admin dashboard. The function
-- performs its own database-side administrator check and returns no patient
-- names, contact details, appointment IDs, or other row-level records.
create function public.admin_dashboard_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today date := private.queueease_today();
  v_stats jsonb;
  v_capacity jsonb;
  v_analytics jsonb;
  v_attention jsonb;
  v_reports jsonb;
begin
  if not private.is_queueease_admin() then
    raise exception using errcode = '42501', message = 'Administrator access is required.';
  end if;

  select jsonb_build_object(
    'total_users', (select count(*) from public.users u where u.role = 'user'),
    'total_appointments', (select count(*) from public.appointments),
    'today_appointments', (select count(*) from public.appointments a
      join public.schedules s on s.id = a.schedule_id
      where coalesce(a.appointment_date, s.service_date) = v_today),
    'pending_appointments', (select count(*) from public.appointments a where a.status = 'Pending'),
    'confirmed_today', (select count(*) from public.appointments a
      join public.schedules s on s.id = a.schedule_id
      where a.status = 'Confirmed' and coalesce(a.appointment_date, s.service_date) = v_today),
    'completed_today', (select count(*) from public.appointments a
      join public.schedules s on s.id = a.schedule_id
      where a.status = 'Completed' and coalesce(a.appointment_date, s.service_date) = v_today),
    'cancelled_today', (select count(*) from public.appointments a
      join public.schedules s on s.id = a.schedule_id
      where a.status = 'Cancelled' and coalesce(a.appointment_date, s.service_date) = v_today),
    'rejected_today', (select count(*) from public.appointments a
      join public.schedules s on s.id = a.schedule_id
      where a.status = 'Rejected' and coalesce(a.appointment_date, s.service_date) = v_today),
    'waiting', (select count(*) from public.queue_records q
      where q.service_date = v_today and q.service_name = 'General' and q.status = 'Waiting'),
    'serving', (select count(*) from public.queue_records q
      where q.service_date = v_today and q.service_name = 'General' and q.status = 'Serving')
  ) into v_stats;

  select jsonb_build_object(
    'total', coalesce(sum(s.capacity), 0),
    'booked', coalesce(sum(b.booked), 0),
    'available', coalesce(sum(greatest(s.capacity - b.booked, 0)), 0)
  ) into v_capacity
  from public.schedules s
  cross join lateral (
    select count(*)::integer as booked from public.appointments a
    where a.schedule_id = s.id and a.status in ('Pending', 'Confirmed')
  ) b
  where s.service_date >= v_today;

  select jsonb_build_object(
    'Pending', count(*) filter (where a.status = 'Pending'),
    'Confirmed', count(*) filter (where a.status = 'Confirmed'),
    'Rejected', count(*) filter (where a.status = 'Rejected'),
    'Completed', count(*) filter (where a.status = 'Completed'),
    'Cancelled', count(*) filter (where a.status = 'Cancelled')
  ) into v_analytics
  from public.appointments a
  where a.created_at >= now() - interval '30 days';

  select jsonb_build_object(
    'queue_issue', (select count(*) > 1 from public.queue_records q
      where q.service_date = v_today and q.service_name = 'General' and q.status = 'Serving'),
    'low_capacity', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'service_date', x.service_date,
        'time_slot', x.time_slot, 'available', x.available) order by x.service_date, x.time_slot)
      from (
        select s.id, s.service_date, s.time_slot,
          greatest(s.capacity - count(a.id)::integer, 0) as available
        from public.schedules s left join public.appointments a
          on a.schedule_id = s.id and a.status in ('Pending', 'Confirmed')
        where s.service_date >= v_today and s.is_available
        group by s.id
        having greatest(s.capacity - count(a.id)::integer, 0) between 1 and 2
        order by s.service_date, s.time_slot limit 8
      ) x
    ), '[]'::jsonb),
    'full_schedules', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'service_date', x.service_date,
        'time_slot', x.time_slot, 'available', 0) order by x.service_date, x.time_slot)
      from (
        select s.id, s.service_date, s.time_slot
        from public.schedules s left join public.appointments a
          on a.schedule_id = s.id and a.status in ('Pending', 'Confirmed')
        where s.service_date >= v_today and s.is_available
        group by s.id
        having count(a.id) >= s.capacity
        order by s.service_date, s.time_slot limit 8
      ) x
    ), '[]'::jsonb),
    'unavailable_schedules', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'service_date', x.service_date,
        'time_slot', x.time_slot, 'available', 0) order by x.service_date, x.time_slot)
      from (
        select s.id, s.service_date, s.time_slot from public.schedules s
        where s.service_date >= v_today and not s.is_available
        order by s.service_date, s.time_slot limit 8
      ) x
    ), '[]'::jsonb)
  ) into v_attention;

  select jsonb_build_object(
    'monthly', (select count(*) from public.appointments a
      where a.created_at >= date_trunc('month', now() at time zone 'Asia/Manila') at time zone 'Asia/Manila'),
    'daily', (select count(*) from public.appointments a
      join public.schedules s on s.id = a.schedule_id
      where coalesce(a.appointment_date, s.service_date) = v_today)
  ) into v_reports;

  return jsonb_build_object(
    'stats', v_stats,
    'capacity_totals', v_capacity,
    'appointment_analytics', v_analytics,
    'attention', v_attention,
    'reports', v_reports
  );
end;
$$;

alter function public.admin_dashboard_summary() owner to postgres;
revoke all on function public.admin_dashboard_summary() from public, anon, authenticated;
grant execute on function public.admin_dashboard_summary() to authenticated;

-- Patient-account listing for the existing admin view, with aggregate
-- appointment counts. Authorization is checked inside the function.
create function public.admin_patient_list()
returns table (
  id uuid,
  full_name text,
  email text,
  is_active boolean,
  created_at timestamptz,
  appointment_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_queueease_admin() then
    raise exception using errcode = '42501', message = 'Administrator access is required.';
  end if;
  return query
  select u.id, u.full_name::text, u.email::text, u.is_active, u.created_at,
    count(a.id)::bigint
  from public.users u
  left join public.appointments a on a.user_id = u.id
  where u.role = 'user'
  group by u.id
  order by u.created_at desc;
end;
$$;

alter function public.admin_patient_list() owner to postgres;
revoke all on function public.admin_patient_list() from public, anon, authenticated;
grant execute on function public.admin_patient_list() to authenticated;

-- No operational setting keys are defined by the existing schema, migrations,
-- operations guide, or application. Keep the allowlist deliberately empty
-- rather than guessing names or treating arbitrary values as non-secret.
-- When supported settings are specified, add exact keys and per-key value
-- validation to BOTH RPCs in a new reviewed migration.
create function public.admin_list_system_settings()
returns table (setting_name text, setting_value text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_queueease_admin() then
    raise exception using errcode = '42501', message = 'Administrator access is required.';
  end if;
  return query
  select s.setting_name::text, s.setting_value::text
  from public.system_settings s
  where s.setting_name = any (array[]::text[])
  order by s.setting_name;
end;
$$;

alter function public.admin_list_system_settings() owner to postgres;
revoke all on function public.admin_list_system_settings() from public, anon, authenticated;
grant execute on function public.admin_list_system_settings() to authenticated;

-- Updates are disabled because the project has no explicitly approved setting
-- keys or value validators. The same empty allowlist is used by the read RPC.
-- The guarded update/audit path is retained for a future reviewed allowlist;
-- its activity record includes the setting key only, never its value.
create function public.admin_update_system_setting(
  p_setting_name text,
  p_setting_value text
)
returns table (setting_name text, setting_value text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := pg_catalog.btrim(coalesce(p_setting_name, ''));
  v_value text := coalesce(p_setting_value, '');
  v_setting_name text;
  v_setting_value text;
begin
  if not private.is_queueease_admin() then
    raise exception using errcode = '42501', message = 'Administrator access is required.';
  end if;
  if v_name = '' or pg_catalog.char_length(v_name) > 100
     or p_setting_value is null or pg_catalog.char_length(v_value) > 255 then
    raise exception using errcode = '22023', message = 'Provide a valid setting name and a value of at most 255 characters.';
  end if;

  if not (v_name = any (array[]::text[])) then
    raise exception using errcode = '55000',
      message = 'System setting updates are disabled until approved setting keys and value rules are defined.';
  end if;

  update public.system_settings s
  set setting_value = v_value
  where s.setting_name = v_name
  returning s.setting_name::text, s.setting_value::text
  into v_setting_name, v_setting_value;

  if not found then
    raise exception using errcode = 'P0002', message = 'That system setting does not exist.';
  end if;
  perform private.write_activity(auth.uid(), 'administrator',
    'system_setting_updated', 'system_setting', null::bigint,
    jsonb_build_object('setting_name', v_name));
  setting_name := v_setting_name;
  setting_value := v_setting_value;
  return next;
end;
$$;

alter function public.admin_update_system_setting(text, text) owner to postgres;
revoke all on function public.admin_update_system_setting(text, text) from public, anon, authenticated;
grant execute on function public.admin_update_system_setting(text, text) to authenticated;

commit;