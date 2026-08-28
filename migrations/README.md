# Migrations

Run these **in numerical order** in the Supabase SQL editor
(Dashboard → SQL Editor → New query → paste → Run).

| File | What it does |
| --- | --- |
| `001_initial.sql` | Core tables + row-level security |
| `002_indexes.sql` | Indexes on the columns every query sorts by |
| `003_feedback.sql` | Insert-only feedback table for testers |
| `004_loan_terms.sql` | Loan interest + term columns, and `interest`/`penalty` event types |
| `005_category_case.sql` | Case-insensitive unique category names per user |

## The rules

**1. Never edit a file that has already been run.**
Once a migration has touched the production database, it is frozen. Need a
change? Add a new numbered file.

**2. Every statement must be idempotent.**
Use `create table if not exists`, `create index if not exists`,
`alter table … add column if not exists`, and `drop policy if exists` before
`create policy`. Running the whole folder top to bottom on an existing database
must be a no-op that succeeds.

**3. No `drop table`. No `truncate`. No unqualified `delete`.**
There is no backup schedule on the Supabase free tier. A destructive statement
here is unrecoverable.

**4. Adding a column? Give it a default or allow nulls.**
`add column foo text not null` fails on a table with existing rows.
`add column foo text not null default ''` works.

## Why deploys can't wipe your data

The frontend is a static build — Vercel/Netlify run `npm run build` and serve
`dist/`. Nothing in that pipeline can reach Postgres; the app only ever talks to
Supabase at runtime through the anon key, which RLS constrains to the signed-in
user's own rows.

So pushing updates is safe by construction. **The only way to lose data is to
run a destructive statement in the SQL editor yourself** — which is what rules 1
and 3 exist to prevent.

## Before running anything destructive-looking

Take a snapshot first:

```sql
select count(*) from transactions;
select count(*) from loans;
select count(*) from loan_events;
```

Re-run after and compare.
