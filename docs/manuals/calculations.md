# Calculations — every figure on every screen

## Overview

This is the reference for how each number in the app is computed, which rows it
was computed over, and which numbers may legitimately be compared with which.
Every function named here lives in [`src/lib/analytics.js`](../../src/lib/analytics.js)
unless stated otherwise, and every one of them is pure: plain arrays in, plain
data out.

Read [The two bases](#the-two-bases) first. Almost every "these two figures
disagree" question in this app is answered there.

---

## Conventions

**Sign.** `transactions.amount` is signed: positive is income, negative is an
expense. Nothing else encodes direction.

```js
sumIncome(tx)   = Σ  t.amount            for t.amount > 0
sumExpenses(tx) = Σ |t.amount|           for t.amount < 0   → positive number
net             = income − expenses
```

`sumExpenses` returns a **positive** number. Expenses are displayed as positives
everywhere except the register's amount column and its "Out" line.

**Month key.** A month is the string `YYYY-MM`. `inMonth(rows, key)` filters on
`date.slice(0, 7)`, so it is a pure string comparison — no timezone is involved
in deciding which month a row belongs to.

**Percentage change.**

```js
pctChange(curr, prev) = prev === 0 ? (curr === 0 ? 0 : null)
                                   : ((curr − prev) / prev) × 100
```

`null` means "no baseline to compare against" and renders as an em-dash. It is
never rendered as `+100%`, which would be a claim the data does not support.

**Category totals.** `byCategory(tx, names)` sums the absolute value of negative
rows into `{ category: amount }`. Passing `names` (the live category list) keys
each bucket by the canonical spelling, so a transaction filed under a
case-variant still lands in the bucket a caller can look up. Without `names`,
the first spelling seen wins.

---

## The two bases

A loan can be read two ways, and mixing them is exactly what makes figures stop
adding up. Every function in `analytics.js` commits to one.

| | `cashRows(...)` | `costRows(...)` |
| --- | --- | --- |
| Answers | what moved through the account | what the month cost me |
| Drawing a loan down | money **in** | nothing |
| Repaying principal | money **out** | nothing |
| Interest / penalty charged | nothing until paid | an **expense**, when charged |
| Built from | `taken` + `repayment` events | `interest` + `penalty` events |
| Used by | the register and its running balance | every "what did I spend" figure |

Both are correct; they answer different questions.

**Why principal appears on neither side of the cost basis.** Borrowing ₵500 and
handing ₵500 back is a round trip that left you no poorer. Counting either leg
as spending makes a month's total swing on *when you borrowed* rather than on
how you lived. What borrowing genuinely costs is the interest — so interest and
penalties are the only loan rows on the cost basis, dated when they were
charged.

Two synthetic category names carry these rows:

- `"Loan repayment"` — cash basis only
- `"Loan interest"` — cost basis, used for both interest and penalties

Neither is in the user's category list, so `alignBudgets` never gives them a
budget and they cannot trip an over-budget check (`plan[c] > 0` is false when
`plan[c]` is `undefined`). A user who creates a real category by one of those
names simply folds the two into one bucket; the total stays right.

**Income is untouched by `costRows`.** Only negative rows are appended, so
`sumIncome(costRows(...)) === sumIncome(transactions)` always. Drawing a loan
down is a liability, not earnings — it shows on the "Loans owed" line.

**Never add a figure from one basis to a figure from the other.**

---

## Overview screen

Rows: `spendRows = costRows(transactions, loanEvents, loans)` — **except** the
"Recent" list, which is cash (see below).

### Hero block

```
monthTx   = inMonth(spendRows, month)
income    = sumIncome(monthTx)
expenses  = sumExpenses(monthTx)
net       = income − expenses                          ← the giant numeral
savings % = income > 0 ? net / income × 100 : hidden
```

The Income and Expenses rows each carry a `Delta` computed as
`pctChange(current, previous)` against the same month-minus-one, on the same
basis. Comparing a month on one basis against a baseline on another reports a
phantom spike, which is why `prevTx` is sliced from `spendRows` and not from raw
transactions.

The Expenses delta is rendered with `invert`, so "up" is coloured bad and "down"
good. Income is not inverted.

### Loans owed

```
totalOutstanding = Σ over loans of max(0, loanOutstanding(loanEvents, loan.id))
loanOutstanding  = (taken + interest + penalty) − repayment
```

The `max(0, …)` clamp is deliberate: an overpaid loan reads as zero and does not
offset what is still owed on another loan.

### "Where it went"

`byCategory(monthTx, categories)`, sorted by amount descending, top 7 shown.
The bar width means **two different things** depending on the row:

```
budget > 0  →  pct = spent / budget   × 100     (progress against plan)
budget = 0  →  pct = spent / expenses × 100     (share of the month's spending)
```

A row only turns red when `budget > 0 && spent > budget`.

### 6-month flow chart

`trendSeries(spendRows, month, 6)` — for each of the six months ending at the
selected one:

```
{ month, Income: sumIncome(monthRows),
         Expenses: sumExpenses(monthRows),
         Net: Income − Expenses }
```

### Recent list — note the basis switch

`withBalance(transactions, loanEvents, loans)` filtered to the month, first 7
rows. This is the **cash** basis, because it is a preview of the register and
carries the register's running balance. So a loan repayment appears in "Recent"
but contributes nothing to the hero's Expenses figure directly above it, and an
interest charge does the reverse. That is intended, not a bug.

### Signals (`buildInsights`)

Cost basis. Emitted in this order, each one conditional:

| Signal | Condition | Formula |
| --- | --- | --- |
| Expenses up/down/flat | previous month has spending | `pctChange(expenses, prevExpenses)`; "flat" when `|change| < 0.5` |
| Savings rate | `income > 0` | `net / income × 100`; negative phrases as "spent X% more than you earned" |
| Biggest expense | any spending | `topCategory / expenses × 100` |
| Over budget in … | any category with `plan[c] > 0 && spent > plan[c]` | lists the names |
| On pace | month incomplete, `projected > 0`, `budgetTotal > 0` | `forecast(...)`, compared to `budgetTotal` |
| Loans outstanding | `owed > 0` | `totalOutstanding` |

If nothing qualifies, one neutral placeholder is returned so the panel is never
empty.

---

## Analytics screen

Rows: `spendRows = costRows(...)` for everything that answers "what did I
spend"; **raw `transactions`** for `budgetBurn` and `detectRecurring`. The split
is deliberate — a loan charge has no budget line to spend against, and a one-off
interest charge must not be learned as a monthly subscription.

### The headline (`monthComparison` + `comparisonVerdict`)

```
curr  = byCategory(inMonth(rows, currKey))
prev  = byCategory(inMonth(rows, prevKey))
names = union of both key sets            ← so a drop to zero stays visible

per row:  current, previous,
          delta = current − previous,
          pct   = pctChange(current, previous)

sort:     by current desc, then previous desc
totals:   currTotal, prevTotal, delta, pct = pctChange(currTotal, prevTotal)
biggestMover = the row with the largest |delta|
```

Verdict text:

| Case | Sentence |
| --- | --- |
| both totals zero | "Nothing logged in … or … yet." |
| `prevTotal === 0` | "First month with spending — no … baseline …" |
| `|pct| < 1` | "You spent about the same …" |
| otherwise | "You spent N% more/less in … than …" |

In the comparison table, bar widths are scaled against
`max(1, largest single value in either column)` so the two bars in a row are
directly comparable. A row counts as flat when `|delta| < 0.005`.

### Forecast tiles

**Spent so far** — `forecast(...).spent` = `sumExpenses(inMonth(spendRows, key))`.
The sub-line "includes loan interest, not principal" appears when the month has
any `interest` or `penalty` event.

**Projected total** — this is the most involved calculation in the app.

```
total   = daysInMonth(key)
elapsed = elapsedDays(key, now)      -- past month: total; future: 0;
                                     -- current: min(today's date, total)

elapsed === 0      → projected = 0,     basis "none"
elapsed >= total   → projected = spent, basis "actual", complete = true

otherwise:
  recurring       = detectRecurring(rows, now)
  recurringPaid   = Σ |amount| of this month's expenses whose normalised
                    description matches a detected recurring group
  recurringDue    = Σ typical amount of recurring groups NOT yet seen this month
  variable        = max(0, spent − recurringPaid)
  variableProject = variable / elapsed × total
  projected       = variableProject + recurringPaid + recurringDue
```

A naive burn rate (`spent / elapsed × total`) over-counts when a big fixed
charge has already landed and under-counts when one hasn't — rent paid on the
3rd makes the whole month look catastrophic. So only *variable* spend is
extrapolated; recurring charges are added at face value, already-paid ones at
their actual amount and still-due ones at their typical amount. The naive figure
is still returned as `naive` for comparison.

`basis` is `"recurring-adjusted"` when any recurring charge was detected,
`"burn-rate"` otherwise. The tile's sub-line shows `Day E of T · <basis>`.

**Budget** — `budgetTotal = Σ alignBudgets(budgets, categories)`.

```
overBudgetBy = budgetTotal > 0 ? projected − budgetTotal : null
```

Positive means over, negative means headroom. It is `null` — not `undefined` —
when there is no plan, and callers test against `null` to decide whether to
render a figure at all. A finished month says "Finished ₵X over" / "₵X under";
an incomplete one says "On pace for ₵X over" / "₵X of headroom".

**Committed monthly** — `Σ recurring[i].amount` over detected recurring charges,
computed on raw transactions.

### Spend over time + rolling averages

`trendSeries(spendRows, month, span)` where span is 3, 6 or 12 from the picker.

```
rollingAverages(rows, endKey):
  twelve = trendSeries(rows, endKey, 12).map(d => d.Expenses)
  avg3   = mean of the last 3 of those values
  avg6   = mean of the last 6
  avg12  = mean of all 12
```

Months with no data contribute a genuine `0` to the mean — they are not skipped.
A ledger with three months of history therefore reports a 12-month average
roughly a quarter of its 3-month one. The 6-month average is drawn as a dashed
reference line over the chart when it is greater than zero.

### Category trends

`categoryTrends(spendRows, month, span, 6)`:

1. Sum each category across all months in the window.
2. Take the top 6 by that total — the fixed order keeps the legend and the stack
   order stable across months.
3. Emit one row per month with a zero-filled value for each of those 6.

Categories outside the top 6 are **not** folded into an "Other" band; they are
simply absent from the chart, so the stack total can read lower than the month's
Expenses figure.

### Burn-down curve

```
burnCurve(spendRows, key, budgetTotal):
  for each day d of 1..total:
    actual = cumulative spend through day d,
             or null when d > elapsed        ← stops the line at today
    pace   = budgetTotal / total × d         ← straight line, or null if no plan
```

Note the asymmetry with the panel beside it: the curve is on the **cost basis
across all spending**, while "Pace by category" is on raw transactions and only
covers budgeted categories. The curve can therefore sit above the sum of the
bars. Both are correct for their own question.

### Pace by category (`budgetBurn`)

Raw transactions, budgeted categories only, sorted by `pctUsed` descending.

```
paceRatio = elapsed / total
spent     = byCategory(inMonth(transactions, key), Object.keys(budgets))[category]

expected     = budget × paceRatio          ← where spend should be today
projected    = paceRatio > 0 ? spent / paceRatio : 0
pctUsed      = spent / budget × 100
pctElapsed   = paceRatio × 100
over         = spent > budget
offPace      = spent > expected AND NOT over
projectedOver= projected > budget
```

Categories with a budget of zero are filtered out entirely. The white vertical
marker on each bar sits at `min(100, pctElapsed)` — that is the expected pace.
Colour: red when `over`, amber when `projectedOver`, otherwise green.

### Daily rhythm heatmap (`dailySpend`)

Cost basis. One cell per day of the month, plus leading blanks so the grid
aligns to weekday columns:

```
lead = (new Date(y, m-1, 1).getDay() + 6) % 7      ← shifts Sunday-first to Monday-first
max  = largest single day's total
busiest = [day, amount] of that day
```

Cell colour picks from a 5-step ramp:

```
idx = min(4, floor(amount / max × 5))
```

A cell's day number flips from chalk to near-black when
`amount / max > 0.55`, for contrast against the lighter end of the ramp. A cell
gets a red border when `dailyBudget > 0 && amount > dailyBudget`, where
`dailyBudget = budgetTotal / daysInMonth(month)`.

### Recurring charges (`detectRecurring`)

A pure heuristic over rows already loaded. Nothing is stored; it is recomputed
on every load.

```
normalise(desc) = lowercase, digits → space, non-letters → space,
                  runs of whitespace collapsed, trimmed
                  e.g. "UBER *TRIP 8821" → "uber trip"
```

Group every expense by that key, then keep a group only if **all three** hold:

| Test | Threshold |
| --- | --- |
| enough occurrences | `count >= 3` |
| mostly-monthly gaps | at least `ceil(gaps/2)` consecutive gaps fall in **25–35 days** |
| stable amount | `(max − min) / mean <= 0.15` |

For a surviving group:

```
amount     = mean of the absolute amounts     ← the "typical" figure
label      = the most recent description
category   = the most recent row's category
daysSince  = floor((now − lastDate) / 86 400 000)
dueSoon    = daysSince >= 25
```

Sorted by `amount` descending.

> **Known bug (documented in `spec/README.md`).** `gaps` are computed from
> `new Date(dateStr)`, which parses as **UTC**, while `daysSince` is measured
> against a `now` built in **local** time. East of Greenwich this shifts
> `daysSince` — and therefore `dueSoon` — by one day. The fixtures deliberately
> pin every other field and leave these two alone so the suite stays green
> wherever it runs. Worth fixing before the planned Dart port, since
> `DateTime.parse` has the same split and would reproduce the inconsistency
> rather than reveal it.

---

## Register screen

Cash basis throughout. This is the only screen where the running balance
appears, and the balance is cash by definition.

### Ordering and the running balance (`withBalance`)

```
byLedgerOrder: date, then createdAt, then id
```

The `id` fallback is what makes this a **total** order rather than a partial
one. A comparator that returns non-zero for equivalent rows breaks the contract
`Array#sort` is specified against, and the running balance is only readable if
the displayed order is exactly the reverse of the order the balance was
accumulated in.

Rows are therefore sorted **once** ascending, accumulated, then reversed — not
sorted twice. That is what guarantees each row's balance equals the row below it
plus this row's amount.

### Month totals (`registerMonth`)

```
rows      = this month's rows, newest first
oldest    = rows[rows.length − 1]
opening   = oldest ? oldest.balance − oldest.amount
                   : balance of the last row before this month, else 0

earned    = sumIncome(rows where kind !== "loan")
loanDrawn = Σ amount of loan rows with amount > 0
expenses  = sumExpenses(rows)              ← includes loan repayments

net       = earned + loanDrawn − expenses
closing   = opening + earned + loanDrawn − expenses
```

Deriving `opening` from the oldest row's own balance is what makes the column
reconcile *within* the month rather than silently depending on all history.

The identity `closing = opening + earned + loanDrawn − out` is exactly the
arithmetic the balance column beside it performs, and it is pinned as data in
`spec/fixtures/` rather than re-derived per view — it had previously drifted.

**Loan drawdown gets its own line** rather than being folded into "Earned". It
is money in, but it is not income.

**The all/expense/income filter does not change the totals.** Balances and
totals are computed over the whole month; the filter only narrows what is
listed. Filtering first would leave the balance column stepping over rows it
cannot show. When a filter is active the footer says so explicitly.

---

## Budgets screen

**Raw transactions only.** This screen answers "am I on plan", and a plan is
per-category.

```
plan  = alignBudgets(budgets, categories)
total = Σ plan[c]  for every c that is not "Income"
spend = byCategory(inMonth(transactions, month), categories)
spent = sumExpenses(inMonth(transactions, month))
```

Two deliberate asymmetries:

1. **`spent` counts every expense in the month**, including spend filed under a
   category that has since been deleted and therefore has no row on this screen.
   Leaving it out made "still unspent" claim money that was already gone.
2. **`spent` will read lower than the Overview's Expenses** whenever the month
   has loan interest or penalties. Those count as expenses on the cost basis,
   but a loan charge has no budget line to spend against — counting it here
   would report the plan as blown by money that was never planned. This is
   *spend against plan*, not everything the month cost.

Per row: `used / budget × 100` for the bar, red when `used > budget`, and a
caption of either "₵X over" or "₵X left". The summary panel does the same
against `spent` and `total`.

The "Income" category is excluded from the plan total because budgeting your own
income is not a thing; income rows are positive and never reach `sumExpenses`
anyway.

Budget edits are debounced by 500ms per category, so typing "1200" fires one
upsert rather than four.

---

## Loans screen

### Per-loan summary (`loanSummary`)

```
taken     = Σ amount of "taken" events
interest  = Σ amount of "interest" events
penalties = Σ amount of "penalty" events
repaid    = Σ amount of "repayment" events

charged     = taken + interest + penalties
outstanding = charged − repaid
paidOff     = outstanding <= 0
pct         = charged > 0 ? min(repaid, charged) / charged × 100 : 0
```

Progress is measured against the **total charged**, not against the principal —
a loan with interest is not 100% repaid when the principal is back.
`min(repaid, charged)` keeps an overpayment from drawing a bar past full.

### Term and due date

```
dueDate  = durationMonths > 0 ? addMonths(loan.date, durationMonths) : null
overdue  = !paidOff && dueDate !== null && dueDate < today
daysLeft = round((dueDate − today) / 86 400 000)      ← negative once overdue
```

`addMonths` clamps to the target month's last day, so 2026-01-31 + 1 month is
2026-02-28 rather than rolling into March.

### Month tiles

Computed from `inMonth(loanEvents, month)`, not from transactions:

```
Taken this month     = Σ "taken"
Repaid this month    = Σ "repayment"
Interest & penalties = Σ "interest" + Σ "penalty"
Total outstanding    = totalOutstanding(loans, loanEvents)   ← all time, clamped
```

Note "Total outstanding" is all-time and does not move with the month picker;
the other three do.

### Form preview

Before the loan is committed: `total = principal + interest`, and
`due = addMonths(date, months)` when a term was entered.

---

## Which figures may be compared

| These agree | Why |
| --- | --- |
| Overview Expenses ↔ Analytics "Spent so far" | both `sumExpenses` over `costRows` for the month |
| Overview Expenses ↔ Analytics comparison total | same rows, same slice |
| Overview "on pace" signal ↔ Analytics "Projected total" | `buildInsights` runs the same `forecast` over the same cost rows |
| Register "Closing" ↔ the balance on its newest row | same accumulation, same order |

| These will differ — by design | Why |
| --- | --- |
| Overview Expenses ↔ Budgets "Spent this month" | cost basis vs raw transactions; loan interest counts in the first, not the second |
| Overview Expenses ↔ Register "Out" | cost vs cash: the register counts repaid principal and ignores unpaid interest |
| Register "Earned" ↔ Overview Income | the register splits loan drawdown onto its own line; Overview never counts it as income at all |
| Analytics burn-down curve ↔ sum of "Pace by category" bars | all spend on the cost basis vs budgeted categories on raw transactions |
| Category-trends stack total ↔ month Expenses | the chart shows only the top 6 categories, with no "Other" band |
| Loans "Total outstanding" ↔ the month tiles beside it | outstanding is all-time; the other three are for the selected month |

---

## Changing any of this

1. The arithmetic belongs in `src/lib/analytics.js`. Keep it free of React and
   Supabase imports — that is what lets it be tested on bare `node`.
2. Add a case to `spec/fixtures/*.json`, not a test to the JS suite. A fixture
   covers both the Node runner and the planned Dart port; a JS test covers one.
   The coverage guard in `scripts/analytics.test.js` will fail the build if a
   new exported function has no fixture case.
3. Use `expectClose` for anything that divides (`pctUsed`, `projected`, `pace`)
   and `expect` for counts, sums, flags, names and ordering — a tolerance on
   those would hide a real divergence.
4. Run `npm test`. CI runs it as the first gate, before the build, because a
   failed assertion says *what* broke where a failed build only says that
   something did.
