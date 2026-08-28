import React, { useMemo, useState } from "react";
import { tokens, display, label as labelStyle, numeral, body } from "../theme";
import { fmtMoney, todayISO } from "../lib/format";
import * as A from "../lib/analytics";
import { useIsNarrow } from "../hooks/useIsNarrow";
import { Panel, Field, Input, Select, Button, Empty, ScrollX } from "../components/primitives";

const COLS = "78px 1fr 108px 100px 100px 28px";

/* ------------------------------------------------------------------ *
 * Narrow layout — one stacked card per entry.
 *
 * The five-column table needs 560px to stay legible, so on a phone it can
 * only be reached by dragging it sideways. Stacking trades the aligned
 * columns for something readable in one thumb-scroll: the two facts you
 * scan for (what, how much) on the first line, the rest demoted below.
 * ------------------------------------------------------------------ */
function EntryCard({ t, onDelete }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr auto 30px",
        alignItems: "center",
        columnGap: 10,
        rowGap: 3,
        padding: "10px 0",
        borderBottom: `1px solid ${tokens.line}`,
      }}
    >
      <span style={{ ...body(13.5), minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {t.description}
      </span>
      <span style={{ ...numeral(13.5, t.amount < 0 ? tokens.blood : tokens.volt), whiteSpace: "nowrap" }}>
        {fmtMoney(t.amount)}
      </span>

      {t.kind === "transaction" ? (
        <button
          onClick={() => onDelete(t.id)}
          aria-label={`Delete ${t.description}`}
          className="tap"
          style={{
            gridRow: "span 2",
            justifySelf: "end",
            background: "none",
            border: "none",
            color: tokens.faint,
            cursor: "pointer",
            fontSize: 20,
            lineHeight: 1,
            padding: 0,
          }}
        >
          ×
        </button>
      ) : (
        <span
          aria-label="Managed on the Loans view"
          style={{ ...numeral(12, tokens.faint), gridRow: "span 2", justifySelf: "center" }}
        >
          ·
        </span>
      )}

      <span style={{ ...numeral(10.5, tokens.faint), minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {t.date.slice(5)} · {t.category}
      </span>
      <span style={{ ...numeral(10.5, tokens.faint), whiteSpace: "nowrap" }}>
        bal {fmtMoney(t.balance)}
      </span>
    </div>
  );
}

export default function Register({ data, month }) {
  const narrow = useIsNarrow();
  const { transactions, loans, loanEvents, categories, addTransaction, deleteTransaction } = data;
  const [form, setForm] = useState({
    date: todayISO(),
    description: "",
    category: "Food",
    amount: "",
    type: "expense",
  });
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState("all");

  const rows = useMemo(() => {
    const all = A.withBalance(transactions, loanEvents, loans).filter((r) => r.date.slice(0, 7) === month);
    if (filter === "expense") return all.filter((r) => r.amount < 0);
    if (filter === "income") return all.filter((r) => r.amount > 0);
    return all;
  }, [transactions, loanEvents, loans, month, filter]);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    const ok = await addTransaction(form);
    setBusy(false);
    if (ok) setForm({ ...form, description: "", amount: "" });
  };

  const totals = useMemo(() => {
    // The same rows the register lists above, so "out" accounts for the loan
    // repayments the user can see in the table — and agrees with the running
    // balance beside them, which has always banked those rows.
    const monthTx = A.inMonth(A.spendingRows(transactions, loanEvents, loans), month);
    return { income: A.sumIncome(monthTx), expenses: A.sumExpenses(monthTx) };
  }, [transactions, loanEvents, loans, month]);

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <Panel title="New entry">
        <form onSubmit={submit}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(min(140px, 100%), 1fr))",
              gap: 12,
              marginBottom: 14,
            }}
          >
            <Field label="Date">
              <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
            </Field>
            <Field label="Type">
              <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                <option value="expense">Expense</option>
                <option value="income">Income</option>
              </Select>
            </Field>
            <Field label="Category">
              <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {categories.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </Select>
            </Field>
            <Field label="Amount (₵)">
              <Input
                type="number" step="0.01" min="0" placeholder="0.00" value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })} required
              />
            </Field>
            <Field label="Description" span="1 / -1">
              <Input
                placeholder="What was it?" value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })} required
              />
            </Field>
          </div>
          <Button type="submit" disabled={busy}>{busy ? "Adding…" : "Add entry"}</Button>
        </form>
      </Panel>

      <Panel
        title="Register"
        action={
          <div style={{ display: "flex", gap: 6 }}>
            {["all", "expense", "income"].map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className="tap"
                style={{
                  background: filter === f ? tokens.volt : "transparent",
                  color: filter === f ? tokens.void : tokens.mute,
                  border: `1px solid ${filter === f ? tokens.volt : tokens.line}`,
                  padding: "4px 9px",
                  fontSize: 9.5,
                  fontWeight: 700,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  cursor: "pointer",
                  fontFamily: "'Inter', sans-serif",
                }}
              >
                {f}
              </button>
            ))}
          </div>
        }
      >
        {rows.length === 0 ? (
          <Empty>No entries for this month.</Empty>
        ) : narrow ? (
          <div>
            {rows.map((t) => (
              <EntryCard key={t.id} t={t} onDelete={deleteTransaction} />
            ))}

            <div style={{ paddingTop: 12 }}>
              <div style={{ ...display(14), marginBottom: 6 }}>Month totals</div>
              <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", rowGap: 4, columnGap: 12 }}>
                <span style={labelStyle()}>In</span>
                <span style={{ ...numeral(12.5, tokens.volt), textAlign: "right" }}>
                  +{fmtMoney(totals.income)}
                </span>
                <span style={labelStyle()}>Out</span>
                <span style={{ ...numeral(12.5, tokens.blood), textAlign: "right" }}>
                  {fmtMoney(totals.expenses)}
                </span>
                <span style={labelStyle()}>Net</span>
                <span
                  style={{
                    ...numeral(13.5, totals.income - totals.expenses >= 0 ? tokens.volt : tokens.blood),
                    textAlign: "right",
                  }}
                >
                  {fmtMoney(totals.income - totals.expenses)}
                </span>
                <span style={labelStyle()}>Balance</span>
                <span style={{ ...numeral(13.5, tokens.chalk), textAlign: "right" }}>
                  {rows.length > 0 ? fmtMoney(rows[0].balance) : "—"}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <ScrollX min={560}>
            <div>
              <div
                style={{
                  display: "grid", gridTemplateColumns: COLS, gap: 8,
                  padding: "0 0 8px", borderBottom: `1px solid ${tokens.lineHi}`, ...labelStyle(),
                }}
              >
                <span>Date</span><span>Description</span><span>Category</span>
                <span style={{ textAlign: "right" }}>Amount</span>
                <span style={{ textAlign: "right" }}>Balance</span><span />
              </div>

              {rows.map((t) => (
                <div
                  key={t.id}
                  style={{
                    display: "grid", gridTemplateColumns: COLS, gap: 8, alignItems: "center",
                    padding: "10px 0", borderBottom: `1px solid ${tokens.line}`,
                  }}
                >
                  <span style={numeral(11.5, tokens.faint)}>{t.date.slice(5)}</span>
                  <span style={{ ...body(12.5), overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {t.description}
                  </span>
                  <span style={{ ...body(11.5, tokens.mute), overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {t.category}
                  </span>
                  <span style={{ ...numeral(12, t.amount < 0 ? tokens.blood : tokens.volt), textAlign: "right" }}>
                    {fmtMoney(t.amount)}
                  </span>
                  <span style={{ ...numeral(12, tokens.mute), textAlign: "right" }}>{fmtMoney(t.balance)}</span>
                  {t.kind === "transaction" ? (
                    <button
                      onClick={() => deleteTransaction(t.id)}
                      aria-label={`Delete ${t.description}`}
                      style={{
                        background: "none", border: "none", color: tokens.faint,
                        cursor: "pointer", fontSize: 16, padding: 0, lineHeight: 1,
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = tokens.blood)}
                      onMouseLeave={(e) => (e.currentTarget.style.color = tokens.faint)}
                    >
                      ×
                    </button>
                  ) : (
                    <span
                      title="Loan entries are managed on the Loans view"
                      aria-label="Managed on the Loans view"
                      style={{ ...numeral(12, tokens.faint), textAlign: "center" }}
                    >
                      ·
                    </span>
                  )}
                </div>
              ))}

              <div style={{ display: "grid", gridTemplateColumns: COLS, gap: 8, padding: "12px 0 0", alignItems: "baseline" }}>
                <span />
                <span>
                  <span style={display(14)}>Month totals</span>
                  <span style={{ ...body(11, tokens.faint), marginLeft: 10 }}>
                    <span style={{ color: tokens.volt }}>+{fmtMoney(totals.income)}</span>
                    {" in · "}
                    <span style={{ color: tokens.blood }}>{fmtMoney(totals.expenses)}</span>
                    {" out"}
                  </span>
                </span>
                <span />
                <span
                  style={{
                    ...numeral(13, totals.income - totals.expenses >= 0 ? tokens.volt : tokens.blood),
                    textAlign: "right",
                  }}
                >
                  {fmtMoney(totals.income - totals.expenses)}
                </span>
                <span style={{ ...numeral(13, tokens.chalk), textAlign: "right" }}>
                  {rows.length > 0 ? fmtMoney(rows[0].balance) : "—"}
                </span>
                <span />
              </div>
            </div>
          </ScrollX>
        )}
      </Panel>
    </div>
  );
}
