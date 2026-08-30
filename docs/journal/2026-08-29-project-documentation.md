# Project documentation: architecture and calculation reference

**Date:** 2026-08-29

## Objective

Produce comprehensive documentation for Personal Ledger — specifically the
architecture, and how every figure on every screen is calculated. The
calculation logic had grown to the point where three different screens can show
three different "expenses" numbers for the same month, all correct, and nothing
outside the source comments explained why.

## What was done

Read the whole codebase (6,110 lines across `src/`, `spec/`, `scripts/`,
`migrations/`) and wrote three manuals plus this entry.

### `docs/manuals/architecture.md`

The structural picture: the browser → Supabase shape with no backend of our own,
and the three-layer cake that the project is actually organised around —
`useLedgerData` (all I/O) → `lib/analytics.js` (all arithmetic, pure) → views
(layout, ~no maths). Also covers the file map, the auth gate in `App.jsx`, the
data layer's three non-obvious behaviours (numeric-string casting, `profiles`
being deliberately excluded from the error check, race-tolerant seeding), the
module-level currency symbol, the category-name folding rules, the database
schema with RLS, and the fixture-based testing architecture.

The section worth flagging to anyone new: **loan events are the model, not the
loan row.** A loan is an append-only event log of `taken` / `interest` /
`penalty` / `repayment`, and every loan figure is a fold over it. That is what
makes the two bases derivable from the same rows.

### `docs/manuals/calculations.md`

The main deliverable. Every figure on every screen, with the formula, the rows
it was computed over, and the reasoning where it isn't obvious.

Structured as: conventions (sign, month keys, `pctChange`'s `null`) → the two
bases → one section per screen (Overview, Analytics, Register, Budgets, Loans) →
a cross-screen reconciliation table.

Decisions about what to emphasise:

- **The two bases lead.** `cashRows` vs `costRows` is the thing that explains
  most apparent contradictions in the app, so it sits above the per-screen
  sections and every screen section names which basis it is on.
- **The reconciliation table at the end is the payoff.** Six pairs of figures
  that *will* differ, each with a one-line reason — Overview vs Budgets, Overview
  vs Register, burn-down curve vs pace bars, category-trends stack vs month
  expenses, and so on. This is the table someone reaches for when they think
  they have found a bug.
- **`forecast` gets the most space**, since it is the least guessable: variable
  spend is extrapolated, recurring charges are added at face value (paid ones at
  actual, due ones at typical), and the naive burn rate is kept only for
  comparison.
- Two subtleties I nearly missed and made a point of documenting: the Overview's
  "Recent" panel is on the **cash** basis while the hero block directly above it
  is on **cost**; and the Analytics burn-down curve is cost-basis-all-spend while
  the "Pace by category" panel beside it is raw-transactions-budgeted-only, so
  the curve can legitimately sit above the sum of the bars.
- The `detectRecurring` UTC-vs-local bug already documented in `spec/README.md`
  is carried forward as a callout rather than left in one place.

### `docs/manuals/operations.md`

Local setup, the test command and why coverage goes in fixtures, the by-hand
migration procedure and its four rules, the branch pipeline, and a
troubleshooting list that folds in the SQL-editor failure modes from
`006_category_case.sql`'s header comments.

## What's NOT included (and why)

- **No per-component prop documentation.** `primitives.jsx` is 314 lines of
  small, self-describing components; a prop table would be maintenance cost with
  no reader.
- **No duplication of `WORKFLOW.md`.** The operations manual summarises the
  pipeline and links out rather than restating it.
- **Nothing was changed in `src/`.** This is documentation-only. The two things
  worth fixing that surfaced along the way are listed below rather than acted on.

## Findings worth acting on

1. **`WORKFLOW.md` is stale.** Its closing section states "there are no tests in
   this project" and that a green build "does not catch a wrong number in
   `src/lib/analytics.js`". Both were true when written; `scripts/analytics.test.js`
   and `spec/fixtures/` now exist, `promote.yml` runs `npm test` as its first
   gate, and 135 assertions pass. The paragraph should be rewritten.
2. **`upgrade.yml` does not run `npm test`** — only `npm run build`. That is the
   path a held migration PR takes to production, so the one class of change most
   likely to move the numbers is also the one that skips the numeric gate. Either
   add the test step or keep running it by hand before merging a held PR (the
   operations manual says to do the latter for now).

## Outcome

Four files under `docs/`: three manuals and this entry. `npm test` re-run during
the work as a check on the documented behaviour — 135 tests, 4 suites, all
passing.

## 2026-08-29 — Follow-up: user-facing guide

The three manuals above are all written for someone working *on* the app. Added
[`docs/manuals/user-guide.md`](../manuals/user-guide.md) for someone using it.

Re-read `AuthView.jsx`, `Shell.jsx` and the reset screens first, so the
walkthrough matches the actual labels and copy people see — "Resend
confirmation", the "— empty" month flag, "Sign out →" versus the phone's "OUT"
button — rather than a plausible description of them.

Structure: getting in → the three pieces of chrome that apply everywhere (month
picker, nav, feedback) → a first-ten-minutes loop → one section per screen →
troubleshooting.

Two decisions worth recording:

- **Register comes before Overview**, reversing the app's own nav order. The
  Overview is the screen you look at most, but it is meaningless until entries
  exist, and a guide that opens on a screen full of zeroes teaches nothing.
- **The basis split gets a plain-language section of its own**
  ("Why don't these numbers match?"), with the same reconciliation table as
  `calculations.md` but reasons written for someone who does not care about the
  implementation. This is the thing most likely to be reported as a bug, so it
  is worth saying twice at two levels of detail. The two tables must be kept in
  step if the bases ever change.

Also documented the constraints a user hits and cannot work around, which were
not written down anywhere: no editing of entries, no editing or deleting of
loans and repayments at all, no undo, and no rename or delete for categories.
Consistent transaction descriptions got called out explicitly, since recurring
detection matches on them and nothing in the UI tells you that.

No source changes. The two findings from the earlier session — stale
`WORKFLOW.md` claim about tests, and `upgrade.yml` skipping `npm test` — are
still open.

## 2026-08-29 — Follow-up: screenshots, and an unapplied-migration finding

Added nine screenshots to the user guide (`docs/manuals/images/`, 2.6 MB): the
sign-in screen, all six views at 1440×900, and Overview and Register at 390×844
to show the phone layout.

### How they were produced

A demo account was seeded against the live Supabase project (the user chose this
over synthetic fixture data) and driven with Playwright against `npm run dev`.
The data was designed to exercise every panel rather than to look plausible: six
months of history, four charges repeating monthly within 15% so
`detectRecurring` finds them, Food and Shopping pushed over budget, Housing left
on pace to go over, and Shopping given no July baseline so the comparison table
renders the `pctChange` → `null` em-dash case.

Two capture problems, both worth knowing if these are ever regenerated:

1. **Charts came out half-drawn.** Playwright's `fullPage` resizes the viewport
   *inside* the screenshot call; `ResponsiveContainer` sees the resize and
   Recharts restarts its draw animation, so the lines are always caught
   part-way. Waiting longer beforehand cannot help. The fix is to resize the
   viewport to the document height first, wait for the animation, then take an
   ordinary viewport screenshot with `fullPage` off.
2. **The real email was in every sidebar.** Now replaced with
   `you@example.com` by walking the text nodes before each shot. The script
   reports how many nodes it masked per screenshot, so a silent failure to mask
   is visible in the log rather than only in the PNG.

The first attempt at both fixes appeared to succeed but changed nothing —
worth remembering that a Python `str.replace` that matches nothing returns the
string unchanged and reports no error.

`playwright` was installed to drive this and then reverted out of
`package.json` / `package-lock.json`; a browser-automation dependency does not
belong in the footprint of a project with five runtime dependencies. The seed
and capture scripts were kept in `node_modules/.demo/` (gitignored, so the
`git add -A` in the ship aliases can never sweep them into a commit).

### The finding: production is three migrations behind

Seeding failed on `loans.duration_months`, which turned out not to be a stale
PostgREST cache but a genuinely absent column. Probing every table showed that
**only migrations 001 and 002 have been applied** to the Supabase project in
`.env`:

| Missing | Migration | Consequence in the running app |
| --- | --- | --- |
| `feedback` table | 003 | The Feedback button fails for every user |
| `loans.interest_amount`, `loans.duration_months`, `interest`/`penalty` event types | 004 | **Recording any loan fails** — `addLoan` always writes both columns |
| `profiles` table | 007 | Currency setting silently falls back to the default |

The `profiles` case is the one that degrades gracefully, and deliberately so —
`useLedgerData` excludes it from its error check precisely because migrations
are applied by hand and the code can reach a database where 007 has not run.
That design decision is doing its job here.

004 is the serious one: the Loans view offers Interest and Term fields that
cannot be saved. It is also why the Loans screenshot shows no interest, term,
due date or penalty, and why its "Interest & penalties" tile reads ₵0.00 — the
demo loan had to be seeded with the 001 column set and the original two event
types.

Applying 003–007 in the Supabase SQL editor would fix the app and let the Loans
and Analytics screenshots be retaken with the full feature set. Not done here:
running migrations is a deliberate manual act by design, and it is the account
owner's call.

### Left behind

A demo account (`fbaidenn+ledgerdemo@gmail.com`, user id
`eac84993-3049-4eef-b161-c571b460da33`) with 70 transactions, 6 budgets, 9
categories, 1 loan and 2 loan events, in the live project. Delete it from
**Authentication → Users** when the screenshots no longer need regenerating —
the cascade on `auth.users` removes every row with it.

## 2026-08-29 — Follow-up: plainer language, and a PDF copy

Two changes to the user guide, on request.

### The prose was rewritten

The guide read like it was machine written, and the clearest symptom was 49 em
dashes in 400 lines. Those are gone, along with the habits that came with them:
"deliberately", "by design", "that's on purpose", "worth knowing", and the
pattern of stating a fact and then immediately restating it in a balanced
clause. Sentences that leant on a dash were restructured rather than having the
dash swapped for a comma, since a comma in the same place usually reads worse.

Hyphens now appear only inside filenames and anchor links. Compound adjectives
were reworded instead of hyphenated ("month over month comparison" became
"comparison against last month", "6-month flow" is left alone only where it
quotes a label printed on screen).

The markdown source was rewritten rather than only the PDF. Keeping a plain
spoken PDF next to a stiffer markdown original would have meant maintaining two
voices of the same document, and they would drift.

Content is unchanged. Every figure, threshold and caveat says what it said
before.

### The PDF

`docs/manuals/user-guide.pdf`, 15 pages, 2.4 MB, all nine screenshots included.

Built the same way the existing `README.pdf` and `WORKFLOW.pdf` were, which the
PDF metadata shows was headless Chrome: pandoc renders the markdown to a single
self contained HTML file with the images inlined as data URIs, then Chrome
prints it. No new project dependency, since pandoc and Chrome were both already
on the machine.

Four things needed fixing before the images sat properly on the page:

1. **Tall screenshots overflowed.** The Analytics capture is 2880×4858. Capping
   height as well as width (`max-height: 205mm`) is what keeps it on one page
   rather than being clipped at the page boundary.
2. **The title appeared twice.** Pandoc's standalone template prints the
   metadata title as a heading, on top of the H1 already in the markdown. Hidden
   with CSS so the PDF keeps a proper document title in its metadata.
3. **The phone screenshots came out unreadable.** They sit in a two column
   table, so the cell width already limits them, and an additional height cap
   was shrinking them well below that. Removing the conflict made them legible;
   the final value (158mm) is the largest that still leaves the table on page
   one instead of pushing it over and leaving a half empty page behind it.
4. **Alt text was rendering as body text.** Pandoc turns an image with alt text
   into a figure with a caption, so the captions are now styled as captions and
   suppressed inside the phone comparison table, where the column headers
   already say which is which.

Every page was rasterised and checked rather than trusted on file size alone.

To rebuild after editing the markdown, run pandoc with `--embed-resources` and
print the result with `google-chrome --headless --print-to-pdf`. The stylesheet
was scratch and is not kept in the repo; it would need writing again, or the
guide can simply be read as markdown, which is the primary form.

## 2026-08-29 — Follow-up: serving the guide at /user-guide

Set up, but not published. Nothing is public until the change is pushed.

### What was added

- `public/user-guide.pdf`. Vite copies `public/` into `dist/` verbatim at build
  time, so the PDF ships with the static site. Confirmed with `npm run build`.
- `vercel.json`, which the repository did not have before. A rewrite maps
  `/user-guide` to `/user-guide.pdf`, and a header block sets
  `Content-Disposition: inline` so browsers open it rather than downloading it,
  plus a CDN cache of an hour with a day of stale-while-revalidate.

The PDF was moved out of `docs/manuals/` rather than copied. Two committed
copies of a 2.4 MB binary would each be stored in full in git history on every
regeneration, and the pair would drift.

### What is and is not verified

`npm run build` puts the file in `dist/`, and `npm run preview` serves
`/user-guide.pdf` as `application/pdf` at the right length. The rewrite itself
is applied by Vercel and cannot be exercised locally without `vercel dev`, so
`/user-guide` is unproven until it is deployed. Note that `npm run preview`
answers 200 on `/user-guide` regardless, because Vite falls back to
`index.html` for unknown paths, so that response says nothing about whether the
rewrite works.

Adding `vercel.json` does not disturb the app. It has no client side router, so
no catch all rewrite is involved and the default static serving of `index.html`
is unchanged.

### Worth settling before this goes public

The guide documents the Interest, Term and penalty fields on the Loans screen.
Migration 004 has not been applied to the live database, so those fields cannot
currently be saved and recording any loan fails. Publishing the guide as it
stands advertises a feature that is broken in production, and the Loans
screenshot in it shows the pre-004 state with an empty "Interest and penalties"
tile. Applying 003 to 007 first, then retaking that screenshot, would avoid
shipping a public document that contradicts the running app.

## 2026-08-30 — Follow-up: /user-guide is now a themed HTML page

The PDF was serving at `/user-guide`, and a 2880px wide print document is a
poor thing to hand a phone. Replaced it with an HTML page carrying the ledger's
own theme. The PDF stays available at `/user-guide.pdf` and is linked from the
page footer.

### Shape of it

`scripts/build-user-guide.mjs` renders `docs/manuals/user-guide.md` into
`public/user-guide.html`. The markdown stays the single source of truth, so the
page cannot drift from the document the repository keeps.

The page is plain HTML rather than a route in the React app. It is read by
people who are not signed in, usually on a phone, and pulling an 850 kB bundle
to show static prose would be the wrong trade. The app has no router either, so
a route would have meant adding one for a single static page.

Design tokens are copied from `src/theme.js` into the script rather than
imported: the script runs on bare node with no bundler, and theme.js is a module
of JS objects meant for React. Ten values, kept in step by hand, noted in a
comment at both ends.

It is **not** wired into `npm run build`. Vercel's build image has no pandoc, so
a prebuild hook would fail every production deploy. The generated HTML is
committed instead, and the build just copies it.

### Images

The screenshots were re-encoded to WebP for the web: 2.6 MB of PNG became
572 kB, and every one below the fold is lazy loaded, so a phone downloads only
what it scrolls to. The PNGs stay in `docs/manuals/images/` for GitHub and the
PDF.

The two phone captures needed more than re-encoding. They are full page scroll
captures, 1170×5730 and 1170×6702, so an aspect ratio near 1:4.9. Constrained to
fit a phone screen they rendered 121px and 103px wide, which is unusable. They
are now cropped to a single screen (1170×2532, the viewport they were taken at),
which reads as a phone rather than as a ribbon. The full length versions are
kept as `-full.webp` and are what the tap to zoom link opens.

### Mobile decisions

- **Tables stack into labelled cards below 560px** rather than scrolling
  sideways. That is the same trade the app makes on its register and comparison
  tables, so the guide behaves like the thing it documents. Each cell carries a
  `data-label` written by the generator, so a stacked cell still says which
  column it came from. Above the breakpoint they are ordinary tables.
- **Body text is 16px and every tap target is at least 44px**, which is the
  app's own rule: anything smaller and iOS zooms the page when a control takes
  focus.
- Contents is a collapsible list built from the H2s, so it cannot fall out of
  step with the document. It closes itself after a jump, or a phone is left
  looking at the menu rather than at the section.
- Headings carry `scroll-margin-top` so the sticky bar does not cover whatever
  you just jumped to.

Checked at 320, 360, 390, 430, 560, 768, 1024 and 1440px: no horizontal
overflow at any width, rows stack below the breakpoint and are table rows above,
smallest tap target 44px, all nine images resolving.

### Still open

The database is unchanged, so migrations 003, 004 and 007 remain unapplied and
the guide still documents loan fields that cannot be saved. Publishing this page
does not make that better or worse, but it is the same stale content in a nicer
wrapper.
