---
name: interactive-architecture-doc
description: Create an interactive HTML architecture document from a codebase or a design, in one of two styles. Walkthrough (for tech specs and design reviews) steps through a request scenario by scenario with a TL;DR, stepper, color-coded nodes, forks and design decisions. Overview (for product docs, feature pages and READMEs) is one layered diagram with optional path highlighting. You write a JSON file, validate it, and render one self-contained HTML file; the viewer exports the current view as PNG, SVG or a clipboard image. Use for requests like "make an architecture doc", "interactive diagram", "document this design flow", "architecture diagram for our docs".
compatibility: Requires Node.js 18+ and shell access
---

# interactive-architecture-doc

Produces one offline HTML file (no CDN, no network; double-click to open) in one of two styles:

- **Walkthrough**: the reader picks a scenario and steps through it ("Next step"), watching which
  boxes activate and what data flows at each step. TL;DR and design decisions live alongside.
- **Overview**: one layered diagram (client, components, external services) with tabs that
  highlight a path through the same layout. It is short enough for a docs page or a README.

You never write HTML: you write a JSON document, and `scripts/iad.mjs` validates it and renders it.

## 0. Pick the style

If the request does not make the style clear, ask the user once before gathering anything:

1. **Walkthrough**: step through a request scenario by scenario, with a TL;DR and design
   decisions. For tech specs and design reviews.
2. **Overview**: one layered diagram with optional path highlighting. For product docs,
   feature pages and READMEs.

Signals: "tech spec", "design review", "why we chose", "step by step" mean walkthrough. "docs",
"feature page", "README", "simple diagram", "overview" mean overview. Do not ask when a signal is
present; say which style you picked in one line. Walkthrough is the default if the user has no preference.

The rest of this page is the walkthrough. For **overview**, read
[references/format-overview.md](references/format-overview.md) instead of `format.md`, gather the
layers (who calls the system, its main components, external services), the edges between them and
up to four paths, then start with `node scripts/iad.mjs init doc.json --style overview --paths a,b`.
Validate, render and self-check (steps 4-7 below) are the same.

## Information checklist (walkthrough)

Confirm with the user or extract from code/design docs before writing. If an item is missing,
ask first instead of inventing content.

1. **Title / subtitle**: document title and a one-line summary of the core design.
2. **TL;DR**: one headline sentence plus 4-6 supporting points (bold summary + one-line detail).
3. **Step list**: the steps a request takes from start to end, in order (becomes the stepper).
4. **Actor color classes**: for each node, one of `client` (outside the system), `decision`
   (a choice is made), `existing` (already exists / handled elsewhere), `new` (built in this
   project). Meanings can differ per project; state the real meaning in `legend`.
5. **Branch scenarios**: paths that split at a decision (e.g. image / audio / video / text).
   Each becomes a drop-down option. Be able to write the concrete data at each step (request
   payload, decision result, response schema).
6. **External systems (if any)**: what each provides (functions, APIs). Skip for purely
   internal architectures.
7. **Design considerations**: why each decision was made and which alternatives were rejected.
8. **API / tool definitions**: real schemas or function signatures, if they exist.

## Procedure

1. Gather the checklist items above. Read `references/format.md` (fields and rule codes).
2. Start the JSON next to where the output belongs:
   `node scripts/iad.mjs init doc.json --lang <ko|en> --steps N --scenarios id1,id2 [--fork]`
   (`--fork` for paths that split at a decision: one column per scenario). For a linear flow you may
   instead copy `examples/minimal.<lang>.json`; open `examples/three-branch.*.json` only when you
   need a pattern it shows (external systems, details, callouts, tool examples).
   Pick `--lang` / `meta.lang` from the language the user wrote in; it only sets UI strings, so
   write the body in that same language.
3. Fill every `[...]` placeholder with the user's content; add or move nodes as the flow needs.
4. Validate: `node scripts/iad.mjs validate doc.json` (`--json` for machine-readable output).
   Lines are `<JSON pointer> <CODE> <message>`. Fix every error; read warnings too (`W_PLACEHOLDER`
   means something is still unfilled). Other options: `references/cli.md`.
5. Render: `node scripts/iad.mjs render doc.json` writes `doc.html` next to the JSON
   (`-o path` to change). Render refuses to run while errors remain.
6. Self-check: if a browser tool is available (e.g. `agent-browser`), open `doc.html#iad-selfcheck`
   and read the text of `#iad-selfcheck-result`: one JSON line, `"ok":true` when every scenario ×
   step has an active node, data, drawn fan arrows and no overflow. Fix `failures` in the JSON and
   render again. Take screenshots only when the self-check fails or the user asks for visuals.
7. Deliver the HTML and keep the JSON next to it.

Paths are relative to the skill folder; run the commands from there or use absolute paths.

## Rules

- **Never edit the generated HTML directly.** Change the JSON and render again. Keep the JSON
  next to the HTML so the document can be updated later.
- Every `considerations` item needs a `why`; do not record a decision without its reason.
- Define the four kinds consistently in `legend` and use them the same way throughout.
- Step numbers are array positions (`steps[0]` is step 1). Several nodes may share a step
  ("same step, different actor"); restrict them with `branches` (scenario ids).
- Fan arrows: put `fan_hub` on the deciding node and `fan_target` (same id) on the first node
  of each path, all inside the same `fork` block. No JS or HTML changes are needed to add paths.
- Text fields support only `**bold**` and `` `code` ``; everything else is escaped.

## Updating an existing document

1. **A `.json` sits next to the HTML**: edit the JSON, validate, render again.
2. **Only a v2 HTML exists**: extract the JSON from
   `<script type="application/json" id="iad-data">` in the HTML (the content is plain JSON, with
   `<`, U+2028 and U+2029 written as `\uXXXX`, which JSON parsers read normally). Save it as
   `doc.json`, then follow case 1.
3. **Only a v1 HTML exists** (hand-edited template with `TOTAL_STEPS` / `SCENARIOS`): for a
   typo-level change, edit the HTML directly. For anything larger, convert it once to JSON with
   `references/migration-v1.md` (read it only in this case), render, compare with the original in
   a browser, and from then on work from the JSON.
