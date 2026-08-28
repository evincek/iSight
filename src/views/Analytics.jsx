import React, { useMemo, useState } from "react";
import {
  ResponsiveContainer, AreaChart, Area, LineChart, Line, BarChart, Bar as RBar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine, Cell,
} from "recharts";
import { tokens, display, label as labelStyle, numeral, body } from "../theme";
import { chart, axisProps, gridProps, tooltipStyle, legendProps, MAX_SERIES } from "../lib/chartTheme";
import { fmtMoney, fmtCompact, monthLabel, shiftMonth, daysInMonth, dayLabel } from "../lib/format";
import * as A from "../lib/analytics";
import { alignBudgets } from "../lib/categories";
import { useIsNarrow } from "../hooks/useIsNarrow";
import { Panel, StatTile, Delta, Bar, Empty, ScrollX, Select, AutoGrid } from "../components/primitives";

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

const CMP_COLS = "1.3fr 92px 92px 1fr 78px";
const RECUR_COLS = "1.6fr 1fr 90px 110px";

/* ------------------------------------------------------------------ *
 * Month-over-month comparison table
 * ------------------------------------------------------------------ */
function ComparisonTable({ cmp, currKey, prevKey, narrow }) {
  // Scale bars against the largest single value in either column.
  const max = Math.max(1, ...cmp.rows.map((r) => Math.max(r.current, r.previous)));

  if (cmp.rows.length === 0) return <Empty>No spending in either month to compare.</Empty>;

  // Five columns need 520px. Rather than make a phone drag the table
  // sideways, restate each row as a block: the category and its change on
  // one line, the two figures and their paired bars beneath.
  if (narrow) {
    return (
      <div style={{ display: "grid", gap: 14 }}>
        {cmp.rows.map((r) => {
          const flat = Math.abs(r.delta) < 0.005;
          const barColor = flat ? tokens.mute : r.delta > 0 ? chart.up : chart.down;
          return (
            <div key={r.category} style={{ borderBottom: `1px solid ${tokens.line}`, paddingBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 6 }}>
                <span style={{ ...body(13), minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {r.category}
                </span>
                <Delta pct={r.pct} invert size={12} />
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
                <span style={numeral(11.5, tokens.mute)}>{fmtMoney(r.previous)}</span>
                <span style={{ ...body(11, tokens.faint) }}>→</span>
                <span style={numeral(13)}>{fmtMoney(r.current)}</span>
              </div>
              <div style={{ display: "grid", gap: 3 }}>
                <span style={{ height: 5, background: tokens.void, border: `1px solid ${tokens.line}` }}>
                  <span style={{ display: "block", height: "100%", width: `${(r.previous / max) * 100}%`, background: chart.mid }} />
                </span>
                <span style={{ height: 5, background: tokens.void, border: `1px solid ${tokens.line}` }}>
                  <span style={{ display: "block", height: "100%", width: `${(r.current / max) * 100}%`, background: barColor }} />
                </span>
              </div>
            </div>
          );
        })}

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <span style={display(14)}>Total</span>
          <span style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span style={numeral(11.5, tokens.mute)}>{fmtMoney(cmp.prevTotal)}</span>
            <span style={{ ...body(11, tokens.faint) }}>→</span>
            <span style={numeral(13.5)}>{fmtMoney(cmp.currTotal)}</span>
            <Delta pct={cmp.pct} invert size={12} />
          </span>
        </div>
      </div>
    );
  }

  return (
    <ScrollX min={520}>
      <div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: CMP_COLS,
            gap: 10,
            padding: "0 0 8px",
            borderBottom: `1px solid ${tokens.lineHi}`,
            ...labelStyle(),
          }}
        >
          <span>Category</span>
          <span style={{ textAlign: "right" }}>{monthLabel(prevKey).slice(0, 3)}</span>
          <span style={{ textAlign: "right" }}>{monthLabel(currKey).slice(0, 3)}</span>
          <span>Shift</span>
          <span style={{ textAlign: "right" }}>Change</span>
        </div>

        {cmp.rows.map((r) => {
          const flat = Math.abs(r.delta) < 0.005;
          const barColor = flat ? tokens.mute : r.delta > 0 ? chart.up : chart.down;
          return (
            <div
              key={r.category}
              style={{
                display: "grid",
                gridTemplateColumns: CMP_COLS,
                gap: 10,
                alignItems: "center",
                padding: "10px 0",
                borderBottom: `1px solid ${tokens.line}`,
              }}
            >
              <span style={{ ...body(12.5), overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {r.category}
              </span>
              <span style={{ ...numeral(11.5, tokens.mute), textAlign: "right" }}>{fmtMoney(r.previous)}</span>
              <span style={{ ...numeral(12), textAlign: "right" }}>{fmtMoney(r.current)}</span>

              {/* Paired bars: last month recessive, this month solid. */}
              <span style={{ display: "grid", gap: 3 }}>
                <span style={{ height: 5, background: tokens.void, border: `1px solid ${tokens.line}` }}>
                  <span
                    style={{ display: "block", height: "100%", width: `${(r.previous / max) * 100}%`, background: chart.mid }}
                  />
                </span>
                <span style={{ height: 5, background: tokens.void, border: `1px solid ${tokens.line}` }}>
                  <span
                    style={{
                      display: "block", height: "100%", width: `${(r.current / max) * 100}%`,
                      background: barColor,
                    }}
                  />
                </span>
              </span>

              <span style={{ textAlign: "right" }}>
                <Delta pct={r.pct} invert />
              </span>
            </div>
          );
        })}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: CMP_COLS,
            gap: 10,
            alignItems: "center",
            padding: "12px 0 0",
          }}
        >
          <span style={{ ...display(14) }}>Total</span>
          <span style={{ ...numeral(12, tokens.mute), textAlign: "right" }}>{fmtMoney(cmp.prevTotal)}</span>
          <span style={{ ...numeral(13.5, tokens.chalk), textAlign: "right" }}>{fmtMoney(cmp.currTotal)}</span>
          <span />
          <span style={{ textAlign: "right" }}>
            <Delta pct={cmp.pct} invert size={12} />
          </span>
        </div>
      </div>
    </ScrollX>
  );
}

/* ------------------------------------------------------------------ *
 * Daily spend heatmap
 * ------------------------------------------------------------------ */
function Heatmap({ heat, month, dailyBudget }) {
  const [hover, setHover] = useState(null);

  const colorFor = (amount) => {
    if (amount === 0) return tokens.void;
    if (heat.max === 0) return tokens.void;
    const ratio = amount / heat.max;
    const idx = Math.min(chart.heat.length - 1, Math.floor(ratio * chart.heat.length));
    return chart.heat[idx];
  };

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 6 }}>
        {WEEKDAYS.map((d, i) => (
          <div key={i} style={{ ...labelStyle(tokens.faint), textAlign: "center", fontSize: 9 }}>{d}</div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
        {heat.days.map((d, i) =>
          d === null ? (
            <div key={`pad-${i}`} />
          ) : (
            <div
              key={d.date}
              onMouseEnter={() => setHover(d)}
              onMouseLeave={() => setHover(null)}
              // Touch has no hover, so the readout below would never fill in.
              onClick={() => setHover((h) => (h && h.date === d.date ? null : d))}
              title={`${dayLabel(d.date)} — ${fmtMoney(d.amount)}`}
              style={{
                aspectRatio: "1",
                background: colorFor(d.amount),
                border: `1px solid ${
                  dailyBudget > 0 && d.amount > dailyBudget ? chart.up : tokens.line
                }`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "default",
                position: "relative",
              }}
            >
              <span
                style={{
                  ...numeral(
                    9,
                    d.amount === 0
                      ? tokens.faint
                      : d.amount / (heat.max || 1) > 0.55
                      ? tokens.void
                      : tokens.chalk
                  ),
                  fontWeight: 600,
                }}
              >
                {d.day}
              </span>
            </div>
          )
        )}
      </div>

      <div
        style={{
          marginTop: 12,
          paddingTop: 10,
          borderTop: `1px solid ${tokens.line}`,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ ...body(11.5, tokens.mute), minHeight: 16 }}>
          {hover
            ? `${dayLabel(hover.date)} — ${fmtMoney(hover.amount)}`
            : heat.busiest
            ? `Heaviest day: ${heat.busiest[0]} ${monthLabel(month).split(" ")[0]} — ${fmtMoney(Number(heat.busiest[1]))}`
            : "No spending logged this month."}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ ...labelStyle(tokens.faint), fontSize: 9 }}>Low</span>
          {chart.heat.map((c) => (
            <span key={c} style={{ width: 13, height: 9, background: c, border: `1px solid ${tokens.line}` }} />
          ))}
          <span style={{ ...labelStyle(tokens.faint), fontSize: 9 }}>High</span>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Main view
 * ------------------------------------------------------------------ */
export default function Analytics({ data, month }) {
  const narrow = useIsNarrow();
  const { transactions, budgets, categories } = data;
  const [span, setSpan] = useState(6);

  // One budget per category, keyed by the live spelling — case-variant rows
  // fold together instead of both counting toward the plan.
  const plan = useMemo(() => alignBudgets(budgets, categories), [budgets, categories]);

  // Charts reflow rather than scroll on a phone. Two consequences: the legend
  // wraps to a second line, so the box needs to be *taller* than on desktop
  // (ScrollX clips vertically, and a clipped legend is worse than a shorter
  // plot); and month labels need a wider gap before Recharts drops every
  // other one. The value axis keeps its width — 52px is what "₵8.0k" needs,
  // and shaving it clips the tick to ".0k".
  const chartH = narrow ? 254 : 240;
  const tickGap = narrow ? 16 : 5;

  const prevKey = shiftMonth(month, -1);
  const cmp = useMemo(() => A.monthComparison(transactions, month, prevKey), [transactions, month, prevKey]);
  const verdict = useMemo(() => A.comparisonVerdict(cmp, month, prevKey), [cmp, month, prevKey]);

  const trend = useMemo(() => A.trendSeries(transactions, month, span), [transactions, month, span]);
  const ct = useMemo(
    () => A.categoryTrends(transactions, month, span, MAX_SERIES),
    [transactions, month, span]
  );
  const avgs = useMemo(() => A.rollingAverages(transactions, month), [transactions, month]);
  const heat = useMemo(() => A.dailySpend(transactions, month), [transactions, month]);
  const burn = useMemo(() => A.budgetBurn(transactions, plan, month), [transactions, plan, month]);
  const fc = useMemo(() => A.forecast(transactions, month, plan), [transactions, plan, month]);
  const recurring = useMemo(() => A.detectRecurring(transactions), [transactions]);

  const budgetTotal = useMemo(
    () => Object.values(plan).reduce((s, v) => s + (v || 0), 0),
    [plan]
  );
  const curve = useMemo(
    () => A.burnCurve(transactions, month, budgetTotal),
    [transactions, month, budgetTotal]
  );

  const recurringMonthly = recurring.reduce((s, r) => s + r.amount, 0);
  const dailyBudget = budgetTotal > 0 ? budgetTotal / daysInMonth(month) : 0;

  const spanPicker = (
    <Select
      value={span}
      onChange={(e) => setSpan(Number(e.target.value))}
      aria-label="Months to chart"
      style={{ width: narrow ? 112 : 108, padding: "6px 8px", fontSize: 11 }}
    >
      <option value={3}>3 months</option>
      <option value={6}>6 months</option>
      <option value={12}>12 months</option>
    </Select>
  );

  return (
    <div style={{ display: "grid", gap: 14 }}>
      {/* ---- Verdict ---- */}
      <section style={{ border: `1px solid ${tokens.line}`, background: tokens.panel, padding: "20px 22px" }}>
        <div style={{ ...labelStyle(), marginBottom: 10 }}>The headline</div>
        <div style={{ ...display("clamp(21px, 3.4vw, 34px)"), maxWidth: "60ch" }}>{verdict}</div>
        {cmp.biggestMover && cmp.prevTotal > 0 && (
          <div style={{ ...body(12.5, tokens.mute), marginTop: 12 }}>
            Biggest single shift:{" "}
            <span style={{ color: tokens.chalk }}>{cmp.biggestMover.category}</span>{" "}
            {cmp.biggestMover.delta > 0 ? "up" : "down"}{" "}
            <span style={numeral(12.5, cmp.biggestMover.delta > 0 ? chart.up : chart.down)}>
              {fmtMoney(Math.abs(cmp.biggestMover.delta))}
            </span>
          </div>
        )}
      </section>

      {/* ---- Forecast tiles ---- */}
      <AutoGrid min={180}>
        <StatTile label="Spent so far" value={fmtMoney(fc.spent)} size={26} />
        <StatTile
          label={fc.complete ? "Month total" : "Projected total"}
          value={fmtMoney(fc.projected)}
          size={26}
          tone={fc.budgetTotal > 0 ? (fc.projected > fc.budgetTotal ? "bad" : "good") : "neutral"}
          sub={
            fc.complete
              ? "Month complete"
              : `Day ${fc.elapsed} of ${fc.total} · ${fc.basis === "recurring-adjusted" ? "recurring-adjusted" : "burn rate"}`
          }
        />
        <StatTile
          label="Budget"
          value={budgetTotal > 0 ? fmtMoney(budgetTotal) : "—"}
          size={26}
          sub={
            budgetTotal > 0 && fc.overBudgetBy != null
              ? fc.overBudgetBy > 0
                // A finished month is a result, not a projection.
                ? `${fc.complete ? "Finished" : "On pace for"} ${fmtMoney(fc.overBudgetBy)} over`
                : `${fmtMoney(Math.abs(fc.overBudgetBy))} ${fc.complete ? "under" : "of headroom"}`
              : "Set budgets to track pace"
          }
        />
        <StatTile
          label="Committed monthly"
          value={recurringMonthly > 0 ? fmtMoney(recurringMonthly) : "—"}
          size={26}
          // A coloured em-dash reads as a stray rule; only tint a real value.
          tone={recurringMonthly > 0 ? "info" : "neutral"}
          sub={`${recurring.length} recurring charge${recurring.length === 1 ? "" : "s"} detected`}
        />
      </AutoGrid>

      {/* ---- MoM comparison ---- */}
      <Panel title={`${monthLabel(prevKey)} → ${monthLabel(month)}`}>
        <ComparisonTable cmp={cmp} currKey={month} prevKey={prevKey} narrow={narrow} />
      </Panel>

      {/* ---- Trend + rolling averages ---- */}
      <Panel title="Spend over time" action={spanPicker}>
        <ScrollX min={320} fluid>
          <div style={{ width: "100%", height: chartH }}>
            <ResponsiveContainer>
              <LineChart data={trend} margin={{ top: 6, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="month" {...axisProps} minTickGap={tickGap} />
                <YAxis {...axisProps} width={52} tickFormatter={fmtCompact} />
                <Tooltip {...tooltipStyle} formatter={(v, n) => [fmtMoney(v), n]} />
                <Legend {...legendProps} />
                {avgs.avg6 > 0 && (
                  <ReferenceLine
                    y={avgs.avg6}
                    stroke={tokens.mute}
                    strokeDasharray="4 4"
                    label={{
                      value: `6-mo avg ${fmtCompact(avgs.avg6)}`,
                      position: "insideTopRight",
                      fill: tokens.mute,
                      fontSize: 9,
                      fontFamily: "'JetBrains Mono', monospace",
                    }}
                  />
                )}
                <Line type="monotone" dataKey="Income" stroke={chart.income} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: tokens.panel }} />
                <Line type="monotone" dataKey="Expenses" stroke={chart.expense} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: tokens.panel }} />
                <Line type="monotone" dataKey="Net" stroke={chart.net} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: tokens.panel }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </ScrollX>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 10,
            marginTop: 12,
            paddingTop: 12,
            borderTop: `1px solid ${tokens.line}`,
          }}
        >
          {[["3-mo avg", avgs.avg3], ["6-mo avg", avgs.avg6], ["12-mo avg", avgs.avg12]].map(([k, v]) => (
            <div key={k}>
              <div style={{ ...labelStyle(), marginBottom: 4 }}>{k}</div>
              <div style={numeral(14)}>{fmtMoney(v)}</div>
            </div>
          ))}
        </div>
      </Panel>

      {/* ---- Charts: two ~equal-height plots side by side ---- */}
      <AutoGrid min={320} style={{ alignItems: "start" }}>
        <Panel title="Category trends">
          {ct.categories.length === 0 ? (
            <Empty>No categorised spending yet.</Empty>
          ) : (
            <ScrollX min={300} fluid>
              <div style={{ width: "100%", height: chartH }}>
                <ResponsiveContainer>
                  <AreaChart data={ct.data} margin={{ top: 6, right: 8, left: -12, bottom: 0 }}>
                    <CartesianGrid {...gridProps} />
                    <XAxis dataKey="month" {...axisProps} minTickGap={tickGap} />
                    <YAxis {...axisProps} width={52} tickFormatter={fmtCompact} />
                    <Tooltip {...tooltipStyle} formatter={(v, n) => [fmtMoney(v), n]} />
                    <Legend {...legendProps} />
                    {ct.categories.map((c, i) => (
                      <Area
                        key={c}
                        type="monotone"
                        dataKey={c}
                        stackId="cats"
                        stroke={chart.series[i]}
                        fill={chart.series[i]}
                        fillOpacity={0.75}
                        // 2px surface gap between stacked segments.
                        strokeWidth={2}
                        strokeOpacity={1}
                      />
                    ))}
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </ScrollX>
          )}
        </Panel>

        <Panel title="Burn-down">
          {budgetTotal === 0 ? (
            <Empty>Set budgets to see pace against plan.</Empty>
          ) : (
            <ScrollX min={300} fluid>
              <div style={{ width: "100%", height: chartH }}>
                <ResponsiveContainer>
                  <LineChart data={curve} margin={{ top: 6, right: 8, left: -12, bottom: 0 }}>
                    <CartesianGrid {...gridProps} />
                    <XAxis dataKey="day" {...axisProps} minTickGap={tickGap} />
                    <YAxis {...axisProps} width={52} tickFormatter={fmtCompact} />
                    <Tooltip
                      {...tooltipStyle}
                      formatter={(v, n) => [v === null ? "—" : fmtMoney(v), n === "actual" ? "Actual" : "Budget pace"]}
                      labelFormatter={(d) => `Day ${d}`}
                    />
                    <Legend {...legendProps} formatter={(v) => (v === "actual" ? "Actual" : "Budget pace")} />
                    <Line type="linear" dataKey="pace" stroke={tokens.mute} strokeWidth={2} strokeDasharray="4 4" dot={false} />
                    <Line
                      type="monotone" dataKey="actual" stroke={chart.expense} strokeWidth={2}
                      dot={false} connectNulls={false} activeDot={{ r: 4, strokeWidth: 2, stroke: tokens.panel }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </ScrollX>
          )}
        </Panel>
      </AutoGrid>

      {/* ---- Dense panels: calendar + per-category pace ---- */}
      <AutoGrid min={320} style={{ alignItems: "start" }}>
        <Panel title="Daily rhythm">
          <Heatmap heat={heat} month={month} dailyBudget={dailyBudget} />
        </Panel>

        <Panel title="Pace by category">
          {burn.length === 0 ? (
            <Empty>No budgets set yet.</Empty>
          ) : (
            <div style={{ display: "grid", gap: 13 }}>
              {burn.map((b) => (
                <div key={b.category}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "baseline",
                      // "72% used · 61% elapsed" next to a long category name
                      // overflows a phone; let the figures drop below instead.
                      flexWrap: "wrap",
                      gap: 8,
                      marginBottom: 5,
                    }}
                  >
                    <span style={body(12.5)}>{b.category}</span>
                    <span style={numeral(11, b.over ? tokens.blood : b.projectedOver ? tokens.amber : tokens.mute)}>
                      {b.pctUsed.toFixed(0)}% used · {b.pctElapsed.toFixed(0)}% elapsed
                    </span>
                  </div>
                  <div style={{ position: "relative" }}>
                    <Bar pct={b.pctUsed} tone={b.over ? "bad" : b.projectedOver ? "warn" : "good"} height={8} />
                    {/* Pace marker: where spend should be today. */}
                    <div
                      aria-hidden
                      title="Expected pace"
                      style={{
                        position: "absolute", top: -2, bottom: -2,
                        left: `${Math.min(100, b.pctElapsed)}%`,
                        width: 2, background: tokens.chalk,
                      }}
                    />
                  </div>
                  <div style={{ ...body(11, tokens.faint), marginTop: 4 }}>
                    {fmtMoney(b.spent)} of {fmtMoney(b.budget)}
                    {!b.over && b.projectedOver && ` · on pace for ${fmtMoney(b.projected)}`}
                    {b.over && ` · over by ${fmtMoney(b.spent - b.budget)}`}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </AutoGrid>

      {/* ---- Recurring ---- */}
      <Panel title="Recurring charges">
        {recurring.length === 0 ? (
          <Empty>
            Nothing detected yet — needs 3+ similar charges about a month apart.
          </Empty>
        ) : narrow ? (
          <div style={{ display: "grid", gap: 12 }}>
            {recurring.map((r) => (
              <div key={r.key} style={{ borderBottom: `1px solid ${tokens.line}`, paddingBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 4 }}>
                  <span style={{ ...body(13), minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {r.label}
                    {r.dueSoon && (
                      <span style={{ ...labelStyle(tokens.amber), marginLeft: 8, fontSize: 9 }}>due</span>
                    )}
                  </span>
                  <span style={{ ...numeral(13), whiteSpace: "nowrap" }}>{fmtMoney(r.amount)}</span>
                </div>
                <div style={{ ...body(11, tokens.faint) }}>
                  {r.category} · {r.daysSince}d ago · {r.occurrences}×
                </div>
              </div>
            ))}
          </div>
        ) : (
          <ScrollX min={480}>
            <div>
              <div
                style={{
                  display: "grid", gridTemplateColumns: RECUR_COLS, gap: 10,
                  padding: "0 0 8px", borderBottom: `1px solid ${tokens.lineHi}`, ...labelStyle(),
                }}
              >
                <span>Charge</span><span>Category</span>
                <span style={{ textAlign: "right" }}>Typical</span>
                <span style={{ textAlign: "right" }}>Last seen</span>
              </div>
              {recurring.map((r) => (
                <div
                  key={r.key}
                  style={{
                    display: "grid", gridTemplateColumns: RECUR_COLS, gap: 10,
                    alignItems: "center", padding: "10px 0", borderBottom: `1px solid ${tokens.line}`,
                  }}
                >
                  <span style={{ ...body(12.5), overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {r.label}
                    {r.dueSoon && (
                      <span style={{ ...labelStyle(tokens.amber), marginLeft: 8, fontSize: 9 }}>due</span>
                    )}
                  </span>
                  <span style={body(12, tokens.mute)}>{r.category}</span>
                  <span style={{ ...numeral(12), textAlign: "right" }}>{fmtMoney(r.amount)}</span>
                  <span style={{ ...numeral(11, tokens.faint), textAlign: "right" }}>
                    {r.daysSince}d ago · {r.occurrences}×
                  </span>
                </div>
              ))}
            </div>
          </ScrollX>
        )}
      </Panel>
    </div>
  );
}
