// Tests for the pure derived-data layer. No bundler, no framework, no deps:
// `node --test` and `node:assert` are enough, because lib/analytics.js takes
// plain arrays and returns plain data.
//
//   npm test
//
// Most of the suite is *not* written here. It lives in spec/fixtures/*.json,
// which is the shared specification for this layer: a Dart port of
// analytics.js loads the same files and must produce the same values. Adding a
// case there covers both languages at once; adding one here covers only JS, so
// prefer a fixture unless the behaviour is genuinely JS-specific.

import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import * as A from "../src/lib/analytics.js";
import * as F from "../src/lib/format.js";
import { seedEnv, runCase, caseName } from "../spec/harness.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixtureDir = join(here, "..", "spec", "fixtures");

const fixtures = readdirSync(fixtureDir)
  .filter((f) => f.endsWith(".json"))
  .sort()
  .map((f) => ({ file: f, ...JSON.parse(readFileSync(join(fixtureDir, f), "utf8")) }));

/* ------------------------------------------------------------------ *
 * The portable contract
 * ------------------------------------------------------------------ */

for (const fixture of fixtures) {
  describe(`${fixture.file} — ${fixture.name}`, () => {
    // One env per fixture: cases run in order and `as` names feed later cases,
    // exactly as a Dart runner would replay them.
    const env = seedEnv(fixture.ledger);

    fixture.cases.forEach((testCase, i) => {
      test(caseName(testCase, i), () => {
        const r = runCase(A, testCase, env);
        if (r.kind === "none") return; // setup step
        if (r.kind === "close") {
          assert.equal(
            typeof r.actual,
            "number",
            `expected a number, got ${JSON.stringify(r.actual)}`
          );
          assert.ok(
            Math.abs(r.actual - r.expected) <= r.tolerance,
            `${r.actual} is not within ${r.tolerance} of ${r.expected}`
          );
          return;
        }
        assert.deepStrictEqual(r.actual, r.expected);
      });
    });
  });
}

/* ------------------------------------------------------------------ *
 * Coverage guard
 * ------------------------------------------------------------------ */

/**
 * Functions deliberately outside the portable contract, with the reason.
 *
 * Both build user-facing sentences with `fmtMoney` and `monthLabel`, which call
 * `toLocaleString(undefined, …)`. That output depends on the host locale, so it
 * cannot be byte-matched across a Node runner and a Dart one. They are covered
 * by the JS-only tests further down instead; a Dart port should assert on the
 * `tone` field and on the figures fed in, not on the text.
 */
const LOCALE_SENSITIVE = new Set(["comparisonVerdict", "buildInsights"]);

test("every exported function is covered by a fixture or explicitly excluded", () => {
  const exported = Object.entries(A)
    .filter(([, v]) => typeof v === "function")
    .map(([k]) => k);

  const covered = new Set(fixtures.flatMap((f) => f.cases.map((c) => c.fn)));

  const uncovered = exported.filter(
    (name) => !covered.has(name) && !LOCALE_SENSITIVE.has(name)
  );

  assert.deepStrictEqual(
    uncovered,
    [],
    `these functions have no fixture case, so a Dart port could diverge on them ` +
      `silently. Add one to spec/fixtures/, or add the name to LOCALE_SENSITIVE ` +
      `with a reason: ${uncovered.join(", ")}`
  );
});

test("the excluded list does not name functions that no longer exist", () => {
  for (const name of LOCALE_SENSITIVE) {
    assert.equal(typeof A[name], "function", `LOCALE_SENSITIVE names "${name}", which is gone`);
  }
});

/* ------------------------------------------------------------------ *
 * JS-only: locale-dependent text
 * ------------------------------------------------------------------ */

const tx = [
  { id: "t1", date: "2026-08-01", description: "Salary", category: "Income", amount: 3000 },
  { id: "t2", date: "2026-08-03", description: "Rent", category: "Housing", amount: -1000 },
  { id: "t3", date: "2026-08-10", description: "Groceries", category: "Food", amount: -200 },
];
const loans = [
  { id: "L1", name: "Kofi", principal: 2000, date: "2026-07-05", interestAmount: 300, durationMonths: null },
];
const loanEvents = [
  { id: "e1", loanId: "L1", type: "taken", amount: 2000, date: "2026-07-05" },
  { id: "e2", loanId: "L1", type: "repayment", amount: 500, date: "2026-08-20" },
  { id: "e3", loanId: "L1", type: "interest", amount: 300, date: "2026-08-05" },
];

test("a synthetic loan-charge bucket can never trip an over-budget check", () => {
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
  assert.ok(!over.text.includes(A.LOAN_INTEREST_CATEGORY));

  // The interest reached the figures the insights are built on and the
  // repayment did not: August cost 1500 (1000 rent + 200 food + 300 interest),
  // not 1700 (which would count the 500 of principal handed back).
  assert.ok(insights.some((i) => i.text === "You saved 50% of income this month."));
  assert.ok(insights.some((i) => i.text === "Housing is your biggest expense — 67% of spending."));
});

test("the verdict reports direction and magnitude", () => {
  const rows = A.costRows(tx, loanEvents, loans);
  const cmp = A.monthComparison(rows, "2026-08", "2026-07");
  const verdict = A.comparisonVerdict(cmp, "2026-08", "2026-07");
  // July holds no spending, so August is the first month with any.
  assert.match(verdict, /^First month with spending/);
});

/* ------------------------------------------------------------------ *
 * JS-only: the configured currency symbol
 * ------------------------------------------------------------------ */

// fmtMoney's digit grouping comes from toLocaleString and varies by host
// locale, so these assert on the symbol rather than the whole string.
// fmtCompact uses toFixed/Math.round only, so it is exact everywhere.

test("the currency symbol is configurable, and restores cleanly", () => {
  const original = F.getCurrency();
  try {
    F.setCurrency("₵");
    assert.match(F.fmtMoney(-1234.5), /^-₵/);
    assert.equal(F.fmtCompact(12400), "₵12k");

    F.setCurrency("$");
    assert.match(F.fmtMoney(-1234.5), /^-\$/);
    assert.equal(F.fmtCompact(12400), "$12k");
    assert.equal(F.fmtCompact(-1_500_000), "-$1.5m");

    // A multi-character symbol is a symbol like any other.
    F.setCurrency("KSh");
    assert.equal(F.fmtCompact(2500), "KSh2.5k");

    // An empty or missing setting must not render an unlabelled number.
    F.setCurrency("");
    assert.equal(F.fmtCompact(100), "₵100");
    F.setCurrency(undefined);
    assert.equal(F.fmtCompact(100), "₵100");
  } finally {
    // Module-level state is shared across this whole file: leaving it changed
    // would silently alter the buildInsights assertions above.
    F.setCurrency(original);
  }
});

test("every offered currency has a symbol, code and name", () => {
  assert.ok(F.CURRENCIES.length > 1);
  for (const c of F.CURRENCIES) {
    assert.ok(c.symbol && c.code && c.name, `incomplete entry: ${JSON.stringify(c)}`);
  }
  const codes = F.CURRENCIES.map((c) => c.code);
  assert.equal(new Set(codes).size, codes.length, "duplicate currency code");
  // The default has to be selectable, or Settings opens on a blank picker.
  assert.ok(F.CURRENCIES.some((c) => c.symbol === "₵"));
});
