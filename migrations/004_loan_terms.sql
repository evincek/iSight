-- 004_loan_terms.sql
-- Loan interest + term, and penalties charged at repayment time.
--
-- Two new columns on `loans` describe the deal itself (how much interest is
-- owed on top of the principal, and over how many months), and two new
-- `loan_events` types record the money side of it:
--
--   'interest' — the agreed interest, charged once when the loan is recorded
--   'penalty'  — a late/breach charge, recorded alongside a repayment
--
-- Both are charges: they raise what's outstanding, exactly like 'taken' does.
-- Neither moves cash, so the register's running balance ignores them.
-- Safe to re-run.

alter table loans add column if not exists interest_amount numeric not null default 0;
alter table loans add column if not exists duration_months integer;

-- Widen the event-type whitelist.
--
-- 001 wrote the check inline, so its name is whatever Postgres generated —
-- normally `loan_events_type_check`. Rather than trust that, drop every check
-- constraint on the table that mentions the `type` column, then add ours back
-- under a known name. Re-running this drops and recreates the same constraint,
-- which is a no-op against the data.
do $$
declare c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'loan_events'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%type%'
  loop
    execute format('alter table loan_events drop constraint %I', c.conname);
  end loop;
end $$;

alter table loan_events add constraint loan_events_type_check
  check (type in ('taken', 'repayment', 'interest', 'penalty'));
