-- 008_active_sessions.sql
-- One active session per user.
--
-- Supabase Auth allows unlimited concurrent sessions, and the built-in
-- "enforce single session per user" switch is a Pro-plan feature. This table is
-- the free-tier equivalent: one row per user naming whichever session currently
-- owns the account. Newest login wins — signing in anywhere overwrites the row,
-- and the displaced device notices (over Realtime, or on next focus) and signs
-- itself out.
--
-- `session_id` is the claim of the same name from the access token. GoTrue mints
-- a new one per sign-in and keeps it stable across token refreshes, so it
-- identifies a device's login exactly as long as that login lasts. Nothing is
-- generated or stored client-side.
--
-- This is cooperative, not cryptographic: an evicted access token stays valid
-- until it expires. Enforcing it in the database would mean gating every policy
-- in 001 and 007 on the session id, which is deliberately not done here.
--
-- Safe to re-run.

create table if not exists active_sessions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  session_id text not null,
  claimed_at timestamptz not null default now()
);

alter table active_sessions enable row level security;

-- Same shape as profiles_owner in 007: the primary key *is* the user id, so the
-- check is on `user_id` and a user reaches only their own row.
drop policy if exists "active_sessions_owner" on active_sessions;
create policy "active_sessions_owner" on active_sessions for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Realtime is how a displaced device finds out promptly. Without this the app
-- still evicts, but only when the tab is next focused.
--
-- `alter publication ... add table` errors if the table is already published, so
-- it cannot be written bare in a file that must survive re-running.
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise notice 'no supabase_realtime publication; eviction falls back to the on-focus check';
  elsif not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'active_sessions'
  ) then
    alter publication supabase_realtime add table active_sessions;
  end if;
end
$$;
