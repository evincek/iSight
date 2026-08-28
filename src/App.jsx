import React, { useEffect, useState } from "react";
import { supabase, configError } from "./lib/supabaseClient";
import { tokens, display, body } from "./theme";
import AuthView from "./auth/AuthView";
import ResetRequest from "./auth/ResetRequest";
import ResetConfirm from "./auth/ResetConfirm";
import Ledger from "./Ledger";

/**
 * Supabase delivers the recovery token in the URL hash. Detect it before the
 * SDK strips it, so a returning user lands on the set-password screen rather
 * than being dropped straight into the ledger with a temporary session.
 */
const hashHasRecovery = () =>
  typeof window !== "undefined" && /type=recovery/.test(window.location.hash);

export default function App() {
  const [session, setSession] = useState(undefined); // undefined = loading, null = signed out
  // 'auth' | 'forgot' | 'recovery'
  const [screen, setScreen] = useState(hashHasRecovery() ? "recovery" : "auth");

  useEffect(() => {
    if (configError) return;

    supabase.auth.getSession().then(({ data }) => setSession(data.session));

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") setScreen("recovery");
      setSession(session);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  if (configError) {
    return (
      <div className="screen" style={{ background: tokens.void, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ maxWidth: 460, border: `1px solid ${tokens.blood}`, borderLeft: `4px solid ${tokens.blood}`, background: tokens.panel, padding: 22 }}>
          <div style={{ ...display(19, tokens.blood), marginBottom: 10 }}>Not configured</div>
          <p style={{ ...body(13, tokens.chalk), margin: 0 }}>{configError}</p>
        </div>
      </div>
    );
  }

  if (session === undefined) {
    return (
      <div className="screen" style={{ background: tokens.void, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={display(22, tokens.volt)}>Loading…</div>
      </div>
    );
  }

  // A recovery session is still a session — check this before the signed-in
  // branch, or the user never gets to set their new password.
  if (screen === "recovery") {
    return <ResetConfirm onDone={() => setScreen("auth")} />;
  }

  if (!session) {
    return screen === "forgot" ? (
      <ResetRequest onBack={() => setScreen("auth")} />
    ) : (
      <AuthView onForgot={() => setScreen("forgot")} />
    );
  }

  return <Ledger session={session} />;
}
