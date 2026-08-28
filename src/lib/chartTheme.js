// Chart colours — every value below was run through the dataviz validator
// against the #141414 panel surface in dark mode. Do not hand-tweak these;
// re-run the validator if they need to change.
//
//   trio (income/expense/net)  all-pairs: CVD ΔE 9.4, normal ΔE 20.9, all ≥3:1
//   categorical (6 slots)      adjacent:  CVD ΔE 8.4, normal ΔE 19.3, all ≥3:1
//   diverging pair             CVD ΔE 6.5 (WARN) — legal here because every
//                              delta also carries a ▲/▼ glyph and a signed
//                              number, so identity is never colour-alone.
//   heat ramp                  single hue, monotone L, gaps ≥0.06
//
// NOTE: the UI accent (volt #E8FF4D) is deliberately NOT a series colour. It
// sits outside the categorical lightness band because it's a text/UI token —
// buttons, focus rings, hero numerals — where WCAG text contrast is the right
// check, not the categorical band.

import { tokens } from "../theme";

export const chart = {
  income: "#199e70",
  expense: "#d95926",
  net: "#3987e5",

  // Fixed order. Never cycled — a 7th category folds into "Other".
  series: ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300"],

  up: "#e66767",   // increase — bad for expenses
  down: "#199e70", // decrease — good for expenses
  mid: "#383835",

  // Sequential, low → high. Low recedes toward the dark surface.
  heat: ["#184f95", "#256abf", "#3987e5", "#6da7ec", "#9ec5f4"],

  grid: tokens.line,
  axis: tokens.mute,
  surface: tokens.panel,
};

export const MAX_SERIES = chart.series.length;

/** Recharts axis props — recessive, hairline, no tick marks. */
export const axisProps = {
  tick: { fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fill: chart.axis },
  axisLine: { stroke: chart.grid },
  tickLine: false,
};

export const gridProps = {
  stroke: chart.grid,
  strokeDasharray: "2 4",
  vertical: false,
};

/** Legend wrapper. Small caps, sitting just under the plot. */
export const legendProps = {
  wrapperStyle: {
    // Recharts leaves the legend wrapper unconstrained, so on a narrow panel
    // the last series runs off the edge instead of wrapping. Pinning it to the
    // plot width makes the items wrap; Recharts then reserves the extra line.
    width: "100%",
    fontSize: 10,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    paddingTop: 6,
  },
};

/** Square, bordered, flat — matches the brutalist panels. */
export const tooltipStyle = {
  contentStyle: {
    background: tokens.void,
    border: `1px solid ${tokens.lineHi}`,
    borderRadius: 0,
    fontFamily: "'Inter', sans-serif",
    fontSize: 12,
    padding: "8px 10px",
  },
  labelStyle: { color: tokens.mute, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase" },
  itemStyle: { color: tokens.chalk, padding: "2px 0" },
  cursor: { stroke: tokens.lineHi, strokeWidth: 1 },
};
