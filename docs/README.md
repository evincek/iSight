# Documentation

| Document | What it covers |
| --- | --- |
| [manuals/user-guide.md](manuals/user-guide.md) | **For people using the app**: signing in, logging entries, reading each screen, and why some figures differ from others |
| [manuals/architecture.md](manuals/architecture.md) | How the project is put together: the layer cake, file map, data layer, schema, loan event model, responsive strategy, testing architecture |
| [manuals/calculations.md](manuals/calculations.md) | Every figure on every screen — the formula, the rows it reads, and which figures may be compared with which |
| [manuals/operations.md](manuals/operations.md) | Running it locally, applying migrations, shipping a change, troubleshooting |
| [journal/](journal/) | Dated record of what was done and why |

## The published user guide

`/user-guide` on the deployed site serves a themed HTML page built from
`manuals/user-guide.md`. It uses the ledger's own design tokens and is written
for a phone first, so it is not the PDF and not part of the React app.

| File | Role |
| --- | --- |
| [`scripts/build-user-guide.mjs`](../scripts/build-user-guide.mjs) | Generates the page from the markdown. Run by hand. |
| `public/user-guide.html` | The generated page. **Committed**, because Vercel's build image has no pandoc. |
| `public/user-guide/*.webp` | Screenshots, resized and re-encoded for the web (572 kB, down from 2.6 MB) |
| [`public/user-guide.pdf`](../public/user-guide.pdf) | Print copy, linked from the page footer |
| [`vercel.json`](../vercel.json) | Rewrites `/user-guide` to the HTML and sets caching |

After editing `manuals/user-guide.md`:

```bash
node scripts/build-user-guide.mjs   # needs pandoc
npm run build                       # confirms it lands in dist/
```

Then commit the regenerated `public/user-guide.html`. It is deliberately not a
prebuild hook: adding one would make every production deploy depend on pandoc
being present, and it is not.

Start with **user-guide.md** if you are using the app, or
**calculations.md → The two bases** if you are working on it and a number on one
screen appears to contradict a number on another. It almost always does not —
the same question is answered in plain language in the user guide, under
[Why don't these numbers match?](manuals/user-guide.md#why-dont-these-numbers-match).

Setup and deploy live in the root [README.md](../README.md); the branch pipeline
in [WORKFLOW.md](../WORKFLOW.md).
