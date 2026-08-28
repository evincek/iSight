import React from "react";
import { tokens, font, border, display, label as labelStyle, numeral, body } from "../theme";

/* ------------------------------------------------------------------ *
 * Panel — the standard content container.
 * Hard 1px border, no radius, no shadow. Optional heading with a rule.
 * ------------------------------------------------------------------ */
export function Panel({ title, action, children, span, style = {}, bodyStyle = {} }) {
  return (
    <section
      style={{
        border,
        background: tokens.panel,
        gridColumn: span ? `span ${span}` : undefined,
        display: "flex",
        flexDirection: "column",
        minWidth: 0,
        ...style,
      }}
    >
      {title && (
        <header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            // A long title next to a filter group overflows a 360px phone;
            // let the action drop to its own line instead.
            flexWrap: "wrap",
            gap: 12,
            padding: "12px 16px",
            borderBottom: `1px solid ${tokens.line}`,
          }}
        >
          <h2 style={{ ...display(15), margin: 0 }}>{title}</h2>
          {action}
        </header>
      )}
      <div style={{ padding: "clamp(12px, 3.4vw, 16px)", flex: 1, minWidth: 0, ...bodyStyle }}>
        {children}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * StatTile — a caption, a big numeral, an optional delta.
 * ------------------------------------------------------------------ */
export function StatTile({ label, value, tone = "neutral", sub, size = 34, span }) {
  const color =
    tone === "good" ? tokens.volt : tone === "bad" ? tokens.blood : tone === "info" ? tokens.sky : tokens.chalk;
  return (
    <div
      style={{
        border,
        background: tokens.panel,
        padding: "14px 16px 16px",
        gridColumn: span ? `span ${span}` : undefined,
        minWidth: 0,
      }}
    >
      <div style={{ ...labelStyle(), marginBottom: 10 }}>{label}</div>
      <div style={{ ...numeral(size, color), fontWeight: 600, letterSpacing: "-0.02em", wordBreak: "break-word" }}>
        {value}
      </div>
      {sub && <div style={{ ...body(11, tokens.mute), marginTop: 6 }}>{sub}</div>}
    </div>
  );
}

/** Coloured ▲/▼ delta chip. */
export function Delta({ pct, invert = false, size = 11 }) {
  if (pct === null || pct === undefined) {
    return <span style={{ ...numeral(size, tokens.faint) }}>—</span>;
  }
  const flat = Math.abs(pct) < 0.5;
  // For expenses, down is good — invert flips the colour mapping.
  const good = invert ? pct < 0 : pct > 0;
  const color = flat ? tokens.mute : good ? tokens.volt : tokens.blood;
  return (
    <span style={{ ...numeral(size, color), whiteSpace: "nowrap" }}>
      {flat ? "▪" : pct > 0 ? "▲" : "▼"} {Math.abs(pct).toFixed(0)}%
    </span>
  );
}

/* ------------------------------------------------------------------ *
 * Bar — budget progress. Square, flat, hairline track.
 * ------------------------------------------------------------------ */
export function Bar({ pct, tone = "good", height = 8, track = tokens.void }) {
  const color = tone === "bad" ? tokens.blood : tone === "warn" ? tokens.amber : tokens.volt;
  return (
    <div style={{ height, background: track, border: `1px solid ${tokens.line}`, overflow: "hidden" }}>
      <div
        style={{
          height: "100%",
          width: `${Math.max(0, Math.min(100, pct))}%`,
          background: color,
          transition: "width .25s linear",
        }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Form controls
 * ------------------------------------------------------------------ */
const controlBase = {
  border: `1px solid ${tokens.line}`,
  borderRadius: 0,
  padding: "10px 12px",
  fontFamily: font.body,
  fontSize: 13,
  color: tokens.chalk,
  background: tokens.void,
  outline: "none",
  width: "100%",
  minWidth: 0,
};

export function Field({ label, children, span }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6, gridColumn: span, minWidth: 0 }}>
      {label && <span style={labelStyle()}>{label}</span>}
      {children}
    </label>
  );
}

// `ctl` / `btn` / `tap` carry the coarse-pointer sizing floor from theme.js.
// They hold no styling of their own — everything visual stays inline.
export const Input = React.forwardRef(function Input({ style = {}, className, ...rest }, ref) {
  return (
    <input
      ref={ref}
      className={["ctl", className].filter(Boolean).join(" ")}
      style={{ ...controlBase, ...style }}
      {...rest}
    />
  );
});

export function Select({ style = {}, className, children, ...rest }) {
  return (
    <select
      className={["ctl", className].filter(Boolean).join(" ")}
      style={{ ...controlBase, appearance: "none", cursor: "pointer", ...style }}
      {...rest}
    >
      {children}
    </select>
  );
}

/**
 * Checkbox — a real `input type=checkbox`, so keyboard focus, the space key
 * and screen readers all work without reimplementation. `accentColor` paints
 * the native square in the theme's volt; the label wraps it and carries the
 * coarse-pointer tap floor, so the box itself stays 16px on a phone instead
 * of inflating to 44.
 */
export function Checkbox({ label, hint, style = {}, ...rest }) {
  return (
    <label
      className="tap"
      style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", minWidth: 0, ...style }}
    >
      <input
        type="checkbox"
        style={{
          width: 16,
          height: 16,
          margin: 0,
          flexShrink: 0,
          accentColor: tokens.volt,
          cursor: "pointer",
        }}
        {...rest}
      />
      <span style={{ minWidth: 0 }}>
        <span style={labelStyle(tokens.chalk)}>{label}</span>
        {hint && <span style={{ ...body(11.5, tokens.faint), display: "block", marginTop: 3 }}>{hint}</span>}
      </span>
    </label>
  );
}

export function Button({ variant = "primary", style = {}, className, children, ...rest }) {
  const variants = {
    primary: { background: tokens.volt, color: tokens.void, border: `1px solid ${tokens.volt}` },
    ghost: { background: "transparent", color: tokens.chalk, border: `1px solid ${tokens.line}` },
    danger: { background: "transparent", color: tokens.blood, border: `1px solid ${tokens.bloodDim}` },
  };
  return (
    <button
      className={["btn", className].filter(Boolean).join(" ")}
      style={{
        borderRadius: 0,
        padding: "10px 18px",
        fontFamily: font.body,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        cursor: rest.disabled ? "not-allowed" : "pointer",
        opacity: rest.disabled ? 0.5 : 1,
        transition: "background .12s linear, color .12s linear",
        ...variants[variant],
        ...style,
      }}
      {...rest}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ *
 * Feedback surfaces
 * ------------------------------------------------------------------ */
export function Banner({ tone = "bad", children, onDismiss }) {
  const color = tone === "bad" ? tokens.blood : tone === "good" ? tokens.volt : tokens.sky;
  return (
    <div
      role={tone === "bad" ? "alert" : "status"}
      style={{
        border: `1px solid ${color}`,
        borderLeft: `4px solid ${color}`,
        background: tokens.panel,
        padding: "10px 14px",
        marginBottom: 16,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        ...body(12.5, tokens.chalk),
        minWidth: 0,
      }}
    >
      <span style={{ minWidth: 0 }}>{children}</span>
      {onDismiss && (
        <button
          onClick={onDismiss}
          aria-label="Dismiss"
          className="tap"
          style={{
            background: "none", border: "none", color: tokens.mute,
            cursor: "pointer", fontSize: 16, padding: 0, flexShrink: 0,
          }}
        >
          ×
        </button>
      )}
    </div>
  );
}

export function Empty({ children }) {
  return (
    <div
      style={{
        ...body(12.5, tokens.faint),
        padding: "20px 0",
        textAlign: "center",
        border: `1px dashed ${tokens.line}`,
      }}
    >
      {children}
    </div>
  );
}

/**
 * Wraps wide content so the page body never scrolls sideways.
 *
 * `min` is the width the content needs to stay legible; below that the
 * wrapper scrolls instead of the page. Pass `fluid` for content that can
 * genuinely reflow (charts) — it then treats `min` as a preference and lets
 * the content shrink to the viewport rather than forcing a sideways drag.
 */
export function ScrollX({ children, min = 0, fluid = false }) {
  return (
    <div className="scroll-x" style={{ overflowX: "auto", overflowY: "hidden", maxWidth: "100%" }}>
      <div style={{ minWidth: min ? (fluid ? `min(${min}px, 100%)` : min) : undefined }}>
        {children}
      </div>
    </div>
  );
}

/**
 * The responsive grid every view is built from: as many equal columns as fit
 * at `min` wide, collapsing to one below that.
 *
 * The inner `min()` is the whole point. A bare `minmax(300px, 1fr)` keeps its
 * 300px floor even when the container is narrower, so on a 320px phone the
 * single column is wider than the screen and the page scrolls sideways.
 * `min(300px, 100%)` lets that last column shrink to fit instead.
 */
export function AutoGrid({ min = 300, gap = 14, style = {}, children }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(auto-fit, minmax(min(${min}px, 100%), 1fr))`,
        gap,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
