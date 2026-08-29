import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "../lib/supabaseClient";
import { normalizeCategory, sameCategory } from "../lib/categories";
import { setCurrency, getCurrency } from "../lib/format";

// The built-in default, read once at module load before anything reconfigures
// it — so a failed or absent profile read falls back to a known symbol rather
// than to whatever the last signed-in user happened to choose.
const DEFAULT_SYMBOL = getCurrency();

export const DEFAULT_CATEGORIES = [
  "Housing",
  "Food",
  "Transport",
  "Utilities",
  "Entertainment",
  "Health",
  "Shopping",
  "Income",
  "Other",
];

/**
 * Category names are free text, so two names that differ only in spacing or
 * case are the same category as far as a person is concerned. `normalizeCategory`
 * is what gets stored; `sameCategory` is what decides "already exists" — it
 * mirrors the case-insensitive unique index added in migration 006. Both live
 * in lib/categories so the views match names the same way this file does.
 */
export { normalizeCategory, sameCategory } from "../lib/categories";

/**
 * Row shapers. Postgres hands numerics back as strings, and the views read
 * camelCase — both conversions live here so nothing downstream has to know.
 */
const shapeLoan = (l) => ({
  ...l,
  principal: Number(l.principal),
  interestAmount: Number(l.interest_amount || 0),
  durationMonths: l.duration_months == null ? null : Number(l.duration_months),
});

const shapeEvent = (e) => ({ ...e, amount: Number(e.amount), loanId: e.loan_id });

/**
 * Owns every Supabase read and write for the ledger.
 *
 * Query shapes and the optimistic-update pattern are carried over unchanged
 * from the original Ledger.jsx — the refactor must not alter what hits the
 * database, only where the code lives.
 */
export function useLedgerData(userId) {
  const [loaded, setLoaded] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [transactions, setTransactions] = useState([]);
  const [loans, setLoans] = useState([]);
  const [loanEvents, setLoanEvents] = useState([]);
  const [budgets, setBudgets] = useState({});
  const [categories, setCategories] = useState([]);
  const [currency, setCurrencyState] = useState(getCurrency());

  const loadAll = useCallback(async () => {
    setErrorMsg("");
    try {
      const [txRes, loanRes, eventRes, budgetRes, catRes, profileRes] = await Promise.all([
        supabase.from("transactions").select("*").order("date", { ascending: false }),
        supabase.from("loans").select("*").order("date", { ascending: false }),
        supabase.from("loan_events").select("*").order("date", { ascending: false }),
        supabase.from("budgets").select("*"),
        supabase.from("categories").select("*").order("created_at", { ascending: true }),
        supabase.from("profiles").select("currency").eq("id", userId).maybeSingle(),
      ]);
      for (const r of [txRes, loanRes, eventRes, budgetRes, catRes]) {
        if (r.error) throw r.error;
      }

      // `profiles` is deliberately not in that list. Migrations are applied by
      // hand in the Supabase editor, so this code can reach a database where
      // 007 has not run yet — and a missing display preference must not stop
      // someone opening their ledger. Anything unreadable here falls back to
      // the default symbol and the rest of the load carries on.
      let symbol = profileRes.error ? null : profileRes.data?.currency;
      if (!profileRes.error && !symbol) {
        // No row: this account signed up after 007's backfill ran. Seed it the
        // same way default categories are seeded, ignoring a row another tab
        // inserted first. A failure here is equally non-fatal.
        await supabase
          .from("profiles")
          .upsert({ id: userId }, { onConflict: "id", ignoreDuplicates: true });
      }
      // The module-level symbol is what the ~76 formatting call sites read; the
      // state copy is what makes React re-render when it changes.
      setCurrency(symbol || DEFAULT_SYMBOL);
      setCurrencyState(symbol || DEFAULT_SYMBOL);

      setTransactions(txRes.data.map((t) => ({ ...t, amount: Number(t.amount) })));
      setLoans(loanRes.data.map(shapeLoan));
      setLoanEvents(eventRes.data.map(shapeEvent));

      const budgetMap = {};
      budgetRes.data.forEach((b) => (budgetMap[b.category] = Number(b.amount)));
      setBudgets(budgetMap);

      let catNames = catRes.data.map((c) => c.name);
      if (catNames.length === 0) {
        // First run for this user: seed default categories. Two loads can race
        // here — StrictMode runs the effect twice, and a second tab seeds in
        // parallel — so ignore rows another writer already inserted rather than
        // letting a duplicate-key error abort the load and leave the list empty.
        const seedRows = DEFAULT_CATEGORIES.map((name) => ({ user_id: userId, name }));
        const { error } = await supabase
          .from("categories")
          .upsert(seedRows, { onConflict: "user_id,name", ignoreDuplicates: true });
        if (error) throw error;
        // Skipped rows come back empty, so re-read to get whatever actually landed.
        const { data: seeded, error: rereadErr } = await supabase
          .from("categories")
          .select("*")
          .order("created_at", { ascending: true });
        if (rereadErr) throw rereadErr;
        catNames = seeded.map((c) => c.name);
      }
      setCategories(catNames);
    } catch (err) {
      setErrorMsg(err.message || "Couldn't load your data.");
    } finally {
      setLoaded(true);
    }
  }, [userId]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const addTransaction = useCallback(
    async ({ date, description, category, amount, type }) => {
      const amt = parseFloat(amount);
      if (!description.trim() || isNaN(amt) || amt <= 0) return false;
      const row = {
        user_id: userId,
        date,
        description: description.trim(),
        category,
        amount: type === "expense" ? -Math.abs(amt) : Math.abs(amt),
      };
      const { data, error } = await supabase.from("transactions").insert(row).select().single();
      if (error) {
        setErrorMsg(error.message);
        return false;
      }
      setTransactions((prev) => [{ ...data, amount: Number(data.amount) }, ...prev]);
      return true;
    },
    [userId]
  );

  const deleteTransaction = useCallback(
    async (id) => {
      let snapshot;
      setTransactions((prev) => {
        snapshot = prev;
        return prev.filter((t) => t.id !== id);
      });
      const { error } = await supabase.from("transactions").delete().eq("id", id);
      if (error) {
        setErrorMsg(error.message);
        if (snapshot) setTransactions(snapshot);
      }
    },
    []
  );

  const setBudget = useCallback(
    async (category, value) => {
      const amt = parseFloat(value);
      const amount = isNaN(amt) ? 0 : amt;
      setBudgets((prev) => ({ ...prev, [category]: amount }));
      const { error } = await supabase
        .from("budgets")
        .upsert({ user_id: userId, category, amount }, { onConflict: "user_id,category" });
      if (error) setErrorMsg(error.message);
    },
    [userId]
  );

  const addCategory = useCallback(
    async (name) => {
      const clean = normalizeCategory(name);
      if (!clean) return false;
      // Compare case-insensitively so "food" doesn't sit next to "Food", but
      // store the name as typed — "iPhone fund" shouldn't become "Iphone Fund".
      let existing;
      setCategories((prev) => {
        existing = prev.find((c) => sameCategory(c, clean));
        return prev;
      });
      if (existing) {
        setErrorMsg(`"${existing}" already exists.`);
        return false;
      }
      const { error } = await supabase.from("categories").insert({ user_id: userId, name: clean });
      if (error) {
        // 23505: the row exists in the database but not in local state. Say so
        // in plain words and adopt it, instead of leaking the constraint name.
        if (error.code === "23505") {
          setErrorMsg(`"${clean}" already exists.`);
          setCategories((prev) => (prev.some((c) => sameCategory(c, clean)) ? prev : [...prev, clean]));
        } else {
          setErrorMsg(error.message);
        }
        return false;
      }
      setCategories((prev) => [...prev, clean]);
      return true;
    },
    [userId]
  );

  const addLoan = useCallback(
    async ({ name, principal, date, notes, interestAmount, durationMonths }) => {
      const amt = parseFloat(principal);
      if (!name.trim() || isNaN(amt) || amt <= 0) return false;

      // Interest and term are both optional — a plain "I owe Kofi ₵200" loan
      // leaves them blank and behaves exactly as it did before.
      const interest = parseFloat(interestAmount);
      const interestAmt = isNaN(interest) || interest <= 0 ? 0 : interest;
      const months = parseInt(durationMonths, 10);
      const term = isNaN(months) || months <= 0 ? null : months;

      const { data: loan, error } = await supabase
        .from("loans")
        .insert({
          user_id: userId,
          name: name.trim(),
          principal: amt,
          date,
          notes: (notes || "").trim(),
          interest_amount: interestAmt,
          duration_months: term,
        })
        .select()
        .single();
      if (error) {
        setErrorMsg(error.message);
        return false;
      }

      // The principal drawn down, plus the agreed interest as a second charge
      // on the same date. Both go in one round trip so a failure can't leave
      // the loan half-recorded.
      const rows = [{ user_id: userId, loan_id: loan.id, type: "taken", amount: amt, date }];
      if (interestAmt > 0) {
        rows.push({ user_id: userId, loan_id: loan.id, type: "interest", amount: interestAmt, date });
      }

      const { data: events, error: evErr } = await supabase.from("loan_events").insert(rows).select();
      if (evErr) {
        setErrorMsg(evErr.message);
        return false;
      }

      setLoans((prev) => [shapeLoan(loan), ...prev]);
      setLoanEvents((prev) => [...events.map(shapeEvent), ...prev]);
      return true;
    },
    [userId]
  );

  const addRepayment = useCallback(
    async ({ loanId, amount, date, penaltyAmount }) => {
      const amt = parseFloat(amount);
      if (!loanId || isNaN(amt) || amt <= 0) return false;

      const pen = parseFloat(penaltyAmount);
      const penalty = isNaN(pen) || pen <= 0 ? 0 : pen;

      // A penalty is a separate charge dated with the repayment, not a slice
      // of it: `amount` stays the cash actually handed over.
      const rows = [{ user_id: userId, loan_id: loanId, type: "repayment", amount: amt, date }];
      if (penalty > 0) {
        rows.push({ user_id: userId, loan_id: loanId, type: "penalty", amount: penalty, date });
      }

      const { data: events, error } = await supabase.from("loan_events").insert(rows).select();
      if (error) {
        setErrorMsg(error.message);
        return false;
      }
      setLoanEvents((prev) => [...events.map(shapeEvent), ...prev]);
      return true;
    },
    [userId]
  );

  const updateCurrency = useCallback(
    async (symbol) => {
      const prev = getCurrency();
      // Set both before the round trip so the whole ledger re-renders in the
      // new currency immediately; roll back together if the write fails.
      setCurrency(symbol);
      setCurrencyState(symbol);
      const { error } = await supabase
        .from("profiles")
        .upsert({ id: userId, currency: symbol }, { onConflict: "id" });
      if (error) {
        setCurrency(prev);
        setCurrencyState(prev);
        setErrorMsg(error.message);
        return false;
      }
      return true;
    },
    [userId]
  );

  const sendFeedback = useCallback(
    async (message, page) => {
      const { error } = await supabase.from("feedback").insert({
        user_id: userId,
        message: message.trim(),
        page,
        user_agent: navigator.userAgent.slice(0, 400),
      });
      if (error) throw error;
    },
    [userId]
  );

  return useMemo(
    () => ({
      loaded,
      errorMsg,
      setErrorMsg,
      transactions,
      loans,
      loanEvents,
      budgets,
      categories,
      currency,
      reload: loadAll,
      addTransaction,
      deleteTransaction,
      setBudget,
      addCategory,
      addLoan,
      addRepayment,
      updateCurrency,
      sendFeedback,
    }),
    [
      loaded, errorMsg, transactions, loans, loanEvents, budgets, categories,
      currency, loadAll, addTransaction, deleteTransaction, setBudget,
      addCategory, addLoan, addRepayment, updateCurrency, sendFeedback,
    ]
  );
}
