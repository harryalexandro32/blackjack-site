-- One call to load a room. The table server used to read poker_rooms and then poker_secrets, one after the
-- other, on every request; this returns both in a single round trip. Look up by id, or by code when id is null.

create or replace function public.poker_load(p_id uuid, p_code text)
returns table (id uuid, code text, version integer, status text, state jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.code, r.version, r.status, s.state
    from public.poker_rooms r
    join public.poker_secrets s on s.room_id = r.id
   where case when p_id is not null then r.id = p_id else r.code = upper(p_code) end
   limit 1
$$;

revoke all on function public.poker_load(uuid, text) from public, anon, authenticated;
grant execute on function public.poker_load(uuid, text) to service_role;
