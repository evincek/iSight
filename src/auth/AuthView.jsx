import React, { useState } from "react";
import { tokens, font, display, label as labelStyle, body } from "../theme";
import { supabase } from "../lib/supabaseClient";
import { Field, Input, Button, Banner } from "../components/primitives";
import { Logo } from "../components/Logo";

/** Shared chrome for every signed-out screen. */
export function AuthFrame({ heading, children, footer }) {
  return (
    <div
      className="screen"
      style={{
        background: tokens.void,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        // Keep the card off the notch and the home indicator on a phone.
        padding: "max(20px, env(safe-area-inset-top)) 20px max(20px, env(safe-area-inset-bottom))",
      }}
    >
      <div style={{ width: "100%", maxWidth: 400 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20 }}>
          <Logo height={58} title="Personal Ledger" />
          <div style={{ ...display(30, tokens.volt), lineHeight: 0.9 }}>
            PERSONAL
            <br />
            LEDGER
          </div>
        </div>
        <div style={{ border: `1px solid ${tokens.line}`, background: tokens.panel }}>
          <div style={{ padding: "18px 20px", borderBottom: `1px solid ${tokens.line}` }}>
            <h1 style={{ ...display(19), margin: 0 }}>{heading}</h1>
          </div>
          <div style={{ padding: 20 }}>{children}</div>
        </div>
        {footer && <div style={{ marginTop: 16, textAlign: "center" }}>{footer}</div>}
      </div>
    </div>
  );
}

const linkStyle = {
  background: "none",
  border: "none",
  color: tokens.volt,
  fontWeight: 600,
  cursor: "pointer",
  fontSize: 12.5,
  fontFamily: font.body,
  padding: 0,
  textDecoration: "underline",
  textUnderlineOffset: 3,
};

export default function AuthView({ onForgot }) {
  const [mode, setMode] = useState("signin"); // signin | signup
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState({ tone: null, text: "" });
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setMsg({ tone: null, text: "" });
    setLoading(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/` },
        });
        if (error) throw error;
        setMsg({ tone: "good", text: "Check your email to confirm your account, then sign in." });
      }
    } catch (err) {
      setMsg({ tone: "bad", text: err.message || "Something went wrong." });
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    if (!email) {
      setMsg({ tone: "bad", text: "Enter your email above first." });
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: `${window.location.origin}/` },
    });
    setLoading(false);
    setMsg(
      error
        ? { tone: "bad", text: error.message }
        : { tone: "good", text: "Confirmation email sent again." }
    );
  };

  return (
    <AuthFrame
      heading={mode === "signin" ? "Welcome back" : "Create your account"}
      footer={
        <span style={body(12.5, tokens.mute)}>
          {mode === "signin" ? "New here? " : "Already have an account? "}
          <button
            onClick={() => {
              setMode(mode === "signin" ? "signup" : "signin");
              setMsg({ tone: null, text: "" });
            }}
            style={linkStyle}
          >
            {mode === "signin" ? "Sign up" : "Sign in"}
          </button>
        </span>
      }
    >
      {msg.tone && <Banner tone={msg.tone} onDismiss={() => setMsg({ tone: null, text: "" })}>{msg.text}</Banner>}

      <form onSubmit={submit} style={{ display: "grid", gap: 12 }}>
        <Field label="Email">
          <Input
            type="email" value={email} required autoComplete="email"
            onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com"
          />
        </Field>
        <Field label="Password">
          <Input
            type="password" value={password} required minLength={6}
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            onChange={(e) => setPassword(e.target.value)} placeholder="••••••••"
          />
        </Field>
        <Button type="submit" disabled={loading}>
          {loading ? "Please wait…" : mode === "signin" ? "Sign in" : "Sign up"}
        </Button>
      </form>

      <div style={{ marginTop: 16, display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        {mode === "signin" ? (
          <button onClick={onForgot} style={{ ...linkStyle, fontSize: 11.5 }}>Forgot password?</button>
        ) : (
          <span />
        )}
        <button onClick={resend} style={{ ...linkStyle, fontSize: 11.5, color: tokens.mute }}>
          Resend confirmation
        </button>
      </div>
    </AuthFrame>
  );
}
