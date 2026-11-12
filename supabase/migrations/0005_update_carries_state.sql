-- The room's "update" message now carries the new table, so browsers don't have to ask for it after every move.
-- p_cast is built by the table server: the part every player sees in the clear, and each player's own part
-- (their hand and so on) encrypted with a key only that player's browser can derive from its private token.
-- The room code is never in it. When p_cast is null the message is the bare version number, as before.
-- The five-argument poker_commit stays for the moment the old table server is still running.

create or replace function public.poker_commit(p_room uuid, p_version integer, p_state jsonb, p_public jsonb, p_status text, p_cast jsonb)
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
  -- A failed message must never undo a move: browsers also poll, so they catch up anyway.
  begin
    perform realtime.send(coalesce(p_cast, '{}'::jsonb) || jsonb_build_object('v', v), 'update', 'room-' || p_room::text, false);
  exception when others then
    null;
  end;
  return v;
end $$;

revoke all on function public.poker_commit(uuid, integer, jsonb, jsonb, text, jsonb) from public, anon, authenticated;
grant execute on function public.poker_commit(uuid, integer, jsonb, jsonb, text, jsonb) to service_role;
