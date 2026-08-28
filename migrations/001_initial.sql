-- 001_initial.sql
-- Core schema: categories, budgets, transactions, loans, loan_events + RLS.
-- Safe to re-run: every statement is idempotent.

create extension if not exists "uuid-ossp";

-- ---------- Categories ----------
create table if not exists categories (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  created_at timestamptz default now(),
  unique (user_id, name)
);

-- ---------- Budgets (one row per category per user) ----------
create table if not exists budgets (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  category text not null,
  amount numeric not null default 0,
  created_at timestamptz default now(),
  unique (user_id, category)
);

-- ---------- Transactions (income & expenses) ----------
create table if not exists transactions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  date date not null,
  description text not null,
  category text not null,
  amount numeric not null, -- positive = income, negative = expense
  created_at timestamptz default now()
);

-- ---------- Loans ----------
create table if not exists loans (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  principal numeric not null,
  date date not null,
  notes text default '',
  created_at timestamptz default now()
);

-- ---------- Loan events (loan taken / repayment) ----------
create table if not exists loan_events (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  loan_id uuid references loans(id) on delete cascade not null,
  type text not null check (type in ('taken', 'repayment')),
  amount numeric not null,
  date date not null,
  created_at timestamptz default now()
);

-- ---------- Row Level Security ----------
alter table categories  enable row level security;
alter table budgets     enable row level security;
alter table transactions enable row level security;
alter table loans       enable row level security;
alter table loan_events enable row level security;

-- Each policy: a user can only select/insert/update/delete their own rows.
-- Dropped first so this file stays re-runnable.
drop policy if exists "categories_owner" on categories;
create policy "categories_owner" on categories for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "budgets_owner" on budgets;
create policy "budgets_owner" on budgets for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "transactions_owner" on transactions;
create policy "transactions_owner" on transactions for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "loans_owner" on loans;
create policy "loans_owner" on loans for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "loan_events_owner" on loan_events;
create policy "loan_events_owner" on loan_events for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
