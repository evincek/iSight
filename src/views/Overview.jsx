import React, { useMemo } from "react";
import {
  ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import { tokens, display, label as labelStyle, numeral, body } from "../theme";
import { chart, axisProps, gridProps, tooltipStyle, legendProps } from "../lib/chartTheme";
import { fmtMoney, fmtCompact, monthLabel, shiftMonth } from "../lib/format";
import * as A from "../lib/analytics";
import { useIsNarrow } from "../hooks/useIsNarrow";
import { Panel, Delta, Bar, Empty, ScrollX, AutoGrid } from "../components/primitives";

export default function Overview({ data, month, onView }) {
  const narrow = useIsNarrow();
  const { transactions, loans, loanEvents, budgets } = data;

  const monthTx = useMemo(() => A.inMonth(transactions, month), [transactions, month]);
  const income = A.sumIncome(monthTx);
  const expenses = A.sumExpenses(monthTx);
  const net = income - expenses;

  const prevKey = shiftMonth(month, -1);
  const prevTx = useMemo(() => A.inMonth(transactions, prevKey), [transactions, prevKey]);
  const prevExpenses = A.sumExpenses(prevTx);
  const prevIncome = A.sumIncome(prevTx);

  const expenseChange = A.pctChange(expenses, prevExpenses);
  const incomeChange = A.pctChange(income, prevIncome);
  const owed = useMemo(() => A.totalOutstanding(loans, loanEvents), [loans, loanEvents]);

  const cats = useMemo(() => A.byCategory(monthTx), [monthTx]);
  const catRows = useMemo(
    () => Object.entries(cats).sort((a, b) => b[1] - a[1]),
    [cats]
  );

  const trend = useMemo(() => A.trendSeries(transactions, month, 6), [transactions, month]);
  const insights = useMemo(
    () => A.buildInsights({ transactions, loans, loanEvents, budgets, key: month }),
    [transactions, loans, loanEvents, budgets, month]
  );

  const register = useMemo(
    () => A.withBalance(transactions, loanEvents, loans).filter((r) => r.date.slice(0, 7) === month),
    [transactions, loanEvents, loans, month]
  );

  const savingsRate = income > 0 ? (net / income) * 100 : null;

  return (
    <div style={{ display: "grid", gap: 14 }}>
      {/* ---- Hero: the month's net, the single largest thing on screen ---- */}
      <section
        style={{
          border: `1px solid ${tokens.line}`,
          background: tokens.panel,
          padding: "clamp(18px, 3vw, 30px)",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(min(230px, 100%), 1fr))",
          gap: 24,
          alignItems: "end",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ ...labelStyle(), marginBottom: 12 }}>Net · {monthLabel(month)}</div>
          <div
            style={{
              ...display("clamp(44px, 8vw, 84px)", net >= 0 ? tokens.volt : tokens.blood),
              fontFamily: "'Anton', sans-serif",
              wordBreak: "break-word",
            }}
          >
            {fmtMoney(net)}
          </div>
          {savingsRate !== null && (
            <div style={{ ...body(12, tokens.mute), marginTop: 12 }}>
              Savings rate{" "}
              <span style={numeral(12, savingsRate >= 0 ? tokens.volt : tokens.blood)}>
                {savingsRate.toFixed(0)}%
              </span>
            </div>
          )}
        </div>

        <div style={{ display: "grid", gap: 10 }}>
          {[
            { k: "Income", v: income, prev: prevIncome, pct: incomeChange, invert: false },
            { k: "Expenses", v: expenses, prev: prevExpenses, pct: expenseChange, invert: true },
          ].map((r) => (
            <div
              key={r.k}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                gap: 12,
                paddingBottom: 8,
                borderBottom: `1px solid ${tokens.line}`,
              }}
            >
              <span style={labelStyle()}>{r.k}</span>
              <span style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                <span style={numeral(19)}>{fmtMoney(r.v)}</span>
                <Delta pct={r.pct} invert={r.invert} />
              </span>
            </div>
          ))}
          {owed > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
              <span style={labelStyle()}>Loans owed</span>
              <span style={numeral(19, tokens.blood)}>{fmtMoney(owed)}</span>
            </div>
          )}
        </div>
      </section>

      {/* ---- Trend + categories ---- */}
      <AutoGrid min={300}>
        <Panel
          title="6-month flow"
          style={{ gridColumn: "span 1" }}
          action={<span style={labelStyle()}>₵</span>}
        >
          <ScrollX min={280} fluid>
            {/* Taller on a phone, not shorter: the legend wraps to two lines
                and ScrollX clips whatever overflows the box. */}
            <div style={{ width: "100%", height: narrow ? 224 : 210 }}>
              <ResponsiveContainer>
                <ComposedChart data={trend} margin={{ top: 4, right: 4, left: -14, bottom: 0 }}>
                  <defs>
                    <linearGradient id="netFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={chart.net} stopOpacity={0.28} />
                      <stop offset="100%" stopColor={chart.net} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid {...gridProps} />
                  <XAxis dataKey="month" {...axisProps} minTickGap={narrow ? 16 : 5} />
                  <YAxis {...axisProps} width={52} tickFormatter={fmtCompact} />
                  <Tooltip {...tooltipStyle} formatter={(v, n) => [fmtMoney(v), n]} />
                  <Legend
                    {...legendProps}
                    payload={[
                      { value: "Income", type: "line", color: chart.income },
                      { value: "Expenses", type: "line", color: chart.expense },
                      { value: "Net", type: "line", color: chart.net },
                    ]}
                  />
                  <Area
                    type="monotone" dataKey="Net" stroke={chart.net} strokeWidth={2}
                    fill="url(#netFill)" dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: tokens.panel }}
                  />
                  <Line
                    type="monotone" dataKey="Income" stroke={chart.income} strokeWidth={2}
                    dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: tokens.panel }}
                  />
                  <Line
                    type="monotone" dataKey="Expenses" stroke={chart.expense} strokeWidth={2}
                    dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: tokens.panel }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </ScrollX>
        </Panel>

        <Panel title="Where it went">
          {catRows.length === 0 ? (
            <Empty>No expenses logged this month yet.</Empty>
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              {catRows.slice(0, 7).map(([cat, amt]) => {
                const budget = budgets[cat] || 0;
                const over = budget > 0 && amt > budget;
                const pct = budget > 0 ? (amt / budget) * 100 : expenses > 0 ? (amt / expenses) * 100 : 0;
                return (
                  <div key={cat}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 5 }}>
                      <span style={body(12.5)}>{cat}</span>
                      <span style={numeral(11.5, over ? tokens.blood : tokens.mute)}>
                        {fmtMoney(amt)}
                        {budget > 0 && <span style={{ color: tokens.faint }}> / {fmtMoney(budget)}</span>}
                      </span>
                    </div>
                    <Bar pct={pct} tone={over ? "bad" : "good"} height={6} />
                  </div>
                );
              })}
            </div>
          )}
        </Panel>
      </AutoGrid>

      {/* ---- Insights + recent ---- */}
      <AutoGrid min={300}>
        <Panel
          title="Signals"
          action={
            <button
              onClick={() => onView("analytics")}
              className="tap"
              style={{
                background: "none", border: "none", color: tokens.volt, cursor: "pointer",
                fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase",
                fontFamily: "'Inter', sans-serif", padding: 0,
              }}
            >
              All analytics →
            </button>
          }
        >
          <div style={{ display: "grid", gap: 2 }}>
            {insights.map((ins, i) => (
              <div
                key={i}
                style={{
                  display: "flex", gap: 10, alignItems: "flex-start", padding: "9px 0",
                  borderTop: i === 0 ? "none" : `1px solid ${tokens.line}`,
                }}
              >
                <span
                  aria-hidden
                  style={{
                    color: ins.tone === "good" ? tokens.volt : ins.tone === "bad" ? tokens.blood : tokens.mute,
                    fontSize: 11, lineHeight: "18px",
                  }}
                >
                  {ins.tone === "good" ? "✓" : ins.tone === "bad" ? "!" : "▪"}
                </span>
                <span style={body(13)}>{ins.text}</span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel
          title="Recent"
          action={
            <button
              onClick={() => onView("register")}
              className="tap"
              style={{
                background: "none", border: "none", color: tokens.volt, cursor: "pointer",
                fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase",
                fontFamily: "'Inter', sans-serif", padding: 0,
              }}
            >
              Full register →
            </button>
          }
        >
          {register.length === 0 ? (
            <Empty>Nothing logged this month yet.</Empty>
          ) : (
            <div>
              {register.slice(0, 7).map((t, i) => (
                <div
                  key={t.id}
                  style={{
                    display: "flex", justifyContent: "space-between", gap: 12, padding: "9px 0",
                    borderTop: i === 0 ? "none" : `1px solid ${tokens.line}`,
                  }}
                >
                  <span style={{ ...body(12.5), minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    <span style={{ ...numeral(11, tokens.faint), marginRight: 8 }}>{t.date.slice(8)}</span>
                    {t.description}
                  </span>
                  <span style={numeral(12.5, t.amount < 0 ? tokens.blood : tokens.volt)}>{fmtMoney(t.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </AutoGrid>
    </div>
  );
}
