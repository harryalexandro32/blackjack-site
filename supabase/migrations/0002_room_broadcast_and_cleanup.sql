-- Rooms tell their own players when something changed, and old rooms get swept away.
--
-- Before this, browsers listened to row changes on poker_rooms, which needed the whole table to be readable
-- by anyone (so anyone could list every room code). Now each save sends a small "update" message on the
-- room's own channel, named after the room id (a random uuid only the people in the room know).
-- 0003 then closes the table to the public. Run this file first, ship the new site, then run 0003.

create or replace function public.poker_commit(p_room uuid, p_version integer, p_state jsonb, p_public jsonb, p_status text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v integer;
begin
  update public.poker_rooms
     set public_state = p_public,
         status       = p_status,
         version      = version + 1,
         updated_at   = now(),
         closed_at    = case when p_status = 'closed' then coalesce(closed_at, now()) else closed_at end
   where id = p_room and version = p_version
  returning version into v;
  if v is null then
    raise exception 'version_conflict' using errcode = '40001';
  end if;
  update public.poker_secrets set state = p_state where room_id = p_room;
  -- Nudge the room's browsers. The message carries nothing secret; each browser then asks for its own view.
  -- A failed nudge must never undo a move: browsers also poll, so they catch up anyway.
  begin
    perform realtime.send(jsonb_build_object('v', v), 'update', 'room-' || p_room::text, false);
  exception when others then
    null;
  end;
  return v;
end $$;

revoke all on function public.poker_commit(uuid, integer, jsonb, jsonb, text) from public, anon, authenticated;
grant execute on function public.poker_commit(uuid, integer, jsonb, jsonb, text) to service_role;

-- Sweep old rooms once a day: closed rooms after a week (long enough to reread who owes whom),
-- any room nobody has touched for 30 days. poker_secrets rows go with them (on delete cascade).
create extension if not exists pg_cron;

select cron.unschedule(jobid) from cron.job where jobname = 'purge-old-rooms';
select cron.schedule(
  'purge-old-rooms',
  '17 3 * * *',
  $job$
    delete from public.poker_rooms
     where (status = 'closed' and coalesce(closed_at, updated_at) < now() - interval '7 days')
        or updated_at < now() - interval '30 days'
  $job$
);
