// Category-name handling, shared by the data layer and the derived-data layer.
//
// A category name is free text stored three times over: on the `categories`
// row, on every transaction, and on every budget. Nothing keeps those three
// spellings in step, so "Food", "food" and "Food " all have to be treated as
// one thing when the app matches them up — otherwise spend is counted against
// one spelling while the budget sits on another.

/** What gets stored: trimmed, inner runs of whitespace collapsed, case as typed. */
export const normalizeCategory = (name) => (name || "").trim().replace(/\s+/g, " ");

/**
 * What gets matched on. Migration 006 indexes `categories` on a SQL
 * `category_key()` with this exact definition, so the database rejects a second
 * spelling on the same terms the app folds them on — the two cannot drift into
 * disagreeing about which names are one category.
 */
export const categoryKey = (name) => normalizeCategory(name).toLowerCase();

export const sameCategory = (a, b) => categoryKey(a) === categoryKey(b);

/**
 * Re-key a `{ category: amount }` budget map onto the live category list,
 * folding case- and spacing-variants together.
 *
 * Values are *not* summed: two rows spelled differently are one plan recorded
 * twice, not two plans, and adding them would inflate the budget — which reads
 * on screen as headroom the user doesn't have. The row spelled exactly like the
 * live category wins; otherwise the first variant seen does. A budget whose
 * category no longer exists is kept under its own name rather than dropped, so
 * a deleted category can't silently erase the plan that went with it.
 */
export function alignBudgets(budgets, names = []) {
  const canonical = new Map();
  for (const name of names) canonical.set(categoryKey(name), name);

  const out = {};
  for (const [name, amount] of Object.entries(budgets)) {
    const live = canonical.get(categoryKey(name));
    if (live === undefined) {
      out[name] = amount;
    } else if (out[live] === undefined || name === live) {
      out[live] = amount;
    }
  }
  return out;
}
