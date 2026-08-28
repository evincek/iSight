import React, { useState } from "react";
import { tokens, font, body } from "../theme";
import { supabase } from "../lib/supabaseClient";
import { AuthFrame } from "./AuthView";
import { Field, Input, Button, Banner } from "../components/primitives";

export default function ResetRequest({ onBack }) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset`,
    });
    setLoading(false);

    // Deliberately identical response whether or not the address exists —
    // otherwise this endpoint becomes an account-enumeration oracle.
    // Only surface genuine transport/rate-limit failures.
    if (error && /rate|limit|too many/i.test(error.message)) {
      setError(error.message);
      return;
    }
    setSent(true);
  };

  return (
    <AuthFrame
      heading="Reset your password"
      footer={
        <button
          onClick={onBack}
          style={{
            background: "none", border: "none", color: tokens.mute, cursor: "pointer",
            fontSize: 12.5, fontFamily: font.body, padding: 0,
            textDecoration: "underline", textUnderlineOffset: 3,
          }}
        >
          ← Back to sign in
        </button>
      }
    >
      {sent ? (
        <div>
          <Banner tone="good">Check your inbox.</Banner>
          <p style={{ ...body(12.5, tokens.mute), margin: 0 }}>
            If an account exists for <strong style={{ color: tokens.chalk }}>{email}</strong>, a reset
            link is on its way. It expires in an hour. Check spam if it doesn't show up.
          </p>
        </div>
      ) : (
        <>
          {error && <Banner tone="bad" onDismiss={() => setError("")}>{error}</Banner>}
          <p style={{ ...body(12.5, tokens.mute), margin: "0 0 14px" }}>
            Enter your email and we'll send a link to set a new password.
          </p>
          <form onSubmit={submit} style={{ display: "grid", gap: 12 }}>
            <Field label="Email">
              <Input
                type="email" value={email} required autoComplete="email" autoFocus
                onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com"
              />
            </Field>
            <Button type="submit" disabled={loading}>
              {loading ? "Sending…" : "Send reset link"}
            </Button>
          </form>
        </>
      )}
    </AuthFrame>
  );
}
