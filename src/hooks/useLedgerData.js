import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "../lib/supabaseClient";

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

  const loadAll = useCallback(async () => {
    setErrorMsg("");
    try {
      const [txRes, loanRes, eventRes, budgetRes, catRes] = await Promise.all([
        supabase.from("transactions").select("*").order("date", { ascending: false }),
        supabase.from("loans").select("*").order("date", { ascending: false }),
        supabase.from("loan_events").select("*").order("date", { ascending: false }),
        supabase.from("budgets").select("*"),
        supabase.from("categories").select("*").order("created_at", { ascending: true }),
      ]);
      for (const r of [txRes, loanRes, eventRes, budgetRes, catRes]) {
        if (r.error) throw r.error;
      }

      setTransactions(txRes.data.map((t) => ({ ...t, amount: Number(t.amount) })));
      setLoans(loanRes.data.map(shapeLoan));
      setLoanEvents(eventRes.data.map(shapeEvent));

      const budgetMap = {};
      budgetRes.data.forEach((b) => (budgetMap[b.category] = Number(b.amount)));
      setBudgets(budgetMap);

      let catNames = catRes.data.map((c) => c.name);
      if (catNames.length === 0) {
        // First run for this user: seed default categories.
        const seedRows = DEFAULT_CATEGORIES.map((name) => ({ user_id: userId, name }));
        const { data: seeded, error } = await supabase.from("categories").insert(seedRows).select();
        if (error) throw error;
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
      const clean = name.trim();
      if (!clean) return false;
      let duplicate = false;
      setCategories((prev) => {
        duplicate = prev.includes(clean);
        return prev;
      });
      if (duplicate) {
        setErrorMsg(`"${clean}" already exists.`);
        return false;
      }
      const { error } = await supabase.from("categories").insert({ user_id: userId, name: clean });
      if (error) {
        setErrorMsg(error.message);
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
      reload: loadAll,
      addTransaction,
      deleteTransaction,
      setBudget,
      addCategory,
      addLoan,
      addRepayment,
      sendFeedback,
    }),
    [
      loaded, errorMsg, transactions, loans, loanEvents, budgets, categories,
      loadAll, addTransaction, deleteTransaction, setBudget, addCategory,
      addLoan, addRepayment, sendFeedback,
    ]
  );
}
