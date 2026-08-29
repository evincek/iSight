# Operations

## Overview

Personal Ledger is a static Vite build served by Vercel, talking to a Supabase
project (Postgres + Auth) from the browser. There is no server to restart and no
process to keep alive — "operating" this project means: running it locally,
applying migrations by hand, and getting a change through the branch pipeline.

## Prerequisites

- Node 20 (CI pins it; `npm ci` uses the committed lockfile)
- A Supabase project (free tier is enough)
- `gh` CLI for watching pipeline runs
- Local git aliases `fix` / `feat` — see [Fresh clone setup](#fresh-clone-setup)

## Configuration

| File | Purpose |
| --- | --- |
| `.env` | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` — gitignored |
| `.env.example` | the template to copy |
| `vite.config.js` | manual chunks for `recharts` and `@supabase/supabase-js` |

Both env vars are **inlined at build time**, not read at runtime. Vite only
reads them at startup, so changing `.env` means restarting the dev server. A
build without them produces an app that renders only the "Not configured"
screen — which is by design, `src/lib/supabaseClient.js` turns missing vars into
a `configError` string rather than throwing.

The anon key is safe in a browser bundle; row-level security is what actually
protects the data. **Never put the `service_role` key in `.env`.**

Supabase dashboard settings that matter:

- **Project Settings → API** — where the URL and anon key come from.
- **Authentication → URL Configuration** — add `http://localhost:5173/**` and
  `https://your-app.vercel.app/**`. Password-reset and confirmation links bounce
  without these.
- **Authentication → Providers → Email** — turn off email confirmation while
  testing; the built-in sender is rate-limited to a few emails per hour across
  confirmations *and* resets.
- **Table Editor → feedback** — the only way to read in-app feedback; the table
  has no select policy.

## Common operations

### Running locally

```bash
cp .env.example .env      # paste in Project URL + anon key
npm install
npm run dev               # http://localhost:5173
```

### Building and previewing

```bash
npm run build             # → dist/
npm run preview
```

### Running the tests

```bash
npm test                  # node --test scripts/analytics.test.js
```

135 assertions, no bundler and no framework — `lib/analytics.js` takes plain
arrays, so `node --test` and `node:assert` are enough. Most of the suite is not
in that file: it is `spec/fixtures/*.json`, the shared specification for the
derived-data layer.

Add coverage as a **fixture case**, not a JS test. The suite has a guard that
fails if any exported function of `analytics.js` has no fixture case, unless it
is named in `LOCALE_SENSITIVE` with a reason.

### Applying a migration

Migrations are **run by hand** in the Supabase SQL editor — Dashboard → SQL
Editor → New query → paste → Run. In numerical order, `001` through `007`.

Before running anything destructive-looking, take a snapshot and compare after:

```sql
select count(*) from transactions;
select count(*) from loans;
select count(*) from loan_events;
```

The rules (full text in [`migrations/README.md`](../../migrations/README.md)):

1. **Never edit a migration that has already been run.** Add a new numbered file.
2. **Every statement idempotent** — `if not exists`, `drop policy if exists`
   before `create policy`. Running the whole folder top to bottom on a live
   database must be a successful no-op.
3. **No `drop table`, no `truncate`, no unqualified `delete`.** There is no
   backup schedule on the free tier.
4. **New column? Give it a default or allow nulls.** `add column foo text not
   null` fails on a table with existing rows.

`005_merge_category_case.sql` must run before `006_category_case.sql` — 005
defines `category_key()` and folds existing case-variant categories together,
and 006 raises a loud exception listing the collisions if it hasn't.

### Shipping a change

```bash
git fix  "message"        # minor fixes  → bug-fix branch
git feat "message"        # new work     → features branch
```

Each alias fetches, switches to (or creates from `main`) the branch, stages
everything, commits, rebases on anything the pipeline pushed back down, and
pushes. **That push is the trigger — there is nothing else to run.**

```
git fix / git feat
      │
      ▼
  bug-fix ──┐
            ├──▶ upgrade ──▶ main ──▶ Vercel deploys
  features ─┘
```

`.github/workflows/promote.yml` then, in one job:

1. `npm test` — the first gate. A red test means the numbers on screen changed.
2. `npm run build` — the second gate.
3. Checks whether the diff against `main` touches `migrations/`.
4. Green and no migrations → merges into `upgrade`, fast-forwards `main`,
   pushes, and back-merges `main` into both working branches.

Vercel sees `main` move and deploys. End to end: about two minutes.

**Never commit to `main` by hand.** The pipeline fast-forwards `main`, and a
manual commit there makes that fast-forward fail.

### Shipping a change that includes a migration

Automatic promotion is held and a PR is opened instead.

```bash
git fix "case-insensitive categories"     # held; opens a PR
gh pr list                                # find its number
# ...run the named .sql files in the Supabase SQL editor...
gh pr merge <number> --merge              # promotion resumes via upgrade.yml
```

Merging the PR **is** the statement "the schema is already in place". Nothing
else checks. While the migration sits unmerged, every further push to that
branch is held too and accumulates into the same PR.

Note that `upgrade.yml` — the manual-merge path — runs `npm run build` but
**not** `npm test`. The test gate lives in `promote.yml`. Run `npm test`
yourself before merging a held PR.

### Watching a run

```bash
gh run list --limit 5     # recent runs and outcomes
gh run watch              # follow the one in progress
gh run view --log-failed  # why the last one failed
```

### Forcing a promotion

```bash
gh run rerun <run-id>
gh workflow run promote.yml --ref bug-fix   # retry without a new commit
gh workflow run upgrade.yml --ref upgrade   # push a green upgrade to prod now
```

### Checking where everything is

```bash
git ls-remote origin main upgrade bug-fix features
```

## Troubleshooting

**App shows "Not configured".** The env vars aren't reaching it. Check `.env`
exists and restart the dev server. In production, check the Vercel environment
variables and **redeploy** — they are inlined at build time, so setting them
without a rebuild changes nothing.

**"Everything up-to-date", no run started.** Nothing was committed; the tree was
already clean. `git status`.

**Nothing happened after the push.** Wrong branch. Only `bug-fix`, `features`
and `upgrade` trigger workflows. `git rev-parse --abbrev-ref HEAD`.

**Run failed at "Test".** The numbers changed. Reproduce with `npm test` — a
failed fixture names the function and the path, e.g. `forecast.projected`.

**Run failed at "Build".** Reproduce with `npm ci && npm run build`. Note it
builds without `.env`, so a green CI build says nothing about whether Vercel's
env vars are set.

**Run failed at "Fast-forward main".** Something was committed to `main`
directly.

```bash
git switch upgrade && git pull && git merge origin/main && git push
```

**A back-merge warning in the log.** `main` couldn't be merged back into a
working branch cleanly. Nothing is broken:

```bash
git switch features && git pull
```

**Push rejected as non-fast-forward.** The pipeline moved the branch under you.
The aliases handle this; if you pushed by hand, `git pull --rebase`.

**Migration fails with "function public.category_key(text) does not exist".**
`006` was run without `005`. Run `005_merge_category_case.sql` from the top —
both its function definitions are `create or replace` and idempotent.

**Migration fails with "function category_norm(text) does not exist, CONTEXT:
SQL function category_key during inlining".** `category_key` exists but cannot
see `category_norm` — 005's function block was run partially, or under a
`search_path` that no longer applies. Re-run 005 from the top.

**Supabase project paused.** The free tier pauses after 7 days with no API
traffic. Data is not deleted; resume it from the dashboard. To prevent it, point
a free UptimeRobot HTTP monitor at the project URL, or run a scheduled Action
that `curl`s it.

**Testers can't sign up / reset.** Email is rate-limited to a few per hour on
the built-in sender, shared across confirmations and resets. Add custom SMTP
(Resend, Brevo) under **Authentication → SMTP Settings** — a dashboard change,
no code change.

## Why deploys can't lose data

The frontend is a static build. Vercel runs `npm run build` and serves `dist/`;
nothing in that pipeline can reach Postgres. The app only ever talks to Supabase
at runtime through the anon key, which RLS constrains to the signed-in user's
own rows.

The only way to lose data is to run a destructive statement in the SQL editor
yourself — which is what the migration rules above exist to prevent, and why the
pipeline holds any changeset touching `migrations/`.

## Fresh clone setup

The `fix`/`feat` aliases are local git config and don't travel with the repo:

```bash
git config --local alias.fix  '!f() { b=bug-fix;  git fetch -q origin; git switch "$b" 2>/dev/null || git switch -c "$b" origin/main || return 1; git add -A || return 1; git commit -m "$1" || return 1; if git ls-remote --exit-code --heads origin "$b" >/dev/null 2>&1; then git pull --rebase --autostash origin "$b" || return 1; fi; git push -u origin "$b"; }; f'
git config --local alias.feat '!f() { b=features; git fetch -q origin; git switch "$b" 2>/dev/null || git switch -c "$b" origin/main || return 1; git add -A || return 1; git commit -m "$1" || return 1; if git ls-remote --exit-code --heads origin "$b" >/dev/null 2>&1; then git pull --rebase --autostash origin "$b" || return 1; fi; git push -u origin "$b"; }; f'
```

Repo settings this depends on (already applied):

- **Settings → Actions → General → Workflow permissions**: *Read and write*, and
  allow Actions to create pull requests.
- **Leave `main` unprotected.** Required reviews reject the bot's push and
  deadlock every promotion.
- **Vercel**: production branch is `main`. `upgrade`, `bug-fix` and `features`
  get preview deploys — those are the staging URLs.
