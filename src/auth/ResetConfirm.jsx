import React, { useState } from "react";
import { tokens, body } from "../theme";
import { supabase } from "../lib/supabaseClient";
import { AuthFrame } from "./AuthView";
import { Field, Input, Button, Banner } from "../components/primitives";

/**
 * Rendered when Supabase sends the user back with a recovery token.
 * At this point the SDK has already exchanged the token for a session, so
 * updateUser is authorised — we just need the new password.
 */
export default function ResetConfirm({ onDone }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (password !== confirm) return setError("Those two passwords don't match.");
    if (password.length < 6) return setError("Use at least 6 characters.");

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) return setError(error.message);

    setDone(true);
    // Clear the recovery hash so a refresh doesn't re-enter this screen.
    window.history.replaceState({}, "", window.location.origin + "/");
    setTimeout(onDone, 1200);
  };

  return (
    <AuthFrame heading="Set a new password">
      {done ? (
        <Banner tone="good">Password updated — taking you in…</Banner>
      ) : (
        <>
          {error && <Banner tone="bad" onDismiss={() => setError("")}>{error}</Banner>}
          <p style={{ ...body(12.5, tokens.mute), margin: "0 0 14px" }}>
            Pick something you'll remember. At least 6 characters.
          </p>
          <form onSubmit={submit} style={{ display: "grid", gap: 12 }}>
            <Field label="New password">
              <Input
                type="password" value={password} required minLength={6} autoFocus
                autoComplete="new-password" onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            <Field label="Confirm password">
              <Input
                type="password" value={confirm} required minLength={6}
                autoComplete="new-password" onChange={(e) => setConfirm(e.target.value)}
              />
            </Field>
            <Button type="submit" disabled={loading}>
              {loading ? "Saving…" : "Set password"}
            </Button>
          </form>
        </>
      )}
    </AuthFrame>
  );
}
