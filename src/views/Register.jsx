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

/* ------------------------------------------------------------------ *
 * Month reconciliation
 *
 * The register is a cash view: the balance column tracks what actually moved
 * through the account, drawdowns included. So the footer has to show the
 * drawdown as its own line rather than folding it into "earned" — it is money
 * in, but it is not income — and the lines then satisfy
 *
 *   closing = opening + earned + loan drawn - out
 *
 * which is exactly the arithmetic the balance column beside them performs.
 * ------------------------------------------------------------------ */
const summaryLines = (s) => [
  { key: "opening", label: "Opening", value: s.opening, tone: tokens.mute },
  { key: "earned", label: "Earned", value: s.earned, tone: tokens.volt, sign: true },
  ...(s.loanDrawn > 0
    ? [{ key: "drawn", label: "Loan drawn", value: s.loanDrawn, tone: tokens.volt, sign: true }]
    : []),
  { key: "out", label: "Out", value: -s.expenses, tone: tokens.blood },
  { key: "net", label: "Net", value: s.net, tone: s.net >= 0 ? tokens.volt : tokens.blood, strong: true },
  { key: "closing", label: "Closing", value: s.closing, tone: tokens.chalk, strong: true },
];

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

  // Balances and totals are computed over the whole month; the filter only
  // narrows what's listed. Filtering first would leave the balance column
  // stepping over rows it can't show and the totals disagreeing with it.
  const summary = useMemo(
    () => A.registerMonth(transactions, loanEvents, loans, month),
    [transactions, loanEvents, loans, month]
  );

  const rows = useMemo(() => {
    if (filter === "expense") return summary.rows.filter((r) => r.amount < 0);
    if (filter === "income") return summary.rows.filter((r) => r.amount > 0);
    return summary.rows;
  }, [summary, filter]);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    const ok = await addTransaction(form);
    setBusy(false);
    if (ok) setForm({ ...form, description: "", amount: "" });
  };

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
              {filter !== "all" && (
                <div style={{ ...body(11, tokens.faint), marginBottom: 8 }}>
                  Showing {filter} only — totals cover the whole month.
                </div>
              )}
              <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", rowGap: 4, columnGap: 12 }}>
                {summaryLines(summary).map((l) => (
                  <React.Fragment key={l.key}>
                    <span style={labelStyle()}>{l.label}</span>
                    <span style={{ ...numeral(l.strong ? 13.5 : 12.5, l.tone), textAlign: "right" }}>
                      {l.sign && l.value > 0 ? "+" : ""}
                      {fmtMoney(l.value)}
                    </span>
                  </React.Fragment>
                ))}
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

              {/* Newest first, so what was carried in from earlier months sits
                  under the oldest row — the figure the column counts up from.
                  Without it the balance beside the first entry of the month
                  looks like it came from nowhere. */}
              {filter === "all" && (
                <div
                  style={{
                    display: "grid", gridTemplateColumns: COLS, gap: 8, alignItems: "center",
                    padding: "10px 0", borderBottom: `1px solid ${tokens.line}`,
                  }}
                >
                  <span />
                  <span style={body(12.5, tokens.faint)}>Opening balance</span>
                  <span /><span />
                  <span style={{ ...numeral(12, tokens.faint), textAlign: "right" }}>
                    {fmtMoney(summary.opening)}
                  </span>
                  <span />
                </div>
              )}

              <div style={{ display: "flex", justifyContent: "space-between", gap: 24, padding: "14px 0 0", alignItems: "flex-start" }}>
                <div>
                  <div style={display(14)}>Month totals</div>
                  {filter !== "all" && (
                    <div style={{ ...body(11, tokens.faint), marginTop: 4 }}>
                      Showing {filter} only — totals cover the whole month.
                    </div>
                  )}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "auto auto", rowGap: 4, columnGap: 16 }}>
                  {summaryLines(summary).map((l) => (
                    <React.Fragment key={l.key}>
                      <span style={labelStyle()}>{l.label}</span>
                      <span style={{ ...numeral(l.strong ? 13 : 12, l.tone), textAlign: "right" }}>
                        {l.sign && l.value > 0 ? "+" : ""}
                        {fmtMoney(l.value)}
                      </span>
                    </React.Fragment>
                  ))}
                </div>
              </div>
            </div>
          </ScrollX>
        )}
      </Panel>
    </div>
  );
}
