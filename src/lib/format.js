// Date + money helpers. Lifted verbatim from the original Ledger.jsx so the
// numbers on screen stay byte-identical through the refactor.

export const todayISO = () => new Date().toISOString().slice(0, 10);

/**
 * The display currency.
 *
 * Configured once per session rather than threaded through every call: money is
 * formatted at ~76 sites across the views, and passing a symbol to each of them
 * would add noise everywhere to express something that never varies within a
 * session. `useLedgerData` calls `setCurrency` when it loads the user's profile,
 * and re-renders the tree so the new symbol is picked up.
 *
 * Amounts are stored and summed as plain numbers throughout — this is a
 * rendering concern only, and changing it never touches the data.
 */
const DEFAULT_CURRENCY = "₵";
let currencySymbol = DEFAULT_CURRENCY;

/** Currencies offered in Settings. `symbol` is what gets stored and rendered. */
export const CURRENCIES = [
  { symbol: "₵", code: "GHS", name: "Ghanaian cedi" },
  { symbol: "$", code: "USD", name: "US dollar" },
  { symbol: "€", code: "EUR", name: "Euro" },
  { symbol: "£", code: "GBP", name: "Pound sterling" },
  { symbol: "₦", code: "NGN", name: "Nigerian naira" },
  { symbol: "KSh", code: "KES", name: "Kenyan shilling" },
  { symbol: "R", code: "ZAR", name: "South African rand" },
  { symbol: "₹", code: "INR", name: "Indian rupee" },
  { symbol: "¥", code: "JPY", name: "Japanese yen" },
  { symbol: "C$", code: "CAD", name: "Canadian dollar" },
  { symbol: "A$", code: "AUD", name: "Australian dollar" },
];

export const setCurrency = (symbol) => {
  currencySymbol = symbol || DEFAULT_CURRENCY;
};

export const getCurrency = () => currencySymbol;

export const fmtMoney = (n) => {
  const sign = n < 0 ? "-" : "";
  return `${sign}${currencySymbol}${Math.abs(n).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

/** Compact form for chart axes: ₵12.4k */
export const fmtCompact = (n) => {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}${currencySymbol}${(abs / 1_000_000).toFixed(1)}m`;
  if (abs >= 1_000) return `${sign}${currencySymbol}${(abs / 1_000).toFixed(abs >= 10_000 ? 0 : 1)}k`;
  return `${sign}${currencySymbol}${Math.round(abs)}`;
};

export const fmtPct = (n, digits = 0) =>
  `${n >= 0 ? "+" : ""}${n.toFixed(digits)}%`;

export const monthKey = (dateStr) => dateStr.slice(0, 7);

export const monthLabel = (key) => {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleString(undefined, { month: "long", year: "numeric" });
};

/** "AUG '26" — for tight sidebar/axis contexts. */
export const monthShort = (key) => {
  const [y, m] = key.split("-").map(Number);
  const mon = new Date(y, m - 1, 1).toLocaleString(undefined, { month: "short" });
  return `${mon.toUpperCase()} '${String(y).slice(2)}`;
};

export const shiftMonth = (key, delta) => {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

export const daysInMonth = (key) => {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m, 0).getDate();
};

/** First/last ISO date of a month key. */
export const monthBounds = (key) => ({
  from: `${key}-01`,
  to: `${key}-${String(daysInMonth(key)).padStart(2, "0")}`,
});

/** Day-of-month elapsed, capped to the month's length. Used by forecasting. */
export const elapsedDays = (key, now = new Date()) => {
  const nowKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const total = daysInMonth(key);
  if (key < nowKey) return total; // past month: fully elapsed
  if (key > nowKey) return 0; // future month
  return Math.min(now.getDate(), total);
};

/**
 * Adds `n` whole months to an ISO date, clamping to the target month's last
 * day so 2026-01-31 + 1 month is 2026-02-28 rather than rolling into March.
 * Used to turn a loan's term length into a due date.
 */
export const addMonths = (dateStr, n) => {
  const [y, m, d] = dateStr.split("-").map(Number);
  const last = new Date(y, m - 1 + n + 1, 0).getDate();
  const t = new Date(y, m - 1 + n, Math.min(d, last));
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
};

export const dayLabel = (dateStr) => {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleString(undefined, { month: "short", day: "numeric" });
};

/**
 * The month keys the period picker should offer.
 *
 * A rolling window around today, unioned with every month that actually has
 * data — so you can navigate to an empty month (to check it, or to view a
 * comparison against it) instead of only reaching months that already have
 * entries. Months outside the window that hold data are still included, so old
 * records never become unreachable.
 */
export function monthOptions({ dataMonths = [], today = todayISO().slice(0, 7), back = 12, forward = 1 } = {}) {
  const set = new Set(dataMonths.filter(Boolean));
  for (let i = -forward; i <= back; i++) set.add(shiftMonth(today, -i));
  return Array.from(set).sort().reverse();
}
