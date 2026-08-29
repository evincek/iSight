# The analytics contract

`fixtures/*.json` is the specification for the pure derived-data layer
(`src/lib/analytics.js`). It is data, not code, so that **more than one
implementation can be held to it**: the Node suite in
[`../scripts/analytics.test.js`](../scripts/analytics.test.js) runs it today, and
the planned Dart port for the Flutter apps must load the same files, dispatch
the same function names, and produce the same values.

That is the whole point. Keeping the ledger's arithmetic identical across two
languages by reading both implementations is not a thing anyone can sustain;
keeping it identical by failing CI when they disagree is.

```
spec/fixtures/*.json ──┬──▶ scripts/analytics.test.js  (node --test)
                       └──▶ test/analytics_test.dart   (planned)
```

## The two bases

A loan can be read two ways, and the single most important thing this contract
pins is that no figure mixes them.

| | `cashRows` | `costRows` |
| --- | --- | --- |
| Answers | what moved through the account | what the month cost me |
| Drawing a loan down | money **in** | nothing |
| Repaying principal | money **out** | nothing |
| Interest / penalty charged | nothing until paid | an **expense**, when charged |
| Used by | the register and its running balance | every "what did I spend" figure |

Both are correct; they answer different questions. Borrowing ₵500 and handing
₵500 back leaves you no poorer, so on the cost basis the round trip nets to zero
and only the interest survives — which is what stops a month's total swinging on
*when* you borrowed rather than on how you lived. On the cash basis both legs
count, because both legs really did move money.

**Never add a figure from one basis to one from the other.** The register
reconciles as `closing = opening + earned + loanDrawn - out` and `registerMonth`
returns those terms together for exactly that reason: the identity is pinned as
data here rather than re-derived in each view, where it had previously drifted.

Per-category budget figures (`budgetBurn`, and the Budgets view) stay on raw
transactions on purpose — a loan charge has no budget line to spend against.

## Adding coverage

Add a case to a fixture, not a test to the JS suite. A fixture case covers both
languages; a JS test covers one. `scripts/analytics.test.js` enforces this: any
exported function of `analytics.js` with no fixture case fails the build unless
it is named in `LOCALE_SENSITIVE` with a reason.

## Format

```jsonc
{
  "name": "...",
  "description": "why this fixture exists",
  "ledger": {
    "transactions": [], "loans": [], "loanEvents": [],
    "budgets": {}, "categories": []
  },
  "cases": [
    { "as": "rows", "fn": "costRows",
      "args": [{"$ref": "transactions"}, {"$ref": "loanEvents"}, {"$ref": "loans"}] },
    { "name": "loan interest is an expense",
      "fn": "sumExpenses", "args": [{"$ref": "rows"}], "expect": 1550 }
  ]
}
```

**Cases run in order against one shared environment per fixture.** The `ledger`
keys seed it; `as` adds a result to it. A case with no expectation is a setup
step.

### Arguments

| Form | Meaning |
| --- | --- |
| any JSON literal | passed through unchanged |
| `{"$ref": "name"}` | a ledger key, or an earlier case's `as` |
| `{"$ref": "loans", "path": "0"}` | one element of a referenced value |
| `{"$date": "2026-08-16"}` | a `now` argument, built in **local** time |

`$date` is local (`new Date(y, m-1, d)` / `DateTime(y, m, d)`), matching how the
rest of `lib/` constructs dates. Parsing `"2026-08-16"` as an ISO string instead
reads it as UTC and lands on the previous day west of Greenwich.

### Reading into results

`path` walks the returned value, so a fixture never needs a callback:

| Path | Equivalent |
| --- | --- |
| `spent` | `result.spent` |
| `rows.0.current` | `result.rows[0].current` |
| `-1.Expenses` | `result.at(-1).Expenses` |
| `length` | `result.length` |
| `[category=Food].spent` | `result.find(r => r.category === "Food").spent` |

`[k=v]` compares as strings, so it works for names and numeric ids alike.

### Expectations

| Key | Meaning |
| --- | --- |
| `expect` | deep equality |
| `expectClose` + optional `tolerance` | numeric, default `1e-9` |
| `expectAbsent: true` | the path resolves to nothing (e.g. a row that should not exist) |

Use `expectClose` for anything that divides — `pctUsed`, `projected`, `pace`.
Use `expect` for counts, sums, flags, names and ordering: those should be exact
in any language, and a tolerance there would hide a real divergence.

## What is deliberately outside the contract

**Locale-dependent text.** `comparisonVerdict` and `buildInsights` compose
sentences with `fmtMoney` and `monthLabel`, which call
`toLocaleString(undefined, …)`. That output varies with the host locale and
cannot be byte-matched between a Node runner and a Dart one. They are covered by
JS-only tests instead. A Dart port should assert on the `tone` field and on the
figures fed in — never on the rendered sentence.

## Known divergence risk: `detectRecurring`

`detectRecurring` computes its `gaps` from `new Date(dateStr)`, which parses as
**UTC**, but its `daysSince` against a `now` that callers build in **local**
time. Mixing the two makes `daysSince` — and therefore `dueSoon` — shift by a
day in any timezone east of Greenwich:

| TZ | `daysSince` for the same input |
| --- | --- |
| UTC, Africa/Accra, America/Los_Angeles | 15 |
| Asia/Tokyo, Pacific/Kiritimati | 14 |

The fixtures pin every other field of `detectRecurring` and deliberately leave
these two alone, so the suite stays green wherever it runs. **This is a bug in
`analytics.js`, not in the fixtures** — both dates should be built the same way.
Worth fixing before the Dart port, since Dart's `DateTime.parse` has the same
UTC-vs-local split and would reproduce the inconsistency rather than reveal it.
Once fixed, pin `daysSince` and `dueSoon` here too.
