import React, { useState, useMemo } from "react";
import { tokens, label as labelStyle, numeral, body } from "../theme";
import { fmtMoney } from "../lib/format";
import * as A from "../lib/analytics";
import { Panel, Input, Button, Bar, Empty, AutoGrid } from "../components/primitives";

/** Debounce so a budget edit doesn't fire an upsert on every keystroke. */
function useDebouncedSave(save, delay = 500) {
  const timers = React.useRef({});
  return React.useCallback(
    (category, value) => {
      clearTimeout(timers.current[category]);
      timers.current[category] = setTimeout(() => save(category, value), delay);
    },
    [save, delay]
  );
}

export default function Budgets({ data, month }) {
  const { categories, budgets, setBudget, addCategory, transactions } = data;
  const [draft, setDraft] = useState({});
  const [newCategory, setNewCategory] = useState("");
  const debouncedSave = useDebouncedSave(setBudget);

  const spend = useMemo(() => A.byCategory(A.inMonth(transactions, month)), [transactions, month]);
  const rows = categories.filter((c) => c !== "Income");

  const total = rows.reduce((s, c) => s + (budgets[c] || 0), 0);
  const spent = rows.reduce((s, c) => s + (spend[c] || 0), 0);

  const onChange = (cat, value) => {
    setDraft((d) => ({ ...d, [cat]: value }));
    debouncedSave(cat, value);
  };

  const valueFor = (cat) => (draft[cat] !== undefined ? draft[cat] : budgets[cat] || "");

  const submitCategory = async (e) => {
    e.preventDefault();
    const ok = await addCategory(newCategory);
    if (ok) setNewCategory("");
  };

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <AutoGrid min={300}>
        <Panel title="Monthly budgets">
          <p style={{ ...body(12.5, tokens.mute), margin: "0 0 16px" }}>
            A target per category, in cedis. Saved automatically.
          </p>

          {rows.length === 0 ? (
            <Empty>No categories yet.</Empty>
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              {rows.map((cat) => {
                const budget = budgets[cat] || 0;
                const used = spend[cat] || 0;
                const over = budget > 0 && used > budget;
                return (
                  <div key={cat} style={{ borderBottom: `1px solid ${tokens.line}`, paddingBottom: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 8 }}>
                      <span style={{ ...body(13), minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {cat}
                      </span>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                        <span style={numeral(12, tokens.faint)}>₵</span>
                        <Input
                          type="number" min="0" step="1" placeholder="0"
                          value={valueFor(cat)}
                          onChange={(e) => onChange(cat, e.target.value)}
                          aria-label={`${cat} budget`}
                          style={{ width: 96, padding: "7px 9px", textAlign: "right", fontFamily: "'JetBrains Mono', monospace" }}
                        />
                      </div>
                    </div>
                    {budget > 0 && (
                      <>
                        <Bar pct={(used / budget) * 100} tone={over ? "bad" : "good"} height={5} />
                        <div style={{ ...body(11, tokens.faint), marginTop: 5 }}>
                          {fmtMoney(used)} spent{over ? ` · ${fmtMoney(used - budget)} over` : ` · ${fmtMoney(budget - used)} left`}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Panel>

        <div style={{ display: "grid", gap: 14, alignContent: "start" }}>
          <Panel title="Plan vs actual">
            <div style={{ display: "grid", gap: 14 }}>
              <div>
                <div style={{ ...labelStyle(), marginBottom: 6 }}>Total budgeted</div>
                <div style={numeral(28)}>{fmtMoney(total)}</div>
              </div>
              <div>
                <div style={{ ...labelStyle(), marginBottom: 6 }}>Spent this month</div>
                <div style={numeral(28, spent > total && total > 0 ? tokens.blood : tokens.volt)}>{fmtMoney(spent)}</div>
              </div>
              {total > 0 && (
                <div>
                  <Bar pct={(spent / total) * 100} tone={spent > total ? "bad" : "good"} height={10} />
                  <div style={{ ...body(11.5, tokens.mute), marginTop: 8 }}>
                    {spent > total
                      ? `${fmtMoney(spent - total)} over plan`
                      : `${fmtMoney(total - spent)} still unspent`}
                  </div>
                </div>
              )}
            </div>
          </Panel>

          <Panel title="Add category">
            <form onSubmit={submitCategory} style={{ display: "flex", gap: 8 }}>
              <Input
                placeholder="e.g. Subscriptions"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                aria-label="New category name"
              />
              <Button type="submit" disabled={!newCategory.trim()} style={{ whiteSpace: "nowrap" }}>Add</Button>
            </form>
          </Panel>
        </div>
      </AutoGrid>
    </div>
  );
}
