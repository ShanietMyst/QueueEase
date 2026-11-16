-- QueueEase Phase B: student slot aggregation and self-service profiles.
-- Prepared locally for review. This migration has NOT been executed or applied.
--
-- Capacity-consuming appointment statuses MUST stay in sync with
-- public.book_appointment(): Pending and Confirmed.

begin;

-- Returns available schedules and aggregate capacity counts only. Appointment
-- rows are read inside a SECURITY DEFINER function because student RLS must not
-- expose other students' appointments. No appointment IDs or personal fields
-- are returned. Counts are advisory: book_appointment() repeats the capacity
-- check while locking the schedule row before it writes. Date filtering uses
-- the existing private.queueease_today() helper without modifying it.
create function public.get_available_slots(
  p_service_date date default null
)
returns table (
  schedule_id bigint,
  service_date date,
  time_slot text,
  capacity integer,
  booked integer,
  remaining integer,
  is_available boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not private.is_queueease_active_user() then
    raise exception using
      errcode = '42501',
      message = 'An active QueueEase student account is required.';
  end if;

  if p_service_date is not null
     and p_service_date < private.queueease_today() then
    raise exception using
      errcode = '22023',
      message = 'Choose a date that is today or later in the QueueEase timezone.';
  end if;

  return query
  select
    s.id,
    s.service_date,
    s.time_slot::text,
    s.capacity,
    count(a.id)::integer as booked,
    greatest(s.capacity - count(a.id)::integer, 0) as remaining,
    s.is_available
  from public.schedules as s
  left join public.appointments as a
    on a.schedule_id = s.id
   and a.status in ('Pending', 'Confirmed')
  where s.is_available
    and s.service_date >= private.queueease_today()
    and (p_service_date is null or s.service_date = p_service_date)
  group by s.id, s.service_date, s.time_slot, s.capacity, s.is_available
  order by s.service_date, s.time_slot;
end;
$$;

-- Own SECURITY DEFINER RPCs by the trusted Supabase project database owner.
-- On Supabase SQL Editor this is normally postgres. The role must be trusted,
-- not client assumable, and must own/have rights to the referenced objects.
alter function public.get_available_slots(date) owner to postgres;
revoke all on function public.get_available_slots(date)
  from public, anon, authenticated;
grant execute on function public.get_available_slots(date) to authenticated;

-- Profile writes are self-scoped. No target user ID, email, Auth UUID, role,
-- active flag, or administrator field is accepted from the caller. Name
-- normalization/validation matches the signup trigger. Contact normalization
-- and its 30-character bound match signup, with an additional Philippine mobile
-- shape check because signup currently accepts malformed punctuation-only
-- strings. The existing users_set_updated_at trigger updates updated_at.
create function public.update_queueease_profile(
  p_full_name text,
  p_contact_number text
)
returns table (
  profile_id uuid,
  full_name text,
  email text,
  contact_number text,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_full_name text;
  v_contact_number text;
  v_contact_compact text;
  v_profile public.users%rowtype;
begin
  if v_uid is null
     or not (private.is_queueease_active_user() or private.is_queueease_admin()) then
    raise exception using
      errcode = '42501',
      message = 'An active QueueEase account is required.';
  end if;

  v_full_name := pg_catalog.regexp_replace(
    pg_catalog.btrim(coalesce(p_full_name, '')),
    '[[:space:]]+', ' ', 'g'
  );
  v_contact_number := pg_catalog.regexp_replace(
    pg_catalog.btrim(coalesce(p_contact_number, '')),
    '[[:space:]]+', ' ', 'g'
  );
  -- Accept common Philippine mobile forms: 09XXXXXXXXX, 9XXXXXXXXX,
  -- 639XXXXXXXXX, and +639XXXXXXXXX. Spaces, parentheses, dots, and hyphens
  -- may separate digits but are removed for format validation.
  v_contact_compact := pg_catalog.regexp_replace(v_contact_number, '[() .-]', '', 'g');

  if v_full_name = ''
     or pg_catalog.char_length(v_full_name) > 120
     or v_full_name ~ '[[:cntrl:]]'
     or v_contact_number = ''
     or pg_catalog.char_length(v_contact_number) > 30
     or v_contact_compact !~ '^(+63|63|0)?9[0-9]{9}$' then
    raise exception using
      errcode = '22023',
      message = 'Provide a valid full name and mobile number.';
  end if;

  update public.users as u
     set full_name = v_full_name,
         contact_number = v_contact_number
   where u.id = v_uid
     and u.is_active
     and u.role in ('user', 'admin')
  returning u.* into v_profile;

  if not found then
    raise exception using
      errcode = '42501',
      message = 'The active QueueEase profile could not be updated.';
  end if;

  perform private.write_activity(
    v_uid,
    case when v_profile.role = 'admin' then 'administrator' else 'user' end,
    'profile_updated',
    'user',
    null::bigint,
    null::jsonb
  );

  return query
  select v_profile.id,
         v_profile.full_name::text,
         v_profile.email::text,
         v_profile.contact_number::text,
         v_profile.updated_at;
end;
$$;

alter function public.update_queueease_profile(text, text) owner to postgres;

-- Direct authenticated column updates are revoked so validation cannot be
-- bypassed with PostgREST table updates. The existing self/admin RLS policy
-- remains enabled as defense in depth; the SECURITY DEFINER RPC performs its
-- own auth.uid(), active-account, and self-row checks.
revoke update (full_name, contact_number) on table public.users
  from public, anon, authenticated;
revoke update on table public.users from public, anon, authenticated;
revoke all on function public.update_queueease_profile(text, text)
  from public, anon, authenticated;
grant execute on function public.update_queueease_profile(text, text)
  to authenticated;

commit;