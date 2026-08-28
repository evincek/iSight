// Pure derived-data functions. No React, no Supabase — everything here takes
// plain arrays and returns plain data, so it can be reasoned about (and tested)
// in isolation and reused by both the Overview strip and the Analytics view.

import { monthKey, shiftMonth, daysInMonth, elapsedDays, monthLabel, fmtMoney, addMonths, todayISO } from "./format";

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

/** Expense totals keyed by category (positive numbers). */
export const byCategory = (tx) => {
  const map = {};
  tx.filter((t) => t.amount < 0).forEach((t) => {
    map[t.category] = (map[t.category] || 0) + Math.abs(t.amount);
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

  const spend = byCategory(inMonth(transactions, key));

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

  // A past or not-yet-started month needs no projection.
  if (elapsed === 0) {
    return { spent: 0, projected: 0, budgetTotal, complete: false, elapsed, total, basis: "none" };
  }
  if (elapsed >= total) {
    return { spent, projected: spent, budgetTotal, complete: true, elapsed, total, basis: "actual" };
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
    overBudgetBy: budgetTotal > 0 ? projected - budgetTotal : null,
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

/**
 * Merges transactions and loan events into one date-sorted register with a
 * running balance. Loan events are synthetic read-only rows.
 */
export function withBalance(transactions, loanEvents, loans) {
  const events = [
    ...transactions.map((t) => ({ ...t, kind: "transaction" })),
    // Only cash movements belong in a running balance. Interest and penalty
    // events raise what's owed without any money changing hands, so they're
    // reported on the Loans view instead of banked here.
    ...loanEvents
      .filter((e) => e.type === "taken" || e.type === "repayment")
      .map((e) => ({
        id: e.id,
        date: e.date,
        description: `${e.type === "taken" ? "Loan received" : "Loan repayment"} — ${
          (loans.find((l) => l.id === e.loanId) || {}).name || "Loan"
        }`,
        category: "Loan",
        amount: e.type === "taken" ? e.amount : -e.amount,
        kind: "loan",
      })),
  ].sort((a, b) => (a.date > b.date ? 1 : -1));

  let bal = 0;
  const balances = {};
  events.forEach((e) => {
    bal += e.amount;
    balances[e.id] = bal;
  });

  return events
    .map((e) => ({ ...e, balance: balances[e.id] }))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

/* ------------------------------------------------------------------ *
 * Insight strip
 * ------------------------------------------------------------------ */

export function buildInsights({ transactions, loans, loanEvents, budgets, key, now = new Date() }) {
  const monthTx = inMonth(transactions, key);
  const income = sumIncome(monthTx);
  const expenses = sumExpenses(monthTx);
  const net = income - expenses;
  const prevKey = shiftMonth(key, -1);
  const prevTx = inMonth(transactions, prevKey);
  const prevExpenses = sumExpenses(prevTx);

  const cats = byCategory(monthTx);
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

    const over = Object.entries(cats).filter(([c, amt]) => budgets[c] > 0 && amt > budgets[c]);
    if (over.length > 0) {
      out.push({ tone: "bad", text: `Over budget in ${over.map(([c]) => c).join(", ")} this month.` });
    }

    const fc = forecast(transactions, key, budgets, now);
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
