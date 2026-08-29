# Architecture

## Overview

Personal Ledger is a single-page React app with no backend of its own. The
browser talks directly to Supabase (Postgres + Auth) over the anon key, and
row-level security is what keeps one user's rows away from another's. The
frontend is a static Vite build; there is no server-side code anywhere in the
project.

```
browser ──► Supabase Auth      (sessions, password reset)
        └─► Supabase Postgres  (all data, RLS-scoped to auth.uid())

repo ──► GitHub Actions ──► main ──► Vercel ──► static dist/
```

Stack: Vite 5 + React 18 (plain JSX, no TypeScript, no router, no state
library), Recharts for charts, `@supabase/supabase-js` for data, and
`@vercel/analytics` for page metrics. Styling is inline objects plus CSS custom
properties — no CSS framework.

## The layer cake

The single most important structural rule in this codebase: **all arithmetic
lives in `src/lib/analytics.js`, which imports neither React nor Supabase.** It
takes plain arrays and returns plain data. That is what makes the numbers
testable on bare `node`, and what allows the same contract to be re-implemented
in another language (see `spec/`).

```
                 ┌──────────────────────────────────────┐
   data layer    │ hooks/useLedgerData.js               │  every read + write
                 │   Supabase queries, row shaping,     │  optimistic updates
                 │   optimistic state, category seeding │
                 └───────────────┬──────────────────────┘
                                 │ plain arrays / maps
                 ┌───────────────▼──────────────────────┐
   derived data  │ lib/analytics.js  (pure)             │  no React,
                 │ lib/categories.js lib/format.js      │  no Supabase
                 └───────────────┬──────────────────────┘
                                 │ chart-ready rows, totals, flags
                 ┌───────────────▼──────────────────────┐
   presentation  │ views/*.jsx  components/*  theme.js  │  layout only,
                 │ lib/chartTheme.js                    │  ~no maths
                 └──────────────────────────────────────┘
```

A view is allowed to do trivial shaping (`a / b * 100` for a bar width, sorting
an already-computed map). Anything a user could dispute the value of belongs in
`analytics.js`, where a fixture can pin it.

## File map

```
migrations/          numbered, idempotent SQL — run by hand, in order
spec/
  README.md          the analytics contract, in prose
  harness.js         fixture engine ($ref/$date args, result paths)
  fixtures/*.json    the specification itself — language-neutral
scripts/
  analytics.test.js  node --test runner over the fixtures + JS-only cases
src/
  main.jsx           applyTheme(), mounts <App> inside StrictMode
  App.jsx            auth gate: loading / recovery / signed-out / Ledger
  Ledger.jsx         signed-in container: owns `view` and `selectedMonth`
  theme.js           design tokens, fonts, BREAKPOINT, global CSS
  lib/
    analytics.js     ALL derived data (783 lines) — pure
    categories.js    name normalisation + budget realignment
    format.js        money/date helpers, currency symbol, month options
    chartTheme.js    validated chart colours and Recharts prop bundles
    supabaseClient.js  client + configError for missing env vars
  hooks/
    useLedgerData.js every Supabase read and write
    useIsNarrow.js   useMediaQuery / useIsNarrow / useIsTouch
  components/
    Shell.jsx        sidebar or bottom tab bar, month picker, feedback modal
    primitives.jsx   Panel, StatTile, Delta, Bar, Field, Input, Select,
                     Button, Checkbox, Banner, Empty, ScrollX, AutoGrid
  views/
    Overview.jsx  Analytics.jsx  Register.jsx
    Budgets.jsx   Loans.jsx      Settings.jsx
  auth/
    AuthView.jsx  ResetRequest.jsx  ResetConfirm.jsx
```

## Application flow

1. `main.jsx` calls `applyTheme()` (injects design tokens as CSS custom
   properties on `<html>`, so auth screens and modals read the same values) and
   renders `<App>`.
2. `App.jsx` is the auth gate. It checks for a `type=recovery` hash **before**
   the Supabase SDK strips it, so a password-reset link lands on
   `ResetConfirm` rather than dropping the user into the ledger on a temporary
   session. States: `undefined` session → "Loading…"; recovery → `ResetConfirm`;
   no session → `AuthView` / `ResetRequest`; otherwise → `Ledger`.
3. `Ledger.jsx` calls `useLedgerData(session.user.id)`, owns exactly two pieces
   of UI state — `view` and `selectedMonth` — and renders one of six views
   inside `Shell`. There is no router; navigation is a state switch.
4. Each view receives the whole `data` object plus the selected `month` and
   derives what it needs through `lib/analytics.js`.

`selectedMonth` is a `YYYY-MM` string. Every view reads the same one, so
switching tabs never changes the period being looked at.

## Data layer (`useLedgerData`)

One hook owns everything that touches Supabase. It loads six queries in
parallel on mount:

| Table | Ordering | Notes |
| --- | --- | --- |
| `transactions` | `date desc` | `amount` signed: + income, − expense |
| `loans` | `date desc` | numerics arrive as strings; `shapeLoan` casts |
| `loan_events` | `date desc` | `shapeEvent` casts and maps `loan_id`→`loanId` |
| `budgets` | — | flattened to a `{ category: amount }` map |
| `categories` | `created_at asc` | seeded with 9 defaults on first run |
| `profiles` | by id | display currency only; failures are non-fatal |

Three behaviours worth knowing:

- **Postgres numerics come back as strings.** Every cast happens here
  (`Number(t.amount)`, `shapeLoan`, `shapeEvent`) so nothing downstream has to
  know. Adding a new numeric column means adding a cast here.
- **`profiles` is deliberately excluded from the error check.** Migrations are
  applied by hand, so the code can reach a database where `007` has not run.
  A missing display preference must not stop someone opening their ledger — it
  falls back to the default symbol and the load carries on.
- **Seeding is race-tolerant.** StrictMode double-invokes effects and a second
  tab can seed in parallel, so category seeding uses
  `upsert(..., { ignoreDuplicates: true })` and then re-reads, rather than
  letting a duplicate-key error abort the load and leave the list empty.

Writes are optimistic: `deleteTransaction` removes the row from state first and
restores a snapshot if the delete fails; `setBudget` updates the map before the
upsert; `updateCurrency` sets both the module-level symbol and the state copy
before the round trip and rolls both back together on failure.

## Currency handling

The display symbol is module-level state in `lib/format.js`, not a prop.
`fmtMoney` is called at roughly 76 sites, and threading a symbol through all of
them would add noise everywhere to express something that never varies within a
session. `useLedgerData` calls `setCurrency()` on load and keeps a state copy so
React actually re-renders.

**Amounts are stored and summed as plain numbers.** Changing the currency
relabels; it never converts or recalculates.

## Category names

Category names are free text stored three times over: on the `categories` row,
on every transaction, and on every budget. Nothing keeps those spellings in
step, so `lib/categories.js` defines the folding rules:

- `normalizeCategory(name)` — trim, collapse inner whitespace, **case as typed**
  (so "iPhone fund" doesn't become "Iphone Fund"). This is what gets stored.
- `categoryKey(name)` — `normalizeCategory` then lowercase. This is what gets
  matched on, and migration `006` indexes `categories` on a SQL `category_key()`
  with the identical definition, so the app and the database cannot drift into
  disagreeing about which names are one category.
- `alignBudgets(budgets, names)` — re-keys the budget map onto the live category
  list. Values are **not** summed: two rows spelled differently are one plan
  recorded twice, and adding them would invent headroom the user does not have.

## Database schema

Five data tables plus `profiles` and `feedback`. Every one is RLS-scoped by
`auth.uid() = user_id` (or `= id` on `profiles`).

```
auth.users
   ├── profiles      (id PK/FK, currency)
   ├── categories    (name; unique per user, and unique on category_key(name))
   ├── budgets       (category text, amount numeric)   -- no FK to categories
   ├── transactions  (date, description, category text, amount signed numeric)
   ├── loans         (name, principal, date, notes, interest_amount,
   │                  duration_months)
   │      └── loan_events (loan_id FK, type, amount, date)
   │             type ∈ taken | repayment | interest | penalty
   └── feedback      (message, page, user_agent)  -- INSERT-ONLY, no read policy
```

Categories are **denormalised text** on `transactions` and `budgets`, with no
foreign key. Renaming a category will not move existing rows. `feedback` has no
select policy at all, so testers can send but nobody — including the sender —
can read it back through the app; read it in the Supabase Table Editor.

## Loan events are the model, not the loan row

A loan is not a mutable balance. It is an immutable append-only event log, and
every loan figure in the app is a fold over that log:

| Event | Raises what's owed? | Moves cash? |
| --- | --- | --- |
| `taken` | yes | in |
| `interest` | yes | no |
| `penalty` | yes | no |
| `repayment` | no (reduces) | out |

Recording a loan writes `taken` plus, if interest was entered, an `interest`
event on the same date — both in one round trip, so a failure cannot leave the
loan half-recorded. Recording a repayment optionally writes a `penalty`
alongside it; the penalty is a separate charge, not a slice of the repayment, so
`amount` stays the cash actually handed over.

This model is what makes the two bases (cash vs cost) derivable from the same
rows. See [calculations.md](calculations.md) — that distinction is the single
most important thing to understand before touching any figure in this app.

## Presentation layer

- **`theme.js`** is the single source of design truth: tokens injected as CSS
  custom properties on `<html>`, three font families, and `BREAKPOINT` (900px).
- **`chartTheme.js`** holds chart colours that were run through a palette
  validator for colour-blind separation and contrast against the `#141414`
  panel. Do not hand-tweak them. The UI accent `volt` (`#E8FF4D`) is
  deliberately *not* a series colour.
- **`primitives.jsx`** carries the repeated shapes. `AutoGrid` is the one to
  reach for: it uses `minmax(min(300px, 100%), 1fr)`, because plain
  `minmax(300px, 1fr)` keeps its floor when the container is narrower and pushes
  the whole page sideways.

### Responsive strategy

One switch, not many: `BREAKPOINT` in `theme.js`, read both by CSS media
queries there and by `useIsNarrow`. Below it the sidebar becomes a bottom tab
bar, grids collapse to one column, and the two wide tables (register, month
comparison) re-render as **stacked cards** rather than scrolling sideways.

Three things are easy to break by accident:

1. Grids must use `minmax(min(Xpx, 100%), 1fr)` — use `AutoGrid`.
2. Form controls must compute to **16px** on phones or iOS zooms the page on
   focus. Sizes are set inline, so the override in `theme.js` needs
   `!important`.
3. Chart boxes are **taller** on a phone, not shorter — the legend wraps to a
   second line and `ScrollX` clips whatever overflows.

## Testing architecture

`spec/fixtures/*.json` is the specification for the derived-data layer, held as
**data rather than code** so more than one implementation can be checked against
it. `scripts/analytics.test.js` runs it on `node --test` today; a planned Dart
port for Flutter apps would load the same files, dispatch the same function
names, and produce the same values.

`spec/harness.js` is the fixture engine: `{"$ref": "name"}` arguments,
`{"$date": "..."}` for `now` (built in **local** time, matching the rest of
`lib/`), and result paths like `rows.0.current` or `[category=Food].spent`.

A coverage guard fails the suite if any exported function of `analytics.js` has
no fixture case, unless it is named in `LOCALE_SENSITIVE` with a reason.
`comparisonVerdict` and `buildInsights` are the two exemptions — they compose
sentences with `toLocaleString`, which cannot be byte-matched across runtimes.

**Add a case to a fixture, not a test to the JS suite.** A fixture case covers
both languages; a JS test covers one.

## Build and deploy

`vite.config.js` splits `recharts` and `@supabase/supabase-js` into their own
chunks — both are heavy and change far less often than app code, so browsers
keep them cached across deploys.

Env vars (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) are **inlined at build
time**, not read at runtime. A build without them produces an app that only
renders the "Not configured" screen. `supabaseClient.js` turns missing vars into
a `configError` string rather than throwing, which is also why CI can build
without any secrets.

Branch pipeline and day-to-day commands: [operations.md](operations.md).
