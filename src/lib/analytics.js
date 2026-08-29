// Pure derived-data functions. No React, no Supabase — everything here takes
// plain arrays and returns plain data, so it can be reasoned about (and tested)
// in isolation and reused by both the Overview strip and the Analytics view.

// Extensions are explicit so plain `node` can import this module too — Vite
// resolves either spelling, but Node's ESM loader does no extension guessing,
// and the tests in scripts/ run on bare node with no bundler.
import { monthKey, shiftMonth, daysInMonth, elapsedDays, monthLabel, fmtMoney, addMonths, todayISO } from "./format.js";
import { categoryKey, alignBudgets } from "./categories.js";

/* ------------------------------------------------------------------ *
 * Basic slicing
 * ------------------------------------------------------------------ */

export const inMonth = (rows, key) => rows.filter((r) => monthKey(r.date) === key);

export const inRange = (rows, from, to) =>
  rows.filter((r) => r.date >= from && r.date <= to);

export const sumIncome = (tx) =>
  tx.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);

export const sumExpenses = (tx) =>
  tx.filter((t) => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);

/**
 * Percentage change, guarding division by zero.
 * Returns null when there's no prior baseline to compare against — callers
 * render "—" rather than a misleading "+100%".
 */
export const pctChange = (curr, prev) => {
  if (prev === 0) return curr === 0 ? 0 : null;
  return ((curr - prev) / prev) * 100;
};

/**
 * Expense totals keyed by category (positive numbers).
 *
 * Transactions carry the category name as text, so the same category can arrive
 * under several spellings. Variants are summed into one bucket; pass `names`
 * (the live category list) to have that bucket keyed by the canonical spelling,
 * so callers can look spend up by the name they already hold. Without `names`,
 * the first spelling seen wins — enough to keep one thing from drawing two
 * slices in a breakdown.
 */
export const byCategory = (tx, names = []) => {
  const label = new Map();
  for (const name of names) label.set(categoryKey(name), name);

  const map = {};
  tx.filter((t) => t.amount < 0).forEach((t) => {
    const key = categoryKey(t.category);
    let name = label.get(key);
    if (name === undefined) {
      name = t.category;
      label.set(key, name);
    }
    map[name] = (map[name] || 0) + Math.abs(t.amount);
  });
  return map;
};

/* ------------------------------------------------------------------ *
 * Month-over-month comparison — the headline feature
 * ------------------------------------------------------------------ */

/**
 * Per-category breakdown of this month vs last, sorted by current spend.
 * Includes categories present in either month so drops to zero stay visible.
 */
export function monthComparison(transactions, currKey, prevKey) {
  const curr = byCategory(inMonth(transactions, currKey));
  const prev = byCategory(inMonth(transactions, prevKey));

  const names = Array.from(new Set([...Object.keys(curr), ...Object.keys(prev)]));

  const rows = names
    .map((name) => {
      const c = curr[name] || 0;
      const p = prev[name] || 0;
      return { category: name, current: c, previous: p, delta: c - p, pct: pctChange(c, p) };
    })
    .sort((a, b) => b.current - a.current || b.previous - a.previous);

  const currTotal = Object.values(curr).reduce((s, v) => s + v, 0);
  const prevTotal = Object.values(prev).reduce((s, v) => s + v, 0);

  return {
    rows,
    currTotal,
    prevTotal,
    delta: currTotal - prevTotal,
    pct: pctChange(currTotal, prevTotal),
    // Largest single mover, for the headline verdict.
    biggestMover: rows
      .filter((r) => r.previous > 0 || r.current > 0)
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))[0] || null,
  };
}

/** One-sentence verdict for the top of the Analytics view. */
export function comparisonVerdict(cmp, currKey, prevKey) {
  if (cmp.prevTotal === 0 && cmp.currTotal === 0) {
    return `Nothing logged in ${monthLabel(currKey)} or ${monthLabel(prevKey)} yet.`;
  }
  if (cmp.prevTotal === 0) {
    return `First month with spending — no ${monthLabel(prevKey)} baseline to compare against.`;
  }
  const dir = cmp.delta > 0 ? "more" : "less";
  const pct = Math.abs(cmp.pct ?? 0).toFixed(0);
  if (Math.abs(cmp.pct ?? 0) < 1) {
    return `You spent about the same in ${monthLabel(currKey)} as ${monthLabel(prevKey)}.`;
  }
  return `You spent ${pct}% ${dir} in ${monthLabel(currKey)} than ${monthLabel(prevKey)}.`;
}

/* ------------------------------------------------------------------ *
 * Trends over time
 * ------------------------------------------------------------------ */

/** Income / expenses / net for the N months ending at endKey (inclusive). */
export function trendSeries(transactions, endKey, months = 6) {
  const keys = [];
  for (let i = months - 1; i >= 0; i--) keys.push(shiftMonth(endKey, -i));
  return keys.map((k) => {
    const tx = inMonth(transactions, k);
    const inc = sumIncome(tx);
    const exp = sumExpenses(tx);
    return { key: k, month: k.slice(5), Income: inc, Expenses: exp, Net: inc - exp };
  });
}

/**
 * Per-category spend across the N months ending at endKey.
 * Returns { data, categories } where data is chart-ready rows and categories
 * is ordered by total spend so the legend and stack order stay stable.
 */
export function categoryTrends(transactions, endKey, months = 6, limit = 6) {
  const keys = [];
  for (let i = months - 1; i >= 0; i--) keys.push(shiftMonth(endKey, -i));

  const totals = {};
  keys.forEach((k) => {
    const cats = byCategory(inMonth(transactions, k));
    Object.entries(cats).forEach(([c, v]) => (totals[c] = (totals[c] || 0) + v));
  });

  const categories = Object.entries(totals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([c]) => c);

  const data = keys.map((k) => {
    const cats = byCategory(inMonth(transactions, k));
    const row = { key: k, month: k.slice(5) };
    categories.forEach((c) => (row[c] = cats[c] || 0));
    return row;
  });

  return { data, categories };
}

/** Mean of the last `window` values of a numeric series. */
export const rollingAverage = (values, window) => {
  const slice = values.slice(-window);
  if (slice.length === 0) return 0;
  return slice.reduce((s, v) => s + v, 0) / slice.length;
};

/** 3 / 6 / 12-month average expense, for reference lines. */
export function rollingAverages(transactions, endKey) {
  const twelve = trendSeries(transactions, endKey, 12).map((d) => d.Expenses);
  return {
    avg3: rollingAverage(twelve, 3),
    avg6: rollingAverage(twelve, 6),
    avg12: rollingAverage(twelve, 12),
  };
}

/* ------------------------------------------------------------------ *
 * Daily heatmap
 * ------------------------------------------------------------------ */

/**
 * One entry per day of the month, padded with leading blanks so the grid
 * aligns to weekday columns (Monday-first).
 */
export function dailySpend(transactions, key) {
  const total = daysInMonth(key);
  const spend = {};
  inMonth(transactions, key)
    .filter((t) => t.amount < 0)
    .forEach((t) => {
      const d = Number(t.date.slice(8, 10));
      spend[d] = (spend[d] || 0) + Math.abs(t.amount);
    });

  const [y, m] = key.split("-").map(Number);
  // getDay(): 0=Sun. Shift so Monday=0.
  const lead = (new Date(y, m - 1, 1).getDay() + 6) % 7;

  const days = [];
  for (let i = 0; i < lead; i++) days.push(null);
  for (let d = 1; d <= total; d++) {
    days.push({
      day: d,
      date: `${key}-${String(d).padStart(2, "0")}`,
      amount: spend[d] || 0,
    });
  }

  const amounts = Object.values(spend);
  return {
    days,
    max: amounts.length ? Math.max(...amounts) : 0,
    busiest: amounts.length
      ? Object.entries(spend).sort((a, b) => b[1] - a[1])[0]
      : null,
  };
}

/* ------------------------------------------------------------------ *
 * Budget burn-down
 * ------------------------------------------------------------------ */

/**
 * For each budgeted category: spend so far, the linear pace it *should* be at
 * by today, and whether it's tracking over. Answers "is this sustainable",
 * not just "is it already over".
 */
export function budgetBurn(transactions, budgets, key, now = new Date()) {
  const total = daysInMonth(key);
  const elapsed = elapsedDays(key, now);
  const paceRatio = total > 0 ? elapsed / total : 0;

  // Key spend by the spelling the budgets use, so a transaction filed under a
  // case-variant of the name still counts against its budget.
  const spend = byCategory(inMonth(transactions, key), Object.keys(budgets));

  return Object.entries(budgets)
    .filter(([, amount]) => amount > 0)
    .map(([category, budget]) => {
      const spent = spend[category] || 0;
      const expected = budget * paceRatio;
      const projected = paceRatio > 0 ? spent / paceRatio : 0;
      return {
        category,
        budget,
        spent,
        expected,
        projected,
        pctUsed: budget > 0 ? (spent / budget) * 100 : 0,
        pctElapsed: paceRatio * 100,
        over: spent > budget,
        offPace: spent > expected && !(spent > budget),
        projectedOver: projected > budget,
      };
    })
    .sort((a, b) => b.pctUsed - a.pctUsed);
}

/** Cumulative actual spend vs the straight-line budget pace, for a chart. */
export function burnCurve(transactions, key, budgetTotal, now = new Date()) {
  const total = daysInMonth(key);
  const elapsed = elapsedDays(key, now);
  const daily = {};
  inMonth(transactions, key)
    .filter((t) => t.amount < 0)
    .forEach((t) => {
      const d = Number(t.date.slice(8, 10));
      daily[d] = (daily[d] || 0) + Math.abs(t.amount);
    });

  let cum = 0;
  const out = [];
  for (let d = 1; d <= total; d++) {
    cum += daily[d] || 0;
    out.push({
      day: d,
      // Stop the actual line at today so it doesn't flatline across the future.
      actual: elapsed === 0 || d <= elapsed ? cum : null,
      pace: budgetTotal > 0 ? (budgetTotal / total) * d : null,
    });
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Recurring-expense detection
 * ------------------------------------------------------------------ */

/** Strip digits, punctuation and case so "UBER *TRIP 8821" ≈ "uber trip". */
const normalise = (desc) =>
  desc
    .toLowerCase()
    .replace(/[0-9]+/g, " ")
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Flags a description group as recurring when it has >= MIN_HITS occurrences,
 * mostly-monthly gaps, and amounts stable within AMOUNT_TOLERANCE.
 *
 * Pure heuristic over already-loaded rows — no schema change, no persistence.
 */
export function detectRecurring(transactions, now = new Date()) {
  const MIN_HITS = 3;
  const MIN_GAP = 25;
  const MAX_GAP = 35;
  const AMOUNT_TOLERANCE = 0.15;

  const groups = {};
  transactions
    .filter((t) => t.amount < 0)
    .forEach((t) => {
      const k = normalise(t.description);
      if (!k) return;
      (groups[k] = groups[k] || []).push(t);
    });

  const out = [];

  Object.entries(groups).forEach(([k, rows]) => {
    if (rows.length < MIN_HITS) return;

    const sorted = [...rows].sort((a, b) => (a.date < b.date ? -1 : 1));

    // Gaps between consecutive occurrences, in days.
    const gaps = [];
    for (let i = 1; i < sorted.length; i++) {
      const a = new Date(sorted[i - 1].date);
      const b = new Date(sorted[i].date);
      gaps.push((b - a) / 86_400_000);
    }
    const monthlyGaps = gaps.filter((g) => g >= MIN_GAP && g <= MAX_GAP);
    // Majority of intervals must look monthly.
    if (monthlyGaps.length < Math.ceil(gaps.length / 2)) return;

    const amounts = sorted.map((t) => Math.abs(t.amount));
    const mean = amounts.reduce((s, v) => s + v, 0) / amounts.length;
    if (mean === 0) return;
    const spread = Math.max(...amounts) - Math.min(...amounts);
    if (spread / mean > AMOUNT_TOLERANCE) return;

    const last = sorted[sorted.length - 1];
    const daysSince = Math.floor((now - new Date(last.date)) / 86_400_000);

    out.push({
      key: k,
      label: last.description,
      category: last.category,
      amount: mean,
      occurrences: sorted.length,
      lastDate: last.date,
      lastAmount: Math.abs(last.amount),
      // Roughly monthly, so it's due again once ~a month has passed.
      dueSoon: daysSince >= MIN_GAP,
      daysSince,
    });
  });

  return out.sort((a, b) => b.amount - a.amount);
}

/* ------------------------------------------------------------------ *
 * End-of-month forecast
 * ------------------------------------------------------------------ */

/**
 * Projects total spend for the month.
 *
 * Base is a simple burn-rate extrapolation (spendToDate / dayOfMonth * days).
 * That over-counts when a big fixed charge has already landed and under-counts
 * when one hasn't, so we refine: extrapolate only the *non-recurring* spend,
 * then add back recurring charges — those already paid at their actual amount,
 * those still due at their typical amount.
 */
export function forecast(transactions, key, budgets = {}, now = new Date()) {
  const total = daysInMonth(key);
  const elapsed = elapsedDays(key, now);
  const monthTx = inMonth(transactions, key);
  const spent = sumExpenses(monthTx);

  const budgetTotal = Object.values(budgets).reduce((s, v) => s + (v || 0), 0);
  // Positive means over, negative means headroom. `null` — not `undefined` —
  // when there is no plan to measure against: callers test it against null to
  // decide whether to render a figure at all, and every return below has to
  // carry it, or a finished month reads back as NaN of headroom.
  const against = (projection) => (budgetTotal > 0 ? projection - budgetTotal : null);

  // A past or not-yet-started month needs no projection.
  if (elapsed === 0) {
    return { spent: 0, projected: 0, budgetTotal, overBudgetBy: against(0), complete: false, elapsed, total, basis: "none" };
  }
  if (elapsed >= total) {
    return { spent, projected: spent, budgetTotal, overBudgetBy: against(spent), complete: true, elapsed, total, basis: "actual" };
  }

  const recurring = detectRecurring(transactions, now);
  const paidKeys = new Set(
    monthTx.filter((t) => t.amount < 0).map((t) => normalise(t.description))
  );

  const recurringPaid = monthTx
    .filter((t) => t.amount < 0 && recurring.some((r) => r.key === normalise(t.description)))
    .reduce((s, t) => s + Math.abs(t.amount), 0);

  const recurringDue = recurring
    .filter((r) => !paidKeys.has(r.key))
    .reduce((s, r) => s + r.amount, 0);

  const variable = Math.max(0, spent - recurringPaid);
  const variableProjected = (variable / elapsed) * total;

  const projected = variableProjected + recurringPaid + recurringDue;

  return {
    spent,
    projected,
    // Naive burn-rate, kept for comparison/debugging.
    naive: (spent / elapsed) * total,
    recurringPaid,
    recurringDue,
    budgetTotal,
    overBudgetBy: against(projected),
    complete: false,
    elapsed,
    total,
    basis: recurring.length > 0 ? "recurring-adjusted" : "burn-rate",
  };
}

/* ------------------------------------------------------------------ *
 * Loans + register (moved from Ledger.jsx, behaviour unchanged)
 * ------------------------------------------------------------------ */

/** Event types that raise what's owed, as opposed to paying it down. */
export const CHARGE_TYPES = ["taken", "interest", "penalty"];

/** Sum of one loan's events of a given type. */
export const loanTotal = (loanEvents, loanId, type) =>
  loanEvents
    .filter((e) => e.loanId === loanId && e.type === type)
    .reduce((s, e) => s + e.amount, 0);

/**
 * What's still owed: every charge against the loan — principal drawn down,
 * agreed interest, and any penalties charged since — less what's been repaid.
 */
export const loanOutstanding = (loanEvents, loanId) => {
  const charged = CHARGE_TYPES.reduce((s, t) => s + loanTotal(loanEvents, loanId, t), 0);
  return charged - loanTotal(loanEvents, loanId, "repayment");
};

export const totalOutstanding = (loans, loanEvents) =>
  loans.reduce((s, l) => s + Math.max(0, loanOutstanding(loanEvents, l.id)), 0);

/** Due date implied by the loan's term, or null for an open-ended loan. */
export const loanDueDate = (loan) =>
  loan.durationMonths > 0 ? addMonths(loan.date, loan.durationMonths) : null;

/**
 * Everything the Loans view needs about one loan in a single pass: the pieces
 * of what's owed, repayment progress against the *total* charged (not just the
 * principal), and where it stands against its term.
 */
export function loanSummary(loan, loanEvents, today = todayISO()) {
  const taken = loanTotal(loanEvents, loan.id, "taken");
  const interest = loanTotal(loanEvents, loan.id, "interest");
  const penalties = loanTotal(loanEvents, loan.id, "penalty");
  const repaid = loanTotal(loanEvents, loan.id, "repayment");

  const charged = taken + interest + penalties;
  const outstanding = charged - repaid;
  const paidOff = outstanding <= 0;
  const dueDate = loanDueDate(loan);

  return {
    taken,
    interest,
    penalties,
    repaid,
    charged,
    outstanding,
    paidOff,
    dueDate,
    pct: charged > 0 ? (Math.min(repaid, charged) / charged) * 100 : 0,
    overdue: !paidOff && dueDate !== null && dueDate < today,
    daysLeft: dueDate === null ? null : Math.round((new Date(dueDate) - new Date(today)) / 86_400_000),
  };
}

/* ------------------------------------------------------------------ *
 * The two bases
 *
 * A loan can be read two ways, and mixing them is what makes figures stop
 * adding up. Each of the functions below commits to one:
 *
 *   cash — what moved through the account. Drawing a loan down is money in,
 *          repaying it is money out. Interest that hasn't been paid yet is
 *          nothing at all. This is the register's basis: the running balance
 *          is cash by definition.
 *
 *   cost — what it actually cost you. Repaying principal cancels a debt you
 *          already banked, so it isn't spending; the round trip nets to zero.
 *          Interest and penalties are the real cost, counted when charged.
 *          This is the basis for every "what did I spend" figure.
 *
 * The same ledger gives different, individually-correct answers on the two.
 * Read one basis per surface and never add figures across them.
 * ------------------------------------------------------------------ */

/** Category filed against the cash side of a loan repayment. */
export const LOAN_REPAYMENT_CATEGORY = "Loan repayment";

/** Category filed against interest and penalties on the cost basis. */
export const LOAN_INTEREST_CATEGORY = "Loan interest";

/**
 * The loan's *cash* movements as transaction-shaped rows: same fields, same
 * sign convention, so anything that reads transactions can read these too.
 *
 * Interest and penalty events raise what's owed without any money changing
 * hands, so they're absent here by design — `loanCostRows` is where they land.
 *
 * The repayment category is a synthetic name that isn't in the user's category
 * list, so `alignBudgets` never gives it a budget and it can't trip an
 * over-budget check. A user who creates a real category by that name folds the
 * two into one bucket — the total stays right either way.
 */
export function loanCashRows(loanEvents = [], loans = []) {
  return loanEvents
    .filter((e) => e.type === "taken" || e.type === "repayment")
    .map((e) => ({
      id: e.id,
      date: e.date,
      // Carried through so the register can break same-day ties by the order
      // things were actually recorded rather than arbitrarily.
      createdAt: e.created_at ?? e.createdAt ?? null,
      description: `${e.type === "taken" ? "Loan received" : "Loan repayment"} — ${
        (loans.find((l) => l.id === e.loanId) || {}).name || "Loan"
      }`,
      category: e.type === "taken" ? "Loan" : LOAN_REPAYMENT_CATEGORY,
      amount: e.type === "taken" ? e.amount : -e.amount,
      kind: "loan",
    }));
}

/**
 * The loan's *cost* as transaction-shaped rows: interest and penalties, as
 * negative rows, dated when they were charged.
 *
 * Principal appears on neither side. Borrowing ₵500 and handing ₵500 back is a
 * round trip that left you no poorer, and counting either leg as spending makes
 * a month's total swing on borrowing timing rather than on how you lived. What
 * borrowing genuinely costs is the interest, and that is what shows up here.
 *
 * Uses the same synthetic-category trick as `loanCashRows`, for the same
 * reason: no budget line can be tripped by a charge nobody budgeted for.
 */
export function loanCostRows(loanEvents = [], loans = []) {
  return loanEvents
    .filter((e) => e.type === "interest" || e.type === "penalty")
    .map((e) => ({
      id: e.id,
      date: e.date,
      createdAt: e.created_at ?? e.createdAt ?? null,
      description: `${e.type === "interest" ? "Loan interest" : "Loan penalty"} — ${
        (loans.find((l) => l.id === e.loanId) || {}).name || "Loan"
      }`,
      category: LOAN_INTEREST_CATEGORY,
      amount: -e.amount,
      kind: "loan",
    }));
}

/**
 * Cash basis: transactions plus every loan cash movement, both directions.
 *
 * This is what the running balance is built from, so `sumIncome` over these
 * rows includes drawdowns. That is correct for cash and wrong for earnings —
 * the register labels the drawdown separately rather than folding it into
 * "earned".
 */
export const cashRows = (transactions, loanEvents = [], loans = []) => [
  ...transactions,
  ...loanCashRows(loanEvents, loans),
];

/**
 * Cost basis: transactions plus interest and penalties. The rows every
 * "what did I spend" aggregate should see.
 *
 * Income is untouched — only negative rows are appended, so
 * `sumIncome(costRows(...)) === sumIncome(transactions)` always. Drawing a loan
 * down is a liability, not earnings; it stays on the "Loans owed" line.
 *
 * Deliberately *not* for per-category budget figures. `budgetBurn` and
 * `detectRecurring` stay on raw transactions: interest has no budget line to
 * spend against, and a one-off interest charge must not be learned as a
 * monthly subscription.
 */
export const costRows = (transactions, loanEvents = [], loans = []) => [
  ...transactions,
  ...loanCostRows(loanEvents, loans),
];

/* ------------------------------------------------------------------ *
 * Register
 * ------------------------------------------------------------------ */

/**
 * Total order over register rows: date, then when it was recorded, then id.
 *
 * The id fallback is what makes this a *total* order rather than a partial one.
 * A comparator that returns a non-zero value for equivalent rows breaks the
 * contract `Array#sort` is specified against, and the running balance is only
 * readable if the displayed order is exactly the reverse of the order the
 * balance was accumulated in.
 */
const byLedgerOrder = (a, b) => {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  const ac = a.createdAt || "";
  const bc = b.createdAt || "";
  if (ac !== bc) return ac < bc ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
};

/**
 * Merges transactions and loan cash events into one register with a running
 * balance, newest first. Loan events are synthetic read-only rows.
 *
 * Sorted once ascending and reversed, rather than sorted twice: that is what
 * guarantees each row's balance is the row below it plus this row's amount,
 * which is the only reason the column is readable at all.
 */
export function withBalance(transactions, loanEvents, loans) {
  const events = cashRows(
    transactions.map((t) => ({ ...t, kind: "transaction" })),
    loanEvents,
    loans
  )
    .map((e) => ({ ...e, createdAt: e.createdAt ?? e.created_at ?? null }))
    .sort(byLedgerOrder);

  let bal = 0;
  const ascending = events.map((e) => {
    bal += e.amount;
    return { ...e, balance: bal };
  });

  return ascending.reverse();
}

/**
 * Everything the register footer needs for one month, as data.
 *
 * Satisfies `closing === opening + earned + loanDrawn - expenses`. Keeping that
 * identity in one place — rather than re-derived across the view — is what
 * stops the totals drifting away from the balance column beside them.
 *
 * `opening` is the balance carried in from before `key`, so the column
 * reconciles within the month instead of silently depending on all history.
 */
export function registerMonth(transactions, loanEvents, loans, key) {
  const all = withBalance(transactions, loanEvents, loans); // newest first
  const rows = all.filter((r) => monthKey(r.date) === key);

  // The oldest row in the month, minus its own amount, is what was carried in.
  // With no rows this month, it's whatever the last row before it closed at.
  const oldest = rows[rows.length - 1];
  const opening = oldest
    ? oldest.balance - oldest.amount
    : (all.find((r) => monthKey(r.date) < key) || { balance: 0 }).balance;

  const earned = sumIncome(rows.filter((r) => r.kind !== "loan"));
  const loanDrawn = rows
    .filter((r) => r.kind === "loan" && r.amount > 0)
    .reduce((s, r) => s + r.amount, 0);
  const expenses = sumExpenses(rows);

  return {
    rows,
    opening,
    closing: opening + earned + loanDrawn - expenses,
    earned,
    loanDrawn,
    expenses,
    net: earned + loanDrawn - expenses,
  };
}

/* ------------------------------------------------------------------ *
 * Insight strip
 * ------------------------------------------------------------------ */

export function buildInsights({ transactions, loans, loanEvents, budgets, categories = [], key, now = new Date() }) {
  const plan = alignBudgets(budgets, categories);
  // Cost basis: interest and penalties count as expenses, repaying principal
  // does not, and drawing a loan down is not income (it shows on the "Loans
  // owed" line instead). Both months read from the same rows — comparing a
  // month on one basis against a baseline on another reports a phantom spike.
  const rows = costRows(transactions, loanEvents, loans);
  const monthTx = inMonth(rows, key);
  const income = sumIncome(monthTx);
  const expenses = sumExpenses(monthTx);
  const net = income - expenses;
  const prevKey = shiftMonth(key, -1);
  const prevTx = inMonth(rows, prevKey);
  const prevExpenses = sumExpenses(prevTx);

  const cats = byCategory(monthTx, Object.keys(plan));
  const owed = totalOutstanding(loans, loanEvents);
  const out = [];

  if (income > 0 || expenses > 0) {
    const change = pctChange(expenses, prevExpenses);
    if (change !== null && prevExpenses > 0) {
      const flat = Math.abs(change) < 0.5;
      out.push({
        tone: flat ? "neutral" : change < 0 ? "good" : "bad",
        text: flat
          ? `Expenses are flat versus ${monthLabel(prevKey)}.`
          : `Expenses are ${change > 0 ? "up" : "down"} ${Math.abs(change).toFixed(0)}% versus ${monthLabel(prevKey)}.`,
      });
    }

    if (income > 0) {
      const rate = (net / income) * 100;
      out.push({
        tone: rate >= 0 ? "good" : "bad",
        text:
          rate >= 0
            ? `You saved ${rate.toFixed(0)}% of income this month.`
            : `You spent ${Math.abs(rate).toFixed(0)}% more than you earned this month.`,
      });
    }

    const top = Object.entries(cats).sort((a, b) => b[1] - a[1])[0];
    if (top && expenses > 0) {
      out.push({
        tone: "neutral",
        text: `${top[0]} is your biggest expense — ${((top[1] / expenses) * 100).toFixed(0)}% of spending.`,
      });
    }

    // `plan[c] > 0` is what keeps the synthetic "Loan interest" bucket out of
    // this: it never has a budget, and `undefined > 0` is false.
    const over = Object.entries(cats).filter(([c, amt]) => plan[c] > 0 && amt > plan[c]);
    if (over.length > 0) {
      out.push({ tone: "bad", text: `Over budget in ${over.map(([c]) => c).join(", ")} this month.` });
    }

    // Cost rows, matching the Analytics tiles — the two must not disagree
    // about what the month is on pace to cost. Repayments are absent from this
    // basis, which also keeps `detectRecurring` (run inside `forecast`) from
    // learning a fixed monthly repayment as a subscription.
    const fc = forecast(rows, key, plan, now);
    if (!fc.complete && fc.projected > 0 && fc.budgetTotal > 0) {
      out.push({
        tone: fc.projected > fc.budgetTotal ? "bad" : "good",
        text:
          fc.projected > fc.budgetTotal
            ? `On pace to finish ${fmtMoney(fc.projected - fc.budgetTotal)} over budget.`
            : `On pace to finish within budget — ${fmtMoney(fc.budgetTotal - fc.projected)} spare.`,
      });
    }
  }

  if (owed > 0) {
    out.push({
      tone: "bad",
      text: `${fmtMoney(owed)} outstanding across ${loans.length} loan${loans.length === 1 ? "" : "s"}.`,
    });
  }

  if (out.length === 0) {
    out.push({ tone: "neutral", text: "Log a few entries and this section will start surfacing patterns." });
  }

  return out;
}
