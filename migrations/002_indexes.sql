-- 002_indexes.sql
-- Every read in the app filters by user_id (via RLS) and orders by date.
-- Without these, Postgres sequentially scans each table on every load.
-- Safe to re-run.

create index if not exists transactions_user_date_idx
  on transactions (user_id, date desc);

create index if not exists loan_events_user_date_idx
  on loan_events (user_id, date desc);

create index if not exists loan_events_loan_idx
  on loan_events (loan_id);

create index if not exists loans_user_date_idx
  on loans (user_id, date desc);

create index if not exists budgets_user_idx
  on budgets (user_id);

create index if not exists categories_user_idx
  on categories (user_id, created_at);
