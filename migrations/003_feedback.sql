-- 003_feedback.sql
-- In-app feedback from testers.
--
-- Deliberately INSERT-ONLY: there is no select/update/delete policy, so a
-- signed-in user can send feedback but cannot read anyone's — including their
-- own. Read it yourself in the Supabase dashboard (Table Editor > feedback),
-- which uses the service role and bypasses RLS.
-- Safe to re-run.

create table if not exists feedback (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  message text not null,
  page text,
  user_agent text,
  created_at timestamptz default now()
);

alter table feedback enable row level security;

drop policy if exists "feedback_insert_own" on feedback;
create policy "feedback_insert_own" on feedback for insert
  with check (auth.uid() = user_id);

create index if not exists feedback_created_idx
  on feedback (created_at desc);
