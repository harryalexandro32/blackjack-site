-- Close poker_rooms to the public. Run after 0002 and after the site that listens for "update" messages is live.
-- From here on only the table server (service role) can read or write rooms; nobody can list room codes.

drop policy if exists "anyone can watch a table" on public.poker_rooms;
revoke all on public.poker_rooms from anon, authenticated;

-- Row changes are no longer pushed to browsers; the room's own channel does that now.
do $$
begin
  if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'poker_rooms') then
    alter publication supabase_realtime drop table public.poker_rooms;
  end if;
end $$;
