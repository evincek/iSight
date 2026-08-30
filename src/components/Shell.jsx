import React, { useState, useEffect } from "react";
import { tokens, font, display, label as labelStyle, body } from "../theme";
import { monthLabel } from "../lib/format";
import { supabase } from "../lib/supabaseClient";
import { useIsNarrow } from "../hooks/useIsNarrow";
import { Button } from "./primitives";
import { Logo } from "./Logo";

// Re-exported so existing importers keep working; the hook itself now lives
// in hooks/ so views can use it without importing their own container.
export { useIsNarrow };

const NAV = [
  { id: "overview", label: "Overview" },
  { id: "analytics", label: "Analytics" },
  { id: "register", label: "Register" },
  { id: "budgets", label: "Budgets" },
  { id: "loans", label: "Loans" },
  { id: "settings", label: "Settings" },
];

const SIDEBAR_W = 208;

// Height of the mobile tab bar. Main's bottom padding is derived from it, so
// the last row of a view is never parked under the nav.
const TABBAR_H = 54;

function NavItem({ item, active, onClick, narrow }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: narrow ? "center" : "flex-start",
        gap: 10,
        width: "100%",
        // The tab bar is a thumb target, not a menu row — hold it to TABBAR_H.
        minHeight: narrow ? TABBAR_H : undefined,
        padding: narrow ? "8px 2px" : "11px 14px",
        background: active ? tokens.volt : hover ? tokens.panelHi : "transparent",
        color: active ? tokens.void : hover ? tokens.chalk : tokens.mute,
        border: "none",
        borderLeft: narrow ? "none" : `3px solid ${active ? tokens.volt : "transparent"}`,
        cursor: "pointer",
        fontFamily: font.body,
        // Six labels share the width, so the longest ("Analytics") sets the
        // size. Scaling with the viewport keeps it on one line from 320px up
        // without shrinking the type on a roomier phone.
        fontSize: narrow ? "clamp(8px, 2.4vw, 10px)" : 11,
        fontWeight: 700,
        // Tighter on the bottom bar so six labels fit at 390px.
        letterSpacing: narrow ? "0.02em" : "0.1em",
        textTransform: "uppercase",
        whiteSpace: "nowrap",
        transition: "background .12s linear, color .12s linear",
      }}
    >
      {item.label}
    </button>
  );
}

function FeedbackModal({ onClose, onSend, page, narrow }) {
  const [message, setMessage] = useState("");
  const [state, setState] = useState("idle"); // idle | sending | sent | error
  const [error, setError] = useState("");

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Freeze the page behind the sheet. Without this a phone scrolls the ledger
  // under the overlay while the textarea has focus.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    if (!message.trim()) return;
    setState("sending");
    try {
      await onSend(message, page);
      setState("sent");
      setTimeout(onClose, 1400);
    } catch (err) {
      setError(err.message || "Couldn't send that.");
      setState("error");
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Send feedback"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.75)",
        display: "flex",
        // On a phone it rises from the bottom, within thumb reach and clear of
        // the keyboard when it opens. On desktop it stays centred.
        alignItems: narrow ? "flex-end" : "center",
        justifyContent: "center",
        padding: narrow ? 0 : 20,
        zIndex: 100,
      }}
    >
      <div
        style={{
          background: tokens.panel,
          border: `1px solid ${tokens.lineHi}`,
          borderBottom: narrow ? "none" : `1px solid ${tokens.lineHi}`,
          width: "100%",
          maxWidth: narrow ? "none" : 440,
          // Never taller than the visible viewport — with the keyboard up,
          // dvh shrinks and the sheet stays fully reachable.
          maxHeight: "92dvh",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <header style={{ padding: "14px 18px", borderBottom: `1px solid ${tokens.line}`, flexShrink: 0 }}>
          <h2 style={{ ...display(17), margin: 0 }}>Send feedback</h2>
        </header>
        <form
          onSubmit={submit}
          style={{
            padding: 18,
            // Clear the home indicator on a full-bleed sheet.
            paddingBottom: narrow ? `calc(18px + env(safe-area-inset-bottom))` : 18,
            overflowY: "auto",
          }}
        >
          {state === "sent" ? (
            <div style={{ ...body(13, tokens.volt), padding: "20px 0", textAlign: "center" }}>
              Thanks — that landed. ✓
            </div>
          ) : (
            <>
              <p style={{ ...body(12.5, tokens.mute), margin: "0 0 12px" }}>
                Found a bug, or something feel wrong? Tell me. Sent from the{" "}
                <strong style={{ color: tokens.chalk }}>{page}</strong> view.
              </p>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={5}
                autoFocus
                placeholder="What happened, or what would you change?"
                style={{
                  width: "100%",
                  background: tokens.void,
                  color: tokens.chalk,
                  border: `1px solid ${tokens.line}`,
                  borderRadius: 0,
                  padding: 12,
                  fontFamily: font.body,
                  fontSize: 13,
                  resize: "vertical",
                  outline: "none",
                }}
              />
              {error && <div style={{ ...body(12, tokens.blood), marginTop: 8 }}>{error}</div>}
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  marginTop: 14,
                  justifyContent: "flex-end",
                }}
              >
                <Button
                  type="button"
                  variant="ghost"
                  onClick={onClose}
                  style={{ flex: narrow ? 1 : undefined }}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={!message.trim() || state === "sending"}
                  style={{ flex: narrow ? 1 : undefined }}
                >
                  {state === "sending" ? "Sending…" : "Send"}
                </Button>
              </div>
            </>
          )}
        </form>
      </div>
    </div>
  );
}

export default function Shell({
  view,
  onView,
  months,
  monthsWithData,
  selectedMonth,
  onMonth,
  email,
  onSendFeedback,
  children,
}) {
  const narrow = useIsNarrow();
  const [showFeedback, setShowFeedback] = useState(false);
  const current = NAV.find((n) => n.id === view);

  const monthPicker = (
    <select
      value={selectedMonth}
      onChange={(e) => onMonth(e.target.value)}
      aria-label="Select month"
      className="ctl"
      style={{
        background: tokens.void,
        color: tokens.chalk,
        border: `1px solid ${tokens.line}`,
        borderRadius: 0,
        padding: "9px 10px",
        fontFamily: font.mono,
        fontSize: 12,
        width: "100%",
        minWidth: 0,
        cursor: "pointer",
        outline: "none",
      }}
    >
      {months.map((m) => (
        <option key={m} value={m}>
          {/* Flag empty months in words, not colour — the picker is a native
              control and colour wouldn't survive every platform's rendering. */}
          {monthsWithData && !monthsWithData.has(m) ? `${monthLabel(m)} — empty` : monthLabel(m)}
        </option>
      ))}
    </select>
  );

  const nav = NAV.map((item) => (
    <NavItem
      key={item.id}
      item={item}
      active={view === item.id}
      narrow={narrow}
      onClick={() => onView(item.id)}
    />
  ));

  return (
    <div className="screen" style={{ background: tokens.void }}>
      {/* ---------- Sidebar (wide) ---------- */}
      {!narrow && (
        <aside
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            bottom: 0,
            width: SIDEBAR_W,
            borderRight: `1px solid ${tokens.line}`,
            background: tokens.panel,
            display: "flex",
            flexDirection: "column",
            zIndex: 20,
          }}
        >
          <div style={{ padding: "22px 16px 18px", borderBottom: `1px solid ${tokens.line}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <Logo height={42} />
              <div style={{ ...display(22, tokens.volt), lineHeight: 0.9 }}>
                PERSONAL
                <br />
                LEDGER
              </div>
            </div>
          </div>

          <nav style={{ padding: "10px 0", flex: 1, overflowY: "auto" }}>{nav}</nav>

          <div style={{ padding: 14, borderTop: `1px solid ${tokens.line}`, display: "grid", gap: 10 }}>
            <div>
              <div style={{ ...labelStyle(), marginBottom: 6 }}>Period</div>
              {monthPicker}
            </div>
            <button
              onClick={() => setShowFeedback(true)}
              style={{
                background: "transparent",
                border: `1px solid ${tokens.line}`,
                color: tokens.mute,
                padding: "8px",
                fontFamily: font.body,
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                cursor: "pointer",
              }}
            >
              ✎ Feedback
            </button>
            <div style={{ ...body(10, tokens.faint), wordBreak: "break-all" }}>{email}</div>
            <button
              onClick={() => supabase.auth.signOut()}
              style={{
                background: "transparent",
                border: "none",
                color: tokens.faint,
                padding: 0,
                textAlign: "left",
                fontFamily: font.body,
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                cursor: "pointer",
              }}
            >
              Sign out →
            </button>
          </div>
        </aside>
      )}

      {/* ---------- Main ---------- */}
      <main
        style={{
          marginLeft: narrow ? 0 : SIDEBAR_W,
          padding: narrow ? "16px 14px 0" : "26px 28px 40px",
          // Clear the fixed tab bar and the home indicator beneath it, rather
          // than guessing at a single magic number.
          paddingBottom: narrow ? `calc(${TABBAR_H + 26}px + env(safe-area-inset-bottom))` : 40,
          maxWidth: 1280 + SIDEBAR_W,
        }}
      >
        {narrow && (
          <div style={{ display: "grid", gap: 12, marginBottom: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
                <Logo height={26} />
                <div style={{ ...display(20, tokens.volt), lineHeight: 0.9, minWidth: 0 }}>
                  PERSONAL LEDGER
                </div>
              </div>
              <button
                onClick={() => supabase.auth.signOut()}
                className="tap"
                style={{
                  background: "transparent", border: `1px solid ${tokens.line}`, color: tokens.mute,
                  padding: "6px 10px", fontSize: 10, fontWeight: 700, letterSpacing: "0.1em",
                  textTransform: "uppercase", cursor: "pointer", fontFamily: font.body,
                  flexShrink: 0,
                }}
              >
                Out
              </button>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>{monthPicker}</div>
              <Button
                variant="ghost"
                onClick={() => setShowFeedback(true)}
                aria-label="Send feedback"
                className="tap"
                style={{ padding: "8px 12px", flexShrink: 0 }}
              >
                ✎
              </Button>
            </div>
          </div>
        )}

        <h1 style={{ ...display("clamp(26px, 7vw, 40px)"), margin: "0 0 18px", overflowWrap: "break-word" }}>
          {current ? current.label : ""}{" "}
          <span style={{ color: tokens.faint, whiteSpace: "nowrap" }}>
            / {monthLabel(selectedMonth)}
          </span>
        </h1>

        {children}
      </main>

      {/* ---------- Bottom bar (narrow) ---------- */}
      {narrow && (
        <nav
          aria-label="Main"
          style={{
            position: "fixed",
            left: 0,
            right: 0,
            bottom: 0,
            display: "grid",
            gridTemplateColumns: `repeat(${NAV.length}, 1fr)`,
            background: tokens.panel,
            borderTop: `1px solid ${tokens.lineHi}`,
            // Pad, don't inset: the bar's background still runs to the edge of
            // the screen, but nothing tappable sits under the home indicator.
            paddingBottom: "env(safe-area-inset-bottom)",
            zIndex: 20,
          }}
        >
          {nav}
        </nav>
      )}

      {showFeedback && (
        <FeedbackModal
          page={current ? current.label : view}
          narrow={narrow}
          onClose={() => setShowFeedback(false)}
          onSend={onSendFeedback}
        />
      )}
    </div>
  );
}
