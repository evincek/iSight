// Tests for the pure derived-data layer. No bundler, no framework, no deps:
// `node --test` and `node:assert` are enough, because lib/analytics.js takes
// plain arrays and returns plain data.
//
//   npm test

import test from "node:test";
import assert from "node:assert/strict";
import * as A from "../src/lib/analytics.js";

/* One month of activity, plus a loan taken the month before. Figures are round
 * so a wrong total is obvious rather than plausible. */
const tx = [
  { id: "t1", date: "2026-08-01", description: "Salary", category: "Income", amount: 3000 },
  { id: "t2", date: "2026-08-03", description: "Rent", category: "Housing", amount: -1000 },
  { id: "t3", date: "2026-08-10", description: "Groceries", category: "Food", amount: -200 },
];

const loans = [
  { id: "L1", name: "Kofi", principal: 2000, date: "2026-07-05", interestAmount: 0, durationMonths: null },
];

const loanEvents = [
  { id: "e1", loanId: "L1", type: "taken", amount: 2000, date: "2026-07-05" },
  { id: "e2", loanId: "L1", type: "repayment", amount: 500, date: "2026-08-20" },
];

const rows = A.spendingRows(tx, loanEvents, loans);
const aug = A.inMonth(rows, "2026-08");
const jul = A.inMonth(rows, "2026-07");

test("a loan repayment counts as an expense", () => {
  assert.equal(A.sumExpenses(aug), 1700); // 1000 rent + 200 food + 500 repaid
});

test("drawing a loan down is not income", () => {
  assert.equal(A.sumIncome(jul), 0);
  // The projection only ever appends negative rows, so income is untouched.
  assert.equal(A.sumIncome(aug), A.sumIncome(A.inMonth(tx, "2026-08")));
  assert.equal(A.sumIncome(aug), 3000);
});

test("category rows sum to the expenses headline", () => {
  // The identity the Overview relies on: "Where it went" adds up to Expenses.
  const cats = A.byCategory(aug, ["Housing", "Food", "Income"]);
  assert.equal(cats[A.LOAN_REPAYMENT_CATEGORY], 500);
  assert.equal(
    Object.values(cats).reduce((s, v) => s + v, 0),
    A.sumExpenses(aug)
  );
});

test("the month-over-month baseline counts repayments too", () => {
  // Comparing a month that counts repayments against one that doesn't would
  // report a spike that never happened.
  const cmp = A.monthComparison(rows, "2026-08", "2026-07");
  assert.equal(cmp.currTotal, 1700);
  assert.equal(cmp.rows.find((r) => r.category === A.LOAN_REPAYMENT_CATEGORY).current, 500);
});

test("the trend series counts repayments", () => {
  const trend = A.trendSeries(rows, "2026-08", 2);
  assert.equal(trend.at(-1).Expenses, 1700);
  assert.equal(trend.at(-1).Net, 1300);
});

test("what's outstanding still reads raw loan events", () => {
  assert.equal(A.loanOutstanding(loanEvents, "L1"), 1500);
  assert.equal(A.totalOutstanding(loans, loanEvents), 1500);
  assert.equal(A.loanSummary(loans[0], loanEvents, "2026-08-31").repaid, 500);
});

test("the budget path stays on transactions alone", () => {
  // A repayment has no budget line, so it must not move spend-against-plan.
  assert.equal(A.forecast(tx, "2026-08", {}, new Date("2026-09-01")).spent, 1200);
  assert.equal(A.sumExpenses(A.inMonth(tx, "2026-08")), 1200);
});

test("a synthetic repayment bucket can never trip an over-budget check", () => {
  const insights = A.buildInsights({
    transactions: tx,
    loans,
    loanEvents,
    budgets: { Housing: 900 },
    categories: ["Housing", "Food", "Income"],
    key: "2026-08",
    now: new Date("2026-09-01"),
  });
  const over = insights.find((i) => i.text.startsWith("Over budget in"));
  assert.ok(over, "Housing is 1000 against a 900 budget");
  assert.ok(!over.text.includes(A.LOAN_REPAYMENT_CATEGORY));

  // And the repayment did reach the figures the insights are built on: 1300
  // saved of 3000 earned, and Housing at 1000 of 1700 spent rather than 1200.
  assert.ok(insights.some((i) => i.text === "You saved 43% of income this month."));
  assert.ok(insights.some((i) => i.text === "Housing is your biggest expense — 59% of spending."));
});

test("the register keeps one row per event and labels the cash side", () => {
  const register = A.withBalance(tx, loanEvents, loans);
  assert.equal(register.length, 5);
  assert.equal(new Set(register.map((r) => r.id)).size, register.length);
  assert.equal(register.find((r) => r.id === "e2").category, A.LOAN_REPAYMENT_CATEGORY);
  assert.equal(register.find((r) => r.id === "e1").category, "Loan");
  // Newest first, and the running balance is unchanged by this refactor:
  // 2000 drawn - 0 + 3000 - 1000 - 200 - 500.
  assert.equal(register[0].balance, 3300);
});

test("interest and penalty raise what's owed without moving cash", () => {
  const withCharges = [
    ...loanEvents,
    { id: "e3", loanId: "L1", type: "interest", amount: 100, date: "2026-08-06" },
    { id: "e4", loanId: "L1", type: "penalty", amount: 50, date: "2026-08-07" },
  ];
  assert.equal(A.totalOutstanding(loans, withCharges), 1650);
  // Neither shows up as spending — only the repayment does.
  assert.equal(A.sumExpenses(A.inMonth(A.spendingRows(tx, withCharges, loans), "2026-08")), 1700);
});

test("the aggregates hold up with no loans at all", () => {
  assert.deepEqual(A.spendingRows(tx), tx);
  assert.equal(A.sumExpenses(A.inMonth(A.spendingRows(tx, [], []), "2026-08")), 1200);
});
