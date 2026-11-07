-- Online poker tables.
-- poker_rooms holds only what every player may see; anyone can read it and subscribe to changes.
-- poker_secrets holds the deck, hole cards and player tokens; only the edge function (service role) can touch it.

create table if not exists public.poker_rooms (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique check (code ~ '^[A-Z0-9]{6}$'),
  status        text not null default 'waiting' check (status in ('waiting', 'playing', 'closed')),
  settings      jsonb not null,
  public_state  jsonb not null default '{}'::jsonb,
  version       integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  closed_at     timestamptz
);

create table if not exists public.poker_secrets (
  room_id  uuid primary key references public.poker_rooms (id) on delete cascade,
  state    jsonb not null
);

alter table public.poker_rooms enable row level security;
alter table public.poker_secrets enable row level security;

-- Public read of the visible table state. No insert/update/delete policies: writes go through the edge function.
drop policy if exists "anyone can watch a table" on public.poker_rooms;
create policy "anyone can watch a table" on public.poker_rooms for select to anon, authenticated using (true);
-- poker_secrets has no policies at all, so anon and authenticated users can't read or write it.

revoke all on public.poker_secrets from anon, authenticated;
revoke insert, update, delete on public.poker_rooms from anon, authenticated;

-- Push row changes to subscribed browsers.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'poker_rooms') then
    alter publication supabase_realtime add table public.poker_rooms;
  end if;
end $$;

-- Save a move: both rows in one transaction, and only if nobody else saved first.
create or replace function public.poker_commit(p_room uuid, p_version integer, p_state jsonb, p_public jsonb, p_status text)
returns integer
language plpgsql
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
  return v;
end $$;

revoke all on function public.poker_commit(uuid, integer, jsonb, jsonb, text) from public, anon, authenticated;
grant execute on function public.poker_commit(uuid, integer, jsonb, jsonb, text) to service_role;

create index if not exists poker_rooms_updated_at on public.poker_rooms (updated_at);
