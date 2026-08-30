# Brand assets

## `per-ledger.svg` — the logo master

The source of truth for the Personal Ledger mark. A 2000×2000 vector export;
everything else in the project is *derived* from it, so treat this file as
read-only unless the brand itself is changing.

### Colours

| Role | Value | In the file |
| --- | --- | --- |
| Dark green | `#183016` | `rgb(24,48,22)` |
| Accent green | `#88CF3C` | `rgb(136,207,60)` |

### The four groups

1. The `P` glyph (dark green)
2. The accent dot (accent green)
3. The stem that overprints the `P`'s own vertical stroke (accent green)
4. A `<text>` wordmark, "Personal Ledger", in FreeMonoBold

**Groups 1–3 are the mark. Group 4 is deliberately unused** — it is illegible at
header size, and FreeMono ships with Linux but not Windows, macOS, iOS or
Android, so as live `<text>` it would fall back to a generic monospace for
almost every visitor. The app pairs the mark with the Anton wordmark instead.

Draw order is load-bearing: the `P`, then the dot, then the green stem painted
*over* the `P`. That overprint is the logo; reordering the nodes destroys it.

### What derives from this file

| Derived asset | Contents |
| --- | --- |
| `src/components/Logo.jsx` | Groups 1–3, cropped to `viewBox="638 553 724 894"` |
| `public/favicon.svg` | Groups 1–3 on white, `viewBox="510 510 980 980"` |
| `public/favicon.ico` | 16 / 32 / 48 px |
| `public/apple-touch-icon.png` | 180 px |
| `public/icon-192.png`, `public/icon-512.png` | PWA manifest icons |
| `public/og-image.png` | 1200×630 social card |
| `public/user-guide.html` | Mark inlined into the top bar by `scripts/build-user-guide.mjs` |

The path data and transforms in `Logo.jsx` are copied verbatim from here. They
look arbitrary because they are — **do not hand-tune them.** If the artwork
changes, replace this file and re-derive:

- the two `viewBox` values come from applying each group's transform to its own
  local bounding box, which yields a mark bbox of `638.35,553.48 723.30×893.04`,
  exactly centred on (1000, 1000);
- the icon `viewBox` is that box squared off with ~4% padding.

The dark green is invisible on the app's near-black canvas, so on screen the `P`
strokes take the chalk token while the accent keeps its true value. Full-colour
renditions (dark green on white) are used for the favicon and touch icons.
