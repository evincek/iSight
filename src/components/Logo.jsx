import React from "react";
import { tokens } from "../theme";

/**
 * The Personal Ledger mark — a "P" whose stem is knocked out in brand green.
 *
 * Geometry is lifted verbatim from the master artwork in assets/per-ledger.svg
 * (a 2000×2000 canvas), so the transforms below look arbitrary but are exact;
 * the viewBox just crops to the mark's true bounding box. Don't hand-tune the
 * numbers — replace the master and re-derive. See assets/README.md.
 *
 * Draw order is load-bearing: the P is laid down first, then the accent dot,
 * then the green stem paints *over* the P's own vertical stroke. That overprint
 * is the logo; reordering these three nodes silently destroys it.
 *
 * The artwork's dark green (#183016) is invisible on our near-black canvas, so
 * on-screen the strokes take `ink` (chalk by default) while the accent keeps
 * its real brand value. Full-colour renditions live in public/favicon.svg.
 */
export const LOGO_ACCENT = "#88CF3C";

const RATIO = 724 / 894; // width ÷ height of the cropped viewBox

export function Logo({ height = 40, ink = tokens.chalk, accent = LOGO_ACCENT, title }) {
  return (
    <svg
      viewBox="638 553 724 894"
      height={height}
      width={height * RATIO}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
      style={{ display: "block", flexShrink: 0 }}
    >
      <path
        transform="matrix(1.903439,0,0,1.903439,-433.764071,-834.916331)"
        fill={ink}
        fillRule="evenodd"
        d="M664.916,971.917L776.583,971.917C812.694,971.917 843.805,961.64 869.916,941.084C896.027,920.528 909.083,895.806 909.083,866.917C909.083,838.584 897.277,814.278 873.666,794.001C850.055,773.723 821.86,763.584 789.083,763.584L664.916,763.584L664.916,971.917ZM664.916,1006.084L664.916,1164.417L779.916,1164.417C795.472,1164.417 803.249,1169.973 803.249,1181.084C803.249,1192.751 795.472,1198.584 779.916,1198.584L585.749,1198.584C570.749,1198.584 563.249,1192.751 563.249,1181.084C563.249,1169.973 570.749,1164.417 585.749,1164.417L630.749,1164.417L630.749,763.584L585.749,763.584C570.749,763.584 563.249,757.751 563.249,746.084C563.249,734.973 570.749,729.417 585.749,729.417L785.749,729.417C830.194,729.417 867.555,742.612 897.833,769.001C928.11,795.39 943.249,828.028 943.249,866.917C943.249,905.806 926.86,938.723 894.083,965.667C861.305,992.612 821.305,1006.084 774.083,1006.084L664.916,1006.084Z"
      />
      <ellipse
        transform="matrix(0.400317,0,0,0.37363,605.440051,877.403927)"
        cx="1542.526"
        cy="1435.567"
        rx="81.186"
        ry="87.629"
        fill={accent}
      />
      <rect
        transform="matrix(1.029846,0,0,0.921455,-24.923076,108.473602)"
        x="768.041"
        y="553.485"
        width="67.01"
        height="827.549"
        fill={accent}
      />
    </svg>
  );
}
