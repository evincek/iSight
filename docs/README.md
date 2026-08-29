# Documentation

| Document | What it covers |
| --- | --- |
| [manuals/user-guide.md](manuals/user-guide.md) | **For people using the app**: signing in, logging entries, reading each screen, and why some figures differ from others |
| [manuals/architecture.md](manuals/architecture.md) | How the project is put together: the layer cake, file map, data layer, schema, loan event model, responsive strategy, testing architecture |
| [manuals/calculations.md](manuals/calculations.md) | Every figure on every screen — the formula, the rows it reads, and which figures may be compared with which |
| [manuals/operations.md](manuals/operations.md) | Running it locally, applying migrations, shipping a change, troubleshooting |
| [journal/](journal/) | Dated record of what was done and why |

The user guide is also built as a PDF with the screenshots included, kept at
[`public/user-guide.pdf`](../public/user-guide.pdf) so the deployed site serves
it. Vite copies everything in `public/` into `dist/` at build time, and the
rewrite in [`vercel.json`](../vercel.json) puts it on `/user-guide`. It lives
there rather than beside the markdown so there is only ever one copy of a 2.4 MB
binary in the repository.

Start with **user-guide.md** if you are using the app, or
**calculations.md → The two bases** if you are working on it and a number on one
screen appears to contradict a number on another. It almost always does not —
the same question is answered in plain language in the user guide, under
[Why don't these numbers match?](manuals/user-guide.md#why-dont-these-numbers-match).

Setup and deploy live in the root [README.md](../README.md); the branch pipeline
in [WORKFLOW.md](../WORKFLOW.md).
