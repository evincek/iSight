// Builds the public user guide page from docs/manuals/user-guide.md.
//
//   node scripts/build-user-guide.mjs
//
// The markdown is the source of truth. This renders it to a single themed HTML
// file at public/user-guide.html, which Vite copies into dist/ and vercel.json
// serves at /user-guide.
//
// The page deliberately does NOT go through the React app: it is read by people
// who are not signed in, often on a phone, and loading an 850 kB bundle to show
// static prose would be the wrong trade. It is plain HTML with the ledger's own
// design tokens inlined, so it still looks like the same product.
//
// Requires pandoc for the markdown-to-HTML step, and the WebP screenshots that
// live beside it in public/user-guide/.
//
// Run this by hand and COMMIT THE OUTPUT. It is deliberately not wired into
// `npm run build`: Vercel's build image has no pandoc, so a prebuild hook here
// would fail every production deploy. The build only needs to copy the
// generated file, which is why public/user-guide.html is checked in.

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(root, "docs/manuals/user-guide.md");
const IMG_DIR = join(root, "public/user-guide");
const OUT = join(root, "public/user-guide.html");

/* ------------------------------------------------------------------ *
 * Design tokens, copied from src/theme.js.
 *
 * Duplicated rather than imported because this script runs on bare node with
 * no bundler, and theme.js is an ES module of JS objects meant for React. The
 * values must be kept in step by hand; there are only ten of them.
 * ------------------------------------------------------------------ */
const t = {
  void: "#0A0A0A", panel: "#141414", panelHi: "#1C1C1C",
  line: "#2A2A2A", lineHi: "#3D3D3D",
  chalk: "#F5F5F0", mute: "#8A8A85", faint: "#5A5A56",
  volt: "#E8FF4D", blood: "#FF4D2E", sky: "#4DA6FF", amber: "#FFB020",
};

if (!existsSync(SRC)) throw new Error(`missing source: ${SRC}`);

/* ------------------------------------------------------------------ *
 * Markdown to HTML
 * ------------------------------------------------------------------ */
let html;
try {
  html = execFileSync("pandoc", [
    SRC, "--from", "gfm", "--to", "html5",
    // Section ids so the contents list can link into the page.
    "--id-prefix=", "--wrap=none",
  ], { encoding: "utf8" });
} catch (err) {
  throw new Error(
    "pandoc failed. Install it (apt install pandoc) and re-run.\n" + (err.stderr || err.message)
  );
}

/* ------------------------------------------------------------------ *
 * Rewrite images onto the optimised WebP copies
 *
 * The markdown points at the PNGs in docs/manuals/images/ so it renders on
 * GitHub. The web page wants the smaller WebP files, with intrinsic dimensions
 * set so a phone does not reflow the whole article as each one loads.
 * ------------------------------------------------------------------ */
const dims = {};
for (const f of readdirSync(IMG_DIR).filter((f) => f.endsWith(".webp") && !f.endsWith("-full.webp"))) {
  const out = execFileSync("magick", ["identify", "-format", "%w %h", join(IMG_DIR, f)], { encoding: "utf8" });
  const [w, h] = out.trim().split(/\s+/).map(Number);
  dims[f.replace(/\.webp$/, "")] = { w, h };
}

let missing = [];
html = html.replace(/<img src="images\/([a-z0-9-]+)\.png"([^>]*)>/g, (m, name, rest) => {
  const d = dims[name];
  if (!d) { missing.push(name); return m; }
  const alt = (rest.match(/alt="([^"]*)"/) || [, ""])[1];
  return `<img src="/user-guide/${name}.webp" alt="${alt}" width="${d.w}" height="${d.h}" loading="lazy" decoding="async">`;
});
if (missing.length) {
  throw new Error(`no WebP for: ${missing.join(", ")}. Regenerate public/user-guide/ first.`);
}

/**
 * Wraps an image so tapping it opens the full size file in a new tab.
 *
 * The phone screenshots are cropped to a single screen for display, because a
 * full length scroll capture is 1:4.9 and renders as a 120px sliver. Where a
 * "-full" companion exists, that is what the link reaches.
 */
const linkify = (img) => {
  const src = (img.match(/src="([^"]+)"/) || [, ""])[1];
  const full = src.replace(/\.webp$/, "-full.webp");
  const href = existsSync(join(IMG_DIR, full.split("/").pop())) ? full : src;
  return `<a class="zoom" href="${href}" target="_blank" rel="noopener" title="Open full size">${img}</a>`;
};

/* ------------------------------------------------------------------ *
 * Contents, built from the H2s so it can never fall out of step
 * ------------------------------------------------------------------ */
const toc = [...html.matchAll(/<h2 id="([^"]+)">(.*?)<\/h2>/g)]
  .map(([, id, text]) => `<li><a href="#${id}">${text.replace(/<[^>]+>/g, "")}</a></li>`)
  .join("\n        ");

/* ------------------------------------------------------------------ *
 * A table whose cells hold nothing but images is a layout table, not data.
 * The markdown uses one to put the two phone screenshots side by side, which
 * reads fine on GitHub but would make a phone drag a two column table
 * sideways. Turn it into a grid that stacks instead, keeping the header cells
 * as captions.
 * ------------------------------------------------------------------ */
html = html.replace(
  /<table>\s*<thead>\s*<tr>\s*((?:<th[^>]*>.*?<\/th>\s*)+)<\/tr>\s*<\/thead>\s*<tbody>\s*<tr>\s*((?:<td[^>]*>\s*<img[^>]*>\s*<\/td>\s*)+)<\/tr>\s*<\/tbody>\s*<\/table>/gs,
  (m, ths, tds) => {
    const caps = [...ths.matchAll(/<th[^>]*>(.*?)<\/th>/gs)].map((x) => x[1].trim());
    const imgs = [...tds.matchAll(/<img[^>]*>/g)].map((x) => x[0]);
    if (caps.length !== imgs.length) return m;
    const cells = imgs
      .map((img, i) => `<figure>${linkify(img)}<figcaption>${caps[i]}</figcaption></figure>`)
      .join("\n  ");
    return `<div class="shots">\n  ${cells}\n</div>`;
  }
);

/* The app restates its wide tables as stacked cards on a phone rather than
 * making one drag them sideways. Do the same here: label every cell with its
 * column heading so the CSS can stack them and still say what each value is.
 * Above the breakpoint they stay ordinary tables, inside a scroll container. */
html = html.replace(/<table>([\s\S]*?)<\/table>/g, (whole, inner) => {
  const heads = [...inner.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)]
    .map((m) => m[1].replace(/<[^>]+>/g, "").trim());
  let col = 0;
  const labelled = inner.replace(/<td([^>]*)>/g, (m, attrs) => {
    const label = heads[col % (heads.length || 1)] || "";
    col++;
    return `<td${attrs} data-label="${label.replace(/"/g, "&quot;")}">`;
  });
  return `<div class="scrollx"><table>${labelled}</table></div>`;
});

/* Screenshots of a dense UI are unreadable shrunk to a phone's width, so each
 * one opens full size when tapped. */
html = html.replace(/<figure>\s*(<img[^>]*>)/g, (m, img) => `<figure>${linkify(img)}`);

// Absolute origin. Canonical/OG URLs must be absolute — crawlers do not resolve
// relative ones — so the host lives here rather than being inlined four times.
const SITE = "https://frankbaiden.site";

// The Personal Ledger mark, inlined so the bar paints with the page instead of
// waiting on a second request. Geometry is verbatim from the master artwork in
// assets/per-ledger.svg; see src/components/Logo.jsx and assets/README.md for
// the transforms and why the draw order (P, dot, then the green stem over it)
// must not change.
const MARK = `<svg class="mark" viewBox="638 553 724 894" aria-hidden="true" focusable="false">
  <path transform="matrix(1.903439,0,0,1.903439,-433.764071,-834.916331)" fill="${t.chalk}" fill-rule="evenodd" d="M664.916,971.917L776.583,971.917C812.694,971.917 843.805,961.64 869.916,941.084C896.027,920.528 909.083,895.806 909.083,866.917C909.083,838.584 897.277,814.278 873.666,794.001C850.055,773.723 821.86,763.584 789.083,763.584L664.916,763.584L664.916,971.917ZM664.916,1006.084L664.916,1164.417L779.916,1164.417C795.472,1164.417 803.249,1169.973 803.249,1181.084C803.249,1192.751 795.472,1198.584 779.916,1198.584L585.749,1198.584C570.749,1198.584 563.249,1192.751 563.249,1181.084C563.249,1169.973 570.749,1164.417 585.749,1164.417L630.749,1164.417L630.749,763.584L585.749,763.584C570.749,763.584 563.249,757.751 563.249,746.084C563.249,734.973 570.749,729.417 585.749,729.417L785.749,729.417C830.194,729.417 867.555,742.612 897.833,769.001C928.11,795.39 943.249,828.028 943.249,866.917C943.249,905.806 926.86,938.723 894.083,965.667C861.305,992.612 821.305,1006.084 774.083,1006.084L664.916,1006.084Z"/>
  <ellipse transform="matrix(0.400317,0,0,0.37363,605.440051,877.403927)" cx="1542.526" cy="1435.567" rx="81.186" ry="87.629" fill="#88CF3C"/>
  <rect transform="matrix(1.029846,0,0,0.921455,-24.923076,108.473602)" x="768.041" y="553.485" width="67.01" height="827.549" fill="#88CF3C"/>
</svg>`;

const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="${t.void}">
<meta name="description" content="How to use Personal Ledger: logging income and expenses, setting monthly budgets, tracking loans, and reading the analytics.">
<meta name="color-scheme" content="dark">
<title>User Guide · Personal Ledger</title>
<link rel="canonical" href="${SITE}/user-guide">
<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1">
<meta property="og:type" content="article">
<meta property="og:site_name" content="Personal Ledger">
<meta property="og:title" content="User Guide · Personal Ledger">
<meta property="og:description" content="How to use Personal Ledger: logging income and expenses, setting monthly budgets, tracking loans, and reading the analytics.">
<meta property="og:url" content="${SITE}/user-guide">
<meta property="og:image" content="${SITE}/og-image.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:locale" content="en_US">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="User Guide · Personal Ledger">
<meta name="twitter:description" content="How to use Personal Ledger: logging income and expenses, setting monthly budgets, tracking loans, and reading the analytics.">
<meta name="twitter:image" content="${SITE}/og-image.png">
<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "headline": "Personal Ledger user guide",
  "description": "How to use Personal Ledger: logging income and expenses, setting monthly budgets, tracking loans, and reading the analytics.",
  "url": "${SITE}/user-guide",
  "inLanguage": "en",
  "image": "${SITE}/og-image.png",
  "about": { "@type": "WebApplication", "name": "Personal Ledger", "url": "${SITE}/" }
}
</script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Anton&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap">
<style>
:root {
  --void:${t.void}; --panel:${t.panel}; --panelHi:${t.panelHi};
  --line:${t.line}; --lineHi:${t.lineHi};
  --chalk:${t.chalk}; --mute:${t.mute}; --faint:${t.faint};
  --volt:${t.volt}; --blood:${t.blood}; --sky:${t.sky}; --amber:${t.amber};
  --display:'Anton','Arial Black',sans-serif;
  --body:'Inter',system-ui,-apple-system,sans-serif;
  --mono:'JetBrains Mono','IBM Plex Mono',ui-monospace,monospace;
}
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body {
  margin: 0; background: var(--void); color: var(--chalk);
  font-family: var(--body); font-size: 16px; line-height: 1.65;
  /* Nothing on this page may push the viewport sideways on a phone. */
  overflow-x: hidden;
}

/* ---------- top bar ---------- */
.bar {
  position: sticky; top: 0; z-index: 10;
  background: var(--panel); border-bottom: 1px solid var(--line);
  padding: 10px max(14px, env(safe-area-inset-left)) 10px max(14px, env(safe-area-inset-right));
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
}
.wordmark {
  font-family: var(--display); color: var(--volt);
  font-size: 15px; line-height: .95; letter-spacing: .01em; text-transform: uppercase;
}
.wordmark a { color: inherit; text-decoration: none; display: flex; align-items: center; gap: 9px; }
/* Height-driven so the mark tracks the two lines of type beside it. */
.wordmark .mark { height: 30px; width: auto; display: block; flex: none; }
.bar button {
  font-family: var(--body); font-size: 16px; font-weight: 700;
  letter-spacing: .1em; text-transform: uppercase;
  background: transparent; color: var(--mute);
  border: 1px solid var(--line); border-radius: 0;
  /* 44px tall so it is a real thumb target, and 16px type so iOS does not
     zoom the page when it takes focus. */
  min-height: 44px; padding: 0 14px; cursor: pointer;
}
.bar button[aria-expanded="true"] { background: var(--volt); color: var(--void); border-color: var(--volt); }

/* ---------- contents ---------- */
#toc {
  background: var(--panel); border-bottom: 1px solid var(--line);
  padding: 4px max(14px, env(safe-area-inset-left)) 14px;
}
#toc[hidden] { display: none; }
#toc ol { list-style: none; margin: 0; padding: 0; counter-reset: s; }
#toc li { counter-increment: s; border-bottom: 1px solid var(--line); }
#toc li:last-child { border-bottom: 0; }
#toc a {
  display: block; padding: 12px 0; color: var(--chalk);
  text-decoration: none; font-size: 15px;
}
#toc a::before {
  content: counter(s,decimal-leading-zero); color: var(--faint);
  font-family: var(--mono); font-size: 11px; margin-right: 12px;
}
#toc a:hover, #toc a:focus-visible { color: var(--volt); }

/* ---------- article ---------- */
main {
  max-width: 760px; margin: 0 auto;
  padding: 26px max(16px, env(safe-area-inset-left)) 72px max(16px, env(safe-area-inset-right));
}
h1 {
  font-family: var(--display); font-weight: 400; text-transform: uppercase;
  font-size: clamp(34px, 11vw, 60px); line-height: .92; letter-spacing: .005em;
  margin: 0 0 22px;
}
h2 {
  font-family: var(--display); font-weight: 400; text-transform: uppercase;
  font-size: clamp(21px, 5.6vw, 30px); line-height: 1.05;
  margin: 46px 0 14px; padding-top: 18px; border-top: 1px solid var(--lineHi);
  /* Sticky bar would otherwise cover the heading you just jumped to. */
  scroll-margin-top: 72px;
}
h3 {
  font-family: var(--body); font-weight: 700; font-size: 15px;
  letter-spacing: .06em; text-transform: uppercase; color: var(--volt);
  margin: 30px 0 8px; scroll-margin-top: 72px;
}
p { margin: 0 0 15px; }
strong { color: #fff; font-weight: 600; }
a { color: var(--volt); text-underline-offset: 3px; }
ul, ol { padding-left: 20px; margin: 0 0 15px; }
li { margin-bottom: 7px; }
hr { border: 0; border-top: 1px solid var(--line); margin: 34px 0; }

/* ---------- figures ---------- */
figure { margin: 22px 0; }
img {
  display: block; width: 100%; height: auto;
  border: 1px solid var(--line); background: var(--void);
}
figcaption {
  font-size: 12.5px; color: var(--mute); line-height: 1.5;
  margin-top: 8px; padding-left: 10px; border-left: 2px solid var(--line);
}
/* The two phone shots sit in a table in the markdown. On a narrow screen that
   is one column; side by side only once there is room for both. */
.shots { display: grid; gap: 14px; margin: 22px 0; }
@media (min-width: 620px) { .shots { grid-template-columns: 1fr 1fr; } }
.shots figcaption { text-align: center; padding: 0; border: 0; }
/* Phone shots are cropped to one screen, so they sit at column width. The cap
   is only a backstop for a very tall replacement. */
.shots img { max-height: 82vh; width: auto; margin: 0 auto; }
.zoom { display: block; }
.zoom:focus-visible { outline: 2px solid var(--volt); outline-offset: 3px; }

/* ---------- tables ---------- */
.scrollx { overflow-x: auto; -webkit-overflow-scrolling: touch; margin: 18px 0; border: 1px solid var(--line); }
table { border-collapse: collapse; width: 100%; min-width: 460px; font-size: 14px; }
th, td { text-align: left; vertical-align: top; padding: 10px 12px; border-bottom: 1px solid var(--line); }
th {
  background: var(--panelHi); color: var(--mute); font-weight: 700;
  font-size: 10.5px; letter-spacing: .1em; text-transform: uppercase; white-space: nowrap;
}
tr:last-child td { border-bottom: 0; }
/* Below the app's own breakpoint a two column table cannot stay legible at
   390px, so each row becomes a labelled block. Same trade the ledger makes on
   its register and comparison tables. */
@media (max-width: 560px) {
  .scrollx { overflow: visible; border: 0; margin: 16px 0; }
  table { min-width: 0; }
  thead { display: none; }
  tbody, tr, td { display: block; width: 100%; }
  tr { border: 1px solid var(--line); background: var(--panel); margin-bottom: 10px; }
  td { border: 0; border-top: 1px solid var(--line); padding: 10px 12px; }
  tr td:first-child { border-top: 0; }
  td::before {
    content: attr(data-label); display: block;
    color: var(--mute); font-size: 10px; font-weight: 700;
    letter-spacing: .1em; text-transform: uppercase; margin-bottom: 3px;
  }
  td[data-label=""]::before { display: none; }
}

/* ---------- code and callouts ---------- */
code {
  font-family: var(--mono); font-size: .87em;
  background: var(--panelHi); color: var(--chalk); padding: 2px 5px;
}
pre {
  background: var(--panel); border: 1px solid var(--line); border-left: 3px solid var(--volt);
  padding: 14px; overflow-x: auto; -webkit-overflow-scrolling: touch;
  font-size: 12.5px; line-height: 1.6; margin: 18px 0;
}
pre code { background: none; padding: 0; font-size: inherit; }
blockquote {
  margin: 20px 0; padding: 14px 16px;
  background: var(--panel); border: 1px solid var(--line); border-left: 3px solid var(--amber);
}
blockquote p:last-child { margin: 0; }

/* ---------- footer ---------- */
footer {
  border-top: 1px solid var(--line); background: var(--panel);
  padding: 22px max(16px, env(safe-area-inset-left)) calc(24px + env(safe-area-inset-bottom));
  font-size: 13px; color: var(--mute);
}
footer .in { max-width: 760px; margin: 0 auto; }
footer a { color: var(--volt); }
:focus-visible { outline: 2px solid var(--volt); outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } }
html { scroll-behavior: smooth; }
</style>
</head>
<body>
<div class="bar">
  <div class="wordmark"><a href="/">${MARK}<span>Personal<br>Ledger</span></a></div>
  <button id="tocBtn" aria-expanded="false" aria-controls="toc">Contents</button>
</div>
<nav id="toc" hidden aria-label="Contents">
  <ol>
        ${toc}
  </ol>
</nav>
<main>
${html.trim()}
</main>
<footer>
  <div class="in">
    <p style="margin:0 0 8px"><a href="/">Open the ledger</a> &nbsp;·&nbsp; <a href="/user-guide.pdf">Download as PDF</a></p>
    <p style="margin:0;color:var(--faint)">Screenshots show a demo account filled with invented data.</p>
  </div>
</footer>
<script>
  var btn = document.getElementById("tocBtn"), toc = document.getElementById("toc");
  btn.addEventListener("click", function () {
    var open = btn.getAttribute("aria-expanded") === "true";
    btn.setAttribute("aria-expanded", String(!open));
    toc.hidden = open;
  });
  // Jumping to a section should close the list again, or a phone is left
  // looking at the contents rather than at what it just navigated to.
  toc.addEventListener("click", function (e) {
    if (e.target.tagName === "A") { btn.setAttribute("aria-expanded", "false"); toc.hidden = true; }
  });
</script>
</body>
</html>
`;

writeFileSync(OUT, page);
const kb = (Buffer.byteLength(page) / 1024).toFixed(1);
console.log(`wrote ${OUT.replace(root + "/", "")}  (${kb} kB, ${toc.split("</li>").length - 1} sections)`);
