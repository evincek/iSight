import React, { useState, useMemo } from "react";
import { tokens, display, body } from "./theme";
import { todayISO, monthKey, monthOptions } from "./lib/format";
import { useLedgerData } from "./hooks/useLedgerData";
import Shell from "./components/Shell";
import { Banner } from "./components/primitives";
import Overview from "./views/Overview";
import Analytics from "./views/Analytics";
import Register from "./views/Register";
import Budgets from "./views/Budgets";
import Loans from "./views/Loans";
import Settings from "./views/Settings";

function Splash({ children }) {
  return (
    <div
      className="screen"
      style={{
        background: tokens.void,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div style={display(22, tokens.volt)}>{children}</div>
    </div>
  );
}

export default function Ledger({ session }) {
  const data = useLedgerData(session.user.id);
  const [view, setView] = useState("overview");
  const [selectedMonth, setSelectedMonth] = useState(todayISO().slice(0, 7));

  // Months that hold at least one entry — used both to seed the picker and to
  // flag the empty ones in it.
  const monthsWithData = useMemo(() => {
    const set = new Set(data.transactions.map((t) => monthKey(t.date)));
    data.loanEvents.forEach((e) => set.add(monthKey(e.date)));
    return set;
  }, [data.transactions, data.loanEvents]);

  const months = useMemo(
    () =>
      monthOptions({
        // selectedMonth is included so the <select> value always has a matching
        // option, even if it somehow falls outside the rolling window.
        dataMonths: [...monthsWithData, selectedMonth],
      }),
    [monthsWithData, selectedMonth]
  );

  if (!data.loaded) return <Splash>Opening the ledger…</Splash>;

  const views = {
    overview: <Overview data={data} month={selectedMonth} onView={setView} />,
    analytics: <Analytics data={data} month={selectedMonth} />,
    register: <Register data={data} month={selectedMonth} />,
    budgets: <Budgets data={data} month={selectedMonth} />,
    loans: <Loans data={data} month={selectedMonth} />,
    settings: <Settings data={data} session={session} />,
  };

  return (
    <Shell
      view={view}
      onView={setView}
      months={months}
      monthsWithData={monthsWithData}
      selectedMonth={selectedMonth}
      onMonth={setSelectedMonth}
      email={session.user.email}
      onSendFeedback={data.sendFeedback}
    >
      {data.errorMsg && (
        <Banner tone="bad" onDismiss={() => data.setErrorMsg("")}>
          {data.errorMsg}
        </Banner>
      )}
      {views[view]}
    </Shell>
  );
}
