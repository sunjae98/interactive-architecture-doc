---
name: interactive-architecture-doc
description: Create an interactive HTML architecture document for a system flow where several actors (client, internal services, external systems) take part in numbered steps and paths branch by input. You write a JSON file, validate it, and render one self-contained HTML file with a TL;DR, stepper, color-coded nodes, forks, and a scenario playground. The viewer can export the current view (selected scenario and step) as PNG, SVG, or a clipboard image. Use for requests like "make an architecture doc", "interactive diagram", "document this design flow".
compatibility: Requires Node.js 18+ and shell access
---

# interactive-architecture-doc

Produces a document where the reader picks a scenario and steps through it ("Next step"),
watching which boxes activate and what data flows at each step. You never write HTML: you write
a JSON document, and `scripts/iad.mjs` validates it and renders a single offline HTML file
(no CDN, no network; double-click to open).

## When to use

- A request passes through several actors in order (client / internal server / external systems).
- Paths branch by input and you want to compare the branches as scenarios.
- Design decisions ("why this way") should live in the same document.

For a plain static component diagram this is overkill; use Mermaid or similar.

## Information checklist

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

1. Read `references/format.md` (fields and rule codes). Optionally skim
   `references/design-system.md` for layout constraints.
2. Copy the closest file from `examples/` (`minimal.*.json` for a linear flow,
   `three-branch.*.json` for a fork with scenarios, external systems, and all optional sections)
   next to where the output belongs, e.g. `doc.json`.
3. Rewrite it with the user's content. Pick `meta.lang` (`ko` or `en`) from the language the
   user wrote their request in; it only affects UI strings, so write the body in that same language.
4. Validate: `node scripts/iad.mjs validate doc.json` (add `--json` for machine-readable output).
   Output lines are `<JSON pointer> <CODE> <message>`. Fix every error and re-run; read warnings
   too (leftover placeholders, steps with no active node for a scenario).
5. Render: `node scripts/iad.mjs render doc.json` writes `doc.html` next to the JSON
   (`-o path` to change). Render refuses to run while errors remain.
6. Check in a browser (use `agent-browser` if available; no specific tool is required):
   - every scenario: press "Next step" to the end; unrelated nodes dim, related nodes highlight
   - auto-play runs to the end; clicking a node jumps to its step
   - fork arrows meet node edges, including after narrowing the window
   - the export buttons produce an image of the current view
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
- Fonts (IAD Sans, a renamed subset of Pretendard, and Geist Mono) are embedded by the renderer.

## Updating an existing document

1. **A `.json` sits next to the HTML**: edit the JSON, validate, render again.
2. **Only a v2 HTML exists**: extract the JSON from
   `<script type="application/json" id="iad-data">` in the HTML (the content is plain JSON, with
   `<`, U+2028 and U+2029 written as `\uXXXX`, which JSON parsers read normally). Save it as
   `doc.json`, then follow case 1.
3. **Only a v1 HTML exists** (hand-edited template with `TOTAL_STEPS` / `SCENARIOS`): for a
   typo-level change, edit the HTML directly. For anything larger, convert it once to JSON using
   the mapping table in `references/migration-v1.md`, render, compare with the original in
   a browser, and from then on work from the JSON.
