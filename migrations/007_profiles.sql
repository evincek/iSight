-- 007_profiles.sql
-- One settings row per user. Currently just the display currency.
--
-- The ledger stored amounts as plain numerics from the start and rendered them
-- with a hardcoded "₵". The number was never the problem — the symbol was, and
-- it made the app unusable outside Ghana. This table holds the symbol; nothing
-- about how amounts are stored or summed changes.
--
-- Deliberately not a column on auth.users: that table belongs to Supabase Auth
-- and should not be extended by the application.
--
-- Safe to re-run.

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  currency text not null default '₵',
  created_at timestamptz default now()
);

alter table profiles enable row level security;

-- Same shape as every other policy in 001: a user reaches only their own row.
-- The primary key *is* the user id here, so the check is on `id`.
drop policy if exists "profiles_owner" on profiles;
create policy "profiles_owner" on profiles for all
  using (auth.uid() = id) with check (auth.uid() = id);

-- Backfill anyone who signed up before this file ran. New users get their row
-- from the app on first load, the same way default categories are seeded.
insert into profiles (id)
select u.id from auth.users u
where not exists (select 1 from profiles p where p.id = u.id);
