// Single source of design truth.
//
// These are injected as CSS custom properties on <html> (see applyTheme, called
// once from main.jsx), NOT on a component subtree — so auth screens, modals and
// the ledger all read the same values. Previously the vars lived on Ledger's
// root div, which forced Auth.jsx and App.jsx to hardcode duplicate hexes.

export const tokens = {
  // Surfaces — near-black canvas, flat raised panels.
  void: "#0A0A0A",
  panel: "#141414",
  panelHi: "#1C1C1C", // hover / active rows
  line: "#2A2A2A", // hairline borders
  lineHi: "#3D3D3D", // emphasised rules

  // Text
  chalk: "#F5F5F0",
  mute: "#8A8A85",
  faint: "#5A5A56",

  // Accents
  volt: "#E8FF4D", // primary accent, positive, focus
  voltDim: "#A8BB2E",
  blood: "#FF4D2E", // negative, over budget
  bloodDim: "#B33520",
  sky: "#4DA6FF", // third series
  amber: "#FFB020", // warnings, forecast
};

// Semantic aliases so charts and text never diverge.
export const semantic = {
  income: tokens.volt,
  expense: tokens.blood,
  net: tokens.sky,
  over: tokens.blood,
  under: tokens.volt,
  forecast: tokens.amber,
};

// Ordered palette for category series (charts with N unknown categories).
export const seriesPalette = [
  "#E8FF4D",
  "#4DA6FF",
  "#FF4D2E",
  "#FFB020",
  "#9B7DFF",
  "#39D8B4",
  "#FF7AB8",
  "#7ED957",
  "#FF9E4D",
  "#5AC8FA",
];

export const font = {
  display: "'Anton', 'Arial Black', sans-serif",
  body: "'Inter', system-ui, -apple-system, sans-serif",
  mono: "'JetBrains Mono', 'IBM Plex Mono', ui-monospace, monospace",
};

// Brutalist rules: hard edges, no radius, no shadows.
export const RADIUS = 0;

/**
 * Below this width the shell drops the sidebar for a bottom bar and every
 * view collapses to one column. Exported so JS-side layout decisions
 * (useIsNarrow) and the CSS media queries below can't drift apart.
 */
export const BREAKPOINT = 900;

/**
 * Minimum tap target. 44px is the Apple HIG floor and close enough to
 * Material's 48dp; anything smaller is a miss-tap on a phone.
 */
export const TOUCH = 44;

export const border = `1px solid ${tokens.line}`;
export const borderHi = `1px solid ${tokens.lineHi}`;

/** Display type: uppercase, tight, heavy. Used for headings and hero numbers. */
export const display = (size, color = tokens.chalk) => ({
  fontFamily: font.display,
  fontSize: size,
  fontWeight: 400, // Anton ships a single weight
  letterSpacing: "-0.02em",
  lineHeight: 0.92,
  textTransform: "uppercase",
  color,
});

/** Small uppercase label — the workhorse for tile captions and table headers. */
export const label = (color = tokens.mute) => ({
  fontFamily: font.body,
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color,
});

/** Numerals. Tabular so columns line up in the register. */
export const numeral = (size = 14, color = tokens.chalk) => ({
  fontFamily: font.mono,
  fontSize: size,
  fontWeight: 500,
  fontVariantNumeric: "tabular-nums",
  fontFeatureSettings: '"tnum"',
  color,
});

export const body = (size = 13, color = tokens.chalk) => ({
  fontFamily: font.body,
  fontSize: size,
  color,
});

/**
 * Writes tokens as CSS custom properties on :root and installs the few global
 * rules that can't live in inline styles (focus rings, scrollbars, autofill,
 * and the mobile rules that need a media query or a unit fallback).
 * Call once at startup.
 */
export function applyTheme() {
  const root = document.documentElement;
  Object.entries(tokens).forEach(([k, v]) => {
    root.style.setProperty(`--${k}`, v);
  });

  if (document.getElementById("ledger-globals")) return;
  const style = document.createElement("style");
  style.id = "ledger-globals";
  style.textContent = `
    *, *::before, *::after { box-sizing: border-box; }
    html, body, #root { height: 100%; margin: 0; }
    body {
      background: ${tokens.void};
      color: ${tokens.chalk};
      font-family: ${font.body};
      -webkit-font-smoothing: antialiased;
    }
    /* Focus must always be visible — keyboard nav is not optional. */
    :focus-visible {
      outline: 2px solid ${tokens.volt};
      outline-offset: 2px;
    }
    ::selection { background: ${tokens.volt}; color: ${tokens.void}; }

    /* Native controls default to a light canvas; force them dark. */
    input, select, textarea, button { font-family: inherit; }
    input[type="date"]::-webkit-calendar-picker-indicator {
      filter: invert(1) opacity(0.5);
      cursor: pointer;
    }
    select option { background: ${tokens.panel}; color: ${tokens.chalk}; }
    input:-webkit-autofill,
    input:-webkit-autofill:focus {
      -webkit-text-fill-color: ${tokens.chalk};
      -webkit-box-shadow: 0 0 0 1000px ${tokens.panel} inset;
    }
    /* Remove number spinners — amounts are typed, not nudged. */
    input[type=number]::-webkit-outer-spin-button,
    input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
    input[type=number] { -moz-appearance: textfield; }

    ::-webkit-scrollbar { width: 10px; height: 10px; }
    ::-webkit-scrollbar-track { background: ${tokens.void}; }
    ::-webkit-scrollbar-thumb { background: ${tokens.line}; }
    ::-webkit-scrollbar-thumb:hover { background: ${tokens.lineHi}; }

    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after {
        animation-duration: 0.01ms !important;
        transition-duration: 0.01ms !important;
      }
    }

    /* ---------------- Mobile ---------------- */

    /* Full-height screens. dvh tracks the collapsing URL bar; the vh line
       above it is the fallback for browsers that don't know dvh. */
    .screen { min-height: 100vh; min-height: 100dvh; }

    /* Backstop against sideways page scroll. Every known overflow source is
       fixed at the component level — this only catches future ones. Uses
       clip, not hidden, so it never becomes a scroll container (which would
       break position: sticky inside). */
    #root { max-width: 100%; overflow-x: clip; }

    /* iOS Safari zooms the whole page when a control it focuses renders text
       below 16px. Sizes here are set inline, so the override needs !important.
       Applied on touch devices and to narrow windows, so the behaviour is
       reproducible in a desktop browser's responsive mode. */
    @media (max-width: ${BREAKPOINT - 1}px), (pointer: coarse) {
      input, select, textarea { font-size: 16px !important; }
    }

    @media (pointer: coarse) {
      /* Kill the 300ms double-tap-to-zoom delay on anything tappable. */
      button, select, summary, [role="button"] { touch-action: manipulation; }
      /* Fingers are blunter than cursors: hold every control and every
         button to the ${TOUCH}px floor. Inline styles still win on the axes
         a caller sets explicitly, so fixed-width fields keep their width. */
      .ctl, .btn { min-height: ${TOUCH}px; }
      .tap { min-height: ${TOUCH}px; min-width: ${TOUCH}px; }
      /* The grey flash fights the theme; :focus-visible still shows focus. */
      * { -webkit-tap-highlight-color: transparent; }
      /* Overlay scrollbars already; the 10px webkit rule would waste space. */
      ::-webkit-scrollbar { width: 0; height: 0; }
    }

    /* Horizontal scrollers (wide tables) keep their own momentum and don't
       hand an over-scroll back to the page as a back-navigation gesture. */
    .scroll-x {
      -webkit-overflow-scrolling: touch;
      overscroll-behavior-x: contain;
    }
  `;
  document.head.appendChild(style);
}
