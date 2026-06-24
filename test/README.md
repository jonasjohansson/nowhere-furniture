# Tests

Run from the repo root:

```bash
node --test
```

Uses Node's built-in test runner (Node ≥18 — verified on v22). **No dependencies,
no `package.json`, no build step** — consistent with the static-site project.

## What's covered

The **pure** layers, which is everything except the 3D rendering:

- `stock.js` — constants + fit/slot helpers
- `engineering.js` — profile geometry, outline generators, slot/joint helpers, `reviewBuild`
- `src/designs/*` — each design's `build()` output (deterministic, so directly assertable)
- `bom.js` — bill-of-materials + joint accounting
- `export.js` — cut-sheet SVG string

Imports use the same `?v=22` suffix as the app; Node's ESM loader resolves it
(the query is ignored for file lookup). If a future Node version rejects it, drop
the suffix in test imports only.

## What's NOT covered here

`builder.js` (Three.js) needs WebGL/DOM and can't run headless. The design tests
pin the geometry **data**; the builder is verified **visually** via the running
app — see the `/run` skill.
