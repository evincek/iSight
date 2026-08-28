import React, { useState, useMemo } from "react";
import { tokens, display, numeral, body } from "../theme";
import { fmtMoney, todayISO, dayLabel, addMonths } from "../lib/format";
import * as A from "../lib/analytics";
import { Panel, StatTile, Field, Input, Select, Checkbox, Button, Bar, Empty, AutoGrid } from "../components/primitives";

const BLANK_LOAN = { name: "", principal: "", interestAmount: "", durationMonths: "", date: todayISO(), notes: "" };
const BLANK_REPAY = { loanId: "", amount: "", date: todayISO(), penalty: false, penaltyAmount: "" };

/** The dotted meta line under each loan — only the parts that apply. */
function metaLine(loan, s) {
  const parts = [`Principal ${fmtMoney(loan.principal)}`];
  if (s.interest > 0) parts.push(`interest ${fmtMoney(s.interest)}`);
  if (s.penalties > 0) parts.push(`penalties ${fmtMoney(s.penalties)}`);
  parts.push(`taken ${loan.date}`);
  if (s.dueDate) parts.push(`due ${s.dueDate}`);
  if (loan.notes) parts.push(loan.notes);
  return parts.join(" · ");
}

export default function Loans({ data, month }) {
  const { loans, loanEvents, addLoan, addRepayment } = data;
  const [loanForm, setLoanForm] = useState(BLANK_LOAN);
  const [repayForm, setRepayForm] = useState(BLANK_REPAY);
  const [busy, setBusy] = useState(false);

  const today = todayISO();
  const owed = useMemo(() => A.totalOutstanding(loans, loanEvents), [loans, loanEvents]);
  const summaries = useMemo(
    () => new Map(loans.map((l) => [l.id, A.loanSummary(l, loanEvents, today)])),
    [loans, loanEvents, today]
  );

  const monthEvents = useMemo(() => A.inMonth(loanEvents, month), [loanEvents, month]);
  const sumType = (type) => monthEvents.filter((e) => e.type === type).reduce((s, e) => s + e.amount, 0);
  const taken = sumType("taken");
  const repaid = sumType("repayment");
  const charges = sumType("interest") + sumType("penalty");

  // Live read-back on the loan form, so the total repayable and the due date
  // are visible before the loan is committed rather than only after.
  const preview = useMemo(() => {
    const p = parseFloat(loanForm.principal) || 0;
    const i = parseFloat(loanForm.interestAmount) || 0;
    const m = parseInt(loanForm.durationMonths, 10);
    if (p <= 0) return null;
    return {
      total: p + i,
      hasInterest: i > 0,
      due: m > 0 && loanForm.date ? addMonths(loanForm.date, m) : null,
    };
  }, [loanForm.principal, loanForm.interestAmount, loanForm.durationMonths, loanForm.date]);

  const submitLoan = async (e) => {
    e.preventDefault();
    setBusy(true);
    const ok = await addLoan(loanForm);
    setBusy(false);
    if (ok) setLoanForm({ ...BLANK_LOAN, date: loanForm.date });
  };

  const submitRepay = async (e) => {
    e.preventDefault();
    setBusy(true);
    // An unticked box must never smuggle a stale amount through.
    const ok = await addRepayment({
      ...repayForm,
      penaltyAmount: repayForm.penalty ? repayForm.penaltyAmount : "",
    });
    setBusy(false);
    if (ok) setRepayForm({ ...repayForm, amount: "", penalty: false, penaltyAmount: "" });
  };

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <AutoGrid min={180}>
        <StatTile label="Total outstanding" value={fmtMoney(owed)} tone={owed > 0 ? "bad" : "good"} size={28} />
        <StatTile label="Taken this month" value={fmtMoney(taken)} size={28} />
        <StatTile label="Repaid this month" value={fmtMoney(repaid)} tone="good" size={28} />
        <StatTile
          label="Interest & penalties"
          value={fmtMoney(charges)}
          tone={charges > 0 ? "bad" : "neutral"}
          size={28}
          sub="Charged this month"
        />
      </AutoGrid>

      <AutoGrid min={300}>
        <Panel title="Record a loan">
          <form onSubmit={submitLoan}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(140px, 100%), 1fr))", gap: 12, marginBottom: 14 }}>
              <Field label="Lender / name" span="1 / -1">
                <Input
                  placeholder="Who lent it?" value={loanForm.name}
                  onChange={(e) => setLoanForm({ ...loanForm, name: e.target.value })} required
                />
              </Field>
              <Field label="Amount (₵)">
                <Input
                  type="number" step="0.01" min="0" placeholder="0.00" value={loanForm.principal}
                  onChange={(e) => setLoanForm({ ...loanForm, principal: e.target.value })} required
                />
              </Field>
              <Field label="Date">
                <Input
                  type="date" value={loanForm.date}
                  onChange={(e) => setLoanForm({ ...loanForm, date: e.target.value })} required
                />
              </Field>
              <Field label="Interest (₵)">
                <Input
                  type="number" step="0.01" min="0" placeholder="0.00" value={loanForm.interestAmount}
                  onChange={(e) => setLoanForm({ ...loanForm, interestAmount: e.target.value })}
                />
              </Field>
              <Field label="Term (months)">
                <Input
                  type="number" step="1" min="0" placeholder="e.g. 6" value={loanForm.durationMonths}
                  onChange={(e) => setLoanForm({ ...loanForm, durationMonths: e.target.value })}
                />
              </Field>
              <Field label="Notes" span="1 / -1">
                <Input
                  placeholder="Optional" value={loanForm.notes}
                  onChange={(e) => setLoanForm({ ...loanForm, notes: e.target.value })}
                />
              </Field>
            </div>

            {preview && (preview.hasInterest || preview.due) && (
              <div style={{ ...body(12, tokens.mute), marginBottom: 14 }}>
                {preview.hasInterest && (
                  <>Repayable <span style={numeral(12, tokens.chalk)}>{fmtMoney(preview.total)}</span> including interest</>
                )}
                {preview.hasInterest && preview.due && " · "}
                {preview.due && <>due <span style={numeral(12, tokens.chalk)}>{preview.due}</span></>}
              </div>
            )}

            <Button type="submit" disabled={busy}>Record loan</Button>
            <div style={{ ...body(11.5, tokens.faint), marginTop: 10 }}>
              Interest and term are optional. Interest is charged up front and counts
              towards what's outstanding; the term sets the due date.
            </div>
          </form>
        </Panel>

        <Panel title="Record a repayment">
          {loans.length === 0 ? (
            <Empty>Record a loan first.</Empty>
          ) : (
            <form onSubmit={submitRepay}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(140px, 100%), 1fr))", gap: 12, marginBottom: 14 }}>
                <Field label="Loan" span="1 / -1">
                  <Select
                    value={repayForm.loanId}
                    onChange={(e) => setRepayForm({ ...repayForm, loanId: e.target.value })}
                    required
                  >
                    <option value="">Select a loan…</option>
                    {loans.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name} — {fmtMoney(A.loanOutstanding(loanEvents, l.id))} outstanding
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Amount (₵)">
                  <Input
                    type="number" step="0.01" min="0" placeholder="0.00" value={repayForm.amount}
                    onChange={(e) => setRepayForm({ ...repayForm, amount: e.target.value })} required
                  />
                </Field>
                <Field label="Date">
                  <Input
                    type="date" value={repayForm.date}
                    onChange={(e) => setRepayForm({ ...repayForm, date: e.target.value })} required
                  />
                </Field>
              </div>

              <div style={{ borderTop: `1px solid ${tokens.line}`, paddingTop: 14, marginBottom: 14 }}>
                <Checkbox
                  label="A penalty was applied"
                  hint="A late fee or other charge added to the balance at this repayment."
                  checked={repayForm.penalty}
                  onChange={(e) =>
                    setRepayForm({ ...repayForm, penalty: e.target.checked, penaltyAmount: "" })
                  }
                />
                {repayForm.penalty && (
                  <div style={{ marginTop: 12 }}>
                    <Field label="Penalty amount (₵)">
                      <Input
                        type="number" step="0.01" min="0" placeholder="0.00" autoFocus
                        value={repayForm.penaltyAmount}
                        onChange={(e) => setRepayForm({ ...repayForm, penaltyAmount: e.target.value })}
                        required
                      />
                    </Field>
                    <div style={{ ...body(11.5, tokens.faint), marginTop: 8 }}>
                      Added on top of what's owed. The amount above stays what you actually paid.
                    </div>
                  </div>
                )}
              </div>

              <Button type="submit" disabled={busy}>Record repayment</Button>
            </form>
          )}
        </Panel>
      </AutoGrid>

      <Panel title="Loans">
        {loans.length === 0 ? (
          <Empty>No loans recorded.</Empty>
        ) : (
          <div style={{ display: "grid", gap: 14 }}>
            {loans.map((l) => {
              const s = summaries.get(l.id);
              const status = s.paidOff
                ? { text: "PAID OFF", color: tokens.volt }
                : { text: `${fmtMoney(s.outstanding)} owed`, color: tokens.blood };
              return (
                <div key={l.id} style={{ borderBottom: `1px solid ${tokens.line}`, paddingBottom: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 8, flexWrap: "wrap" }}>
                    <span style={display(17)}>
                      {l.name}
                      {s.overdue && (
                        <span style={{ ...numeral(10, tokens.amber), marginLeft: 8, letterSpacing: "0.1em" }}>
                          OVERDUE
                        </span>
                      )}
                    </span>
                    <span style={numeral(15, status.color)}>{status.text}</span>
                  </div>
                  <Bar pct={s.pct} tone={s.paidOff ? "good" : s.overdue ? "bad" : "warn"} height={6} />
                  <div style={{ ...body(11.5, tokens.faint), marginTop: 6 }}>{metaLine(l, s)}</div>
                  {!s.paidOff && s.dueDate && (
                    <div style={{ ...body(11.5, s.overdue ? tokens.amber : tokens.mute), marginTop: 4 }}>
                      {s.overdue
                        ? `${Math.abs(s.daysLeft)} day${Math.abs(s.daysLeft) === 1 ? "" : "s"} past due (${dayLabel(s.dueDate)})`
                        : `${s.daysLeft} day${s.daysLeft === 1 ? "" : "s"} left — due ${dayLabel(s.dueDate)}`}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Panel>
    </div>
  );
}
