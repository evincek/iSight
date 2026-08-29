// Fixture engine for the shared analytics contract.
//
// The fixtures in spec/fixtures/*.json are the specification for the derived-data
// layer, and they are language-neutral on purpose: a Dart port of
// src/lib/analytics.js must load the same files, dispatch the same function
// names, and produce the same values. Everything here is therefore
// straightforward enough to reimplement in another language in an afternoon —
// no closures in the fixture format, no expression language, no JS-only types.
//
// See spec/README.md for the format.

/* ------------------------------------------------------------------ *
 * Argument resolution
 * ------------------------------------------------------------------ */

/**
 * Fixtures cannot embed a Date, so `now` arguments arrive as {"$date": "..."}
 * and named values as {"$ref": "..."}. Everything else is plain JSON and is
 * passed through untouched.
 */
export function resolveArg(arg, env) {
  if (arg === null || typeof arg !== "object") return arg;
  if (Array.isArray(arg)) return arg.map((a) => resolveArg(a, env));

  // {"$ref": "loans", "path": "0"} — so a case can pass one element of an
  // earlier result as an argument without a separate setup step.
  if ("$ref" in arg) {
    if (!(arg.$ref in env)) {
      throw new Error(`unknown $ref "${arg.$ref}" (have: ${Object.keys(env).join(", ")})`);
    }
    return readPath(env[arg.$ref], arg.path);
  }

  // Date-only ISO strings are constructed in local time to match the rest of
  // lib/, which builds dates as new Date(y, m - 1, d). Parsing "2026-09-01"
  // with the Date constructor would read it as UTC and land on the previous
  // day west of Greenwich.
  if ("$date" in arg) {
    const [y, m, d] = arg.$date.split("-").map(Number);
    return new Date(y, m - 1, d);
  }

  const out = {};
  for (const [k, v] of Object.entries(arg)) out[k] = resolveArg(v, env);
  return out;
}

/* ------------------------------------------------------------------ *
 * Result paths
 * ------------------------------------------------------------------ */

/**
 * Reads into a result without needing a callback in the fixture.
 *
 *   "spent"                → result.spent
 *   "rows.0.current"       → result.rows[0].current
 *   "trend.-1.Expenses"    → result.trend.at(-1).Expenses
 *   "rows[category=Food].current"
 *                          → result.rows.find(r => r.category === "Food").current
 *
 * The find form compares as strings, so it works for both "Food" and a numeric
 * id without the fixture having to declare which it is.
 */
export function readPath(value, path) {
  if (!path) return value;

  let cur = value;
  for (const rawSeg of splitPath(path)) {
    if (cur == null) throw new Error(`path "${path}" ran off the end at "${rawSeg}"`);

    const find = rawSeg.match(/^\[([^=\]]+)=([^\]]*)\]$/);
    if (find) {
      const [, key, want] = find;
      if (!Array.isArray(cur)) throw new Error(`path "${path}": [${key}=…] needs an array`);
      const hit = cur.find((el) => el != null && String(el[key]) === want);
      if (hit === undefined) throw new Error(`path "${path}": no element with ${key}=${want}`);
      cur = hit;
      continue;
    }

    if (/^-?\d+$/.test(rawSeg)) {
      if (!Array.isArray(cur)) throw new Error(`path "${path}": index ${rawSeg} needs an array`);
      const i = Number(rawSeg);
      cur = i < 0 ? cur[cur.length + i] : cur[i];
      continue;
    }

    cur = cur[rawSeg];
  }
  return cur;
}

/** Splits on "." but keeps [k=v] segments whole, since values may contain dots. */
function splitPath(path) {
  const segs = [];
  let buf = "";
  let inBracket = false;
  for (const ch of path) {
    if (ch === "[") {
      if (buf) segs.push(buf);
      buf = ch;
      inBracket = true;
    } else if (ch === "]") {
      buf += ch;
      segs.push(buf);
      buf = "";
      inBracket = false;
    } else if (ch === "." && !inBracket) {
      if (buf) segs.push(buf);
      buf = "";
    } else {
      buf += ch;
    }
  }
  if (buf) segs.push(buf);
  return segs;
}

/* ------------------------------------------------------------------ *
 * Running a fixture
 * ------------------------------------------------------------------ */

/**
 * Seeds the reference environment from a fixture's `ledger` block. The keys
 * here are the vocabulary a fixture can reference before it computes anything.
 */
export function seedEnv(ledger = {}) {
  return {
    transactions: ledger.transactions ?? [],
    loans: ledger.loans ?? [],
    loanEvents: ledger.loanEvents ?? [],
    budgets: ledger.budgets ?? {},
    categories: ledger.categories ?? [],
  };
}

/**
 * Executes one case against a module of pure functions.
 *
 * Returns { actual, expected, kind } and mutates `env` when the case names its
 * result with `as`. Assertion is left to the caller so the test runner reports
 * failures in its own idiom — a Dart port asserts with `expect` instead.
 */
export function runCase(mod, testCase, env) {
  const { fn, args = [], path, as } = testCase;

  const target = mod[fn];
  if (typeof target !== "function") {
    throw new Error(`fixture calls "${fn}", which the module does not export`);
  }

  const result = target(...args.map((a) => resolveArg(a, env)));
  if (as) env[as] = result;

  // `expectAbsent` asserts that a path does not resolve — the [k=v] find form
  // throws on a miss, and here that miss is the point being tested.
  if (testCase.expectAbsent) {
    let found = true;
    try {
      found = readPath(result, path) !== undefined;
    } catch {
      found = false;
    }
    return { actual: found, expected: false, kind: "exact" };
  }

  const actual = readPath(result, path);

  if ("expect" in testCase) return { actual, expected: testCase.expect, kind: "exact" };
  if ("expectClose" in testCase) {
    return {
      actual,
      expected: testCase.expectClose,
      kind: "close",
      tolerance: testCase.tolerance ?? 1e-9,
    };
  }
  // A case with no expectation is a setup step — it exists to populate `as`.
  return { actual, kind: "none" };
}

/** Human-readable name for a case, for test output. */
export const caseName = (testCase, i) =>
  testCase.name ?? `${testCase.fn}${testCase.path ? `.${testCase.path}` : ""} [#${i}]`;
