import React, { useState } from "react";
import { tokens, label as labelStyle, body, numeral } from "../theme";
import { supabase } from "../lib/supabaseClient";
import { Panel, Field, Input, Button, Banner, AutoGrid } from "../components/primitives";

export default function Settings({ data, session }) {
  const { transactions, loans, categories } = data;
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [state, setState] = useState({ tone: null, text: "" });
  const [busy, setBusy] = useState(false);

  const changePassword = async (e) => {
    e.preventDefault();
    if (password !== confirm) {
      setState({ tone: "bad", text: "Those two passwords don't match." });
      return;
    }
    if (password.length < 6) {
      setState({ tone: "bad", text: "Use at least 6 characters." });
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      setState({ tone: "bad", text: error.message });
    } else {
      setState({ tone: "good", text: "Password updated." });
      setPassword("");
      setConfirm("");
    }
  };

  const stats = [
    ["Entries logged", transactions.length],
    ["Loans tracked", loans.length],
    ["Categories", categories.length],
  ];

  return (
    <AutoGrid min={300} style={{ alignItems: "start" }}>
      <Panel title="Account">
        <div style={{ display: "grid", gap: 14 }}>
          <div>
            <div style={{ ...labelStyle(), marginBottom: 6 }}>Signed in as</div>
            <div style={{ ...body(13), wordBreak: "break-all" }}>{session.user.email}</div>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${stats.length}, auto)`,
              justifyContent: "start",
              gap: "12px clamp(18px, 6vw, 28px)",
              paddingTop: 12,
              borderTop: `1px solid ${tokens.line}`,
            }}
          >
            {stats.map(([k, v]) => (
              <div key={k}>
                <div style={{ ...labelStyle(), marginBottom: 4 }}>{k}</div>
                <div style={numeral(20)}>{v}</div>
              </div>
            ))}
          </div>
        </div>
      </Panel>

      <Panel title="Change password">
        {state.tone && (
          <Banner tone={state.tone} onDismiss={() => setState({ tone: null, text: "" })}>
            {state.text}
          </Banner>
        )}
        <form onSubmit={changePassword} style={{ display: "grid", gap: 12 }}>
          <Field label="New password">
            <Input
              type="password" value={password} minLength={6} required
              autoComplete="new-password"
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <Field label="Confirm new password">
            <Input
              type="password" value={confirm} minLength={6} required
              autoComplete="new-password"
              onChange={(e) => setConfirm(e.target.value)}
            />
          </Field>
          <div>
            <Button type="submit" disabled={busy || !password || !confirm}>
              {busy ? "Saving…" : "Update password"}
            </Button>
          </div>
        </form>
      </Panel>
    </AutoGrid>
  );
}
