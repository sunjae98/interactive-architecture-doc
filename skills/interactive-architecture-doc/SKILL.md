---
name: interactive-architecture-doc
description: Create an interactive HTML architecture document from a codebase or a design, in one of two styles. Walkthrough (for tech specs, design reviews and incident write-ups) is a component map the reader steps through scenario by scenario, with a moving token, what/where/if-it-fails narration, gauges and error markers. Overview (for product docs, feature pages and READMEs) is one layered diagram with optional path highlighting. You write a JSON file, validate it, and render one self-contained HTML file; the viewer exports the map as PNG, SVG or a clipboard image. Use for requests like "make an architecture doc", "interactive diagram", "walk through this flow", "document this design", "architecture diagram for our docs".
compatibility: Requires Node.js 18+ and shell access
---

# interactive-architecture-doc

Produces one offline HTML file (no CDN, no network; double-click to open) in one of two styles:

- **Walkthrough**: a map of the components a flow passes through. The reader picks a scenario and
  steps through it; each step lights up its arrows, moves a token along them and explains what
  moves, where it lives and what happens if it fails. Clicking a box shows its facts.
- **Overview**: one layered diagram (client, components, external services) with tabs that
  highlight a path through the same layout. It is short enough for a docs page or a README.

You never write HTML: you write a JSON document, and `scripts/iad.mjs` validates it and renders it.

## 0. Pick the style

If the request does not make the style clear, ask the user once before gathering anything:

1. **Walkthrough**: step through what happens, scenario by scenario (normal path, failures,
   retries). For tech specs, design reviews and "how does X actually work".
2. **Overview**: one layered diagram with optional path highlighting. For product docs,
   feature pages and READMEs.

Signals: "tech spec", "design review", "step by step", "what happens when", "failure cases" mean
walkthrough. "docs", "feature page", "README", "simple diagram", "overview" mean overview. Do not ask
when a signal is present; say which style you picked in one line. Walkthrough is the default.

The rest of this page is the walkthrough. For **overview**, read
[references/format-overview.md](references/format-overview.md) instead of `format.md`, gather the
layers (who calls the system, its main components, external services), the edges between them and
up to four paths, then start with `node scripts/iad.mjs init doc.json --style overview --paths a,b`.
Validate, render and self-check (steps 4-7 below) are the same.

## Information checklist (walkthrough)

Confirm with the user or extract from code/design docs before writing. If an item is missing,
ask first instead of inventing content.

1. **Title and intro**: what the document shows, in one or two sentences; a few facts (namespace,
   limits, retention) for the header chips.
2. **Components**: every box the flow touches, each with a kind (`client`, `infra`, `app`, `store`,
   `tool`, `dep`), a short title, a mono line (route, resource, version) and 1-4 facts.
3. **Arrows**: which component sends what to which: `file` (bulk data), `text` (requests, text),
   `ctrl` (control, responses, callbacks).
4. **Scenarios** (1-8): the normal path plus the interesting variations (failure, retry, a second
   turn, a rejection). For each step: which arrows carry it, a short token ("PDF 12MB", "429"), what
   moves, where it lives, what happens if it fails.
5. **State worth showing**: a gauge that fills and empties (disk use, retries, queue depth), nodes a
   scenario skips, error markers.
6. **Summary and limits**: a 3-line summary and any table of limits or codes.

## Procedure

1. Gather the checklist items above. Read `references/format.md` (fields, layout, rule codes).
2. Start the JSON next to where the output belongs:
   `node scripts/iad.mjs init doc.json --lang <ko|en> --scenarios id1,id2 --steps N --lanes M`,
   or copy `examples/minimal.<lang>.json` (small) or `examples/payment-auth.<lang>.json` (groups,
   gauge, markers, table). Pick `--lang` / `meta.lang` from the language the user wrote in; it only
   sets UI strings, so write the body in that same language.
3. Fill every `[...]` placeholder; add nodes, edges and steps as the flow needs. Do **not** set
   `lane` / `row` up front: the map is laid out automatically (flow left to right, groups kept
   together, long chains folded downward).
4. Validate: `node scripts/iad.mjs validate doc.json` (`--json` for machine-readable output).
   Lines are `<JSON pointer> <CODE> <message>`. Fix every error; read warnings too (`W_PLACEHOLDER`
   means something is still unfilled). Other options: `references/cli.md`.
5. Render: `node scripts/iad.mjs render doc.json` writes `doc.html` next to the JSON
   (`-o path` to change). Render refuses to run while errors remain.
6. Self-check: if a browser tool is available (e.g. `agent-browser`), open `doc.html#iad-selfcheck`
   and read the text of `#iad-selfcheck-result`: one JSON line, `"ok":true` when every scenario and
   step highlights what the JSON says, with narration, badges, gauges and markers in place. Fix
   `failures` in the JSON and render again. Take screenshots only when the self-check fails or the
   user asks for visuals.
7. Deliver the HTML and keep the JSON next to it.

Paths are relative to the skill folder; run the commands from there or use absolute paths.

## Layout hints (only when needed)

- Most maps need none. If a warning says an edge runs through a box (`W_EDGE_CROSSES_NODE`) or the
  arrangement reads badly, run `node scripts/iad.mjs layout doc.json`: it prints each node's lane,
  row and box, the free gaps between lanes and rows, and each edge's path.
- `lane` / `row` on a few nodes are constraints: those nodes get exactly that lane or row and the rest
  stays automatic. Setting `lane` on every node switches to a fully manual grid.
- `route.via` (waypoints in the gaps `layout` printed), `route.from_side` / `to_side`, or `span` /
  `rows` for wide or tall boxes. Re-validate after each change.

## Rules

- **Never edit the generated HTML directly.** Change the JSON and render again. Keep the JSON
  next to the HTML so the document can be updated later.
- Define every used kind in `legend.nodes`, in the reader's terms, and use kinds consistently.
- Each step names the edges it uses (in order: the token travels them one after another), or `nodes`
  when nothing moves along an edge.
- Gauge values (0..1) carry forward to later steps; set them only where they change.
- Every `considerations` item needs a `why`; do not record a decision without its reason.
- Text fields support only `**bold**` and `` `code` ``; everything else is escaped.

## Updating an existing document

1. **A `.json` sits next to the HTML**: edit the JSON, validate, render again.
2. **Only the HTML exists**: extract the JSON from `<script type="application/json" id="iad-data">`
   (plain JSON, with `<`, U+2028 and U+2029 written as `\uXXXX`). Save it as `doc.json`, then follow
   case 1.
3. **The JSON is a v2 walkthrough** (`validate` reports `E_V2_WALKTHROUGH`: top-level `steps` and
   `board`): rewrite it in the v3 format with [references/migration-v2.md](references/migration-v2.md)
   (read it only in this case), render, and compare with the old page.
