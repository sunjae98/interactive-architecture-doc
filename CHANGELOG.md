# Changelog

## Unreleased

## 2.0.0 — 2026-10-15

First public release. Replaces the v1 workflow, where the agent copied and hand-edited a large
`reference/template.html`.

**Two document styles**, selected by `meta.style`:

- **Walkthrough** (default): for tech specs and design reviews. A TL;DR, a stepper, color-coded nodes,
  forks, and a scenario playground where the reader steps through a request and sees which boxes activate
  and what data flows at each step. Callouts, design decisions with their reasons, and tool examples.
- **Overview**: for product docs, feature pages and READMEs. One layered diagram with groups, boundary lines
  and vertical edges, plus tabs that highlight a path through the same layout (`doc.html#<path-id>` opens
  one) and a caption per view. All positions are computed by the renderer, so the page ships static SVG.

**Workflow**

- The agent writes a JSON document and never HTML. `scripts/iad.mjs validate` checks structure and
  cross-references (steps, branches, fan arrows, legend; nodes, edges, groups and paths for overview) and
  reports `<JSON pointer> <CODE> <message>`. `render` refuses documents with errors and writes one
  self-contained, offline HTML file. The JSON is embedded in the HTML (`#iad-data`) so it can be recovered.
- `iad init` writes a skeleton with 0 errors and `[...]` placeholders: `--steps`, `--scenarios`, `--fork`
  for walkthrough, `--style overview --paths a,b` for overview. It refuses to overwrite without `--force`.
- Self-check: open a rendered page with `#iad-selfcheck` (or call `window.iadSelfCheck()`) to get one JSON
  result in `#iad-selfcheck-result` and the console. A walkthrough checks every scenario × step; an overview
  checks every path. Agents read this instead of taking screenshots.
- `SKILL.md` picks the style from the request and asks once when the request does not say.
- Removed the v1 hand-edited `reference/template.html` workflow. A v1 document can be converted to JSON once
  with `references/migration-v1.md`.

**Pages**

- Export of the current view as PNG, SVG or a clipboard image. An overview exports the diagram itself as a
  standalone SVG, ready for a docs page.
- Tokens from Radix Colors and Primer scales, light and dark themes with an icon toggle that remembers the
  choice, embedded IAD Sans (renamed subset of Pretendard) and Geist Mono fonts, responsive layout.
- Korean and English UI strings, selected by `meta.lang`.
- A Content-Security-Policy with hashed inline scripts; text fields support only `**bold**` and `` `code` ``,
  everything else is escaped.
- Tested in current Chrome; Safari and other browsers are not verified.

**Docs**

- English `SKILL.md`; format references for both styles (`references/format.md`,
  `references/format-overview.md`), the CLI (`references/cli.md`) and the v1-to-JSON mapping
  (`references/migration-v1.md`).
- English and Korean READMEs with both styles, a comparison with a single hand-edited `SKILL.md` template,
  an estimated token comparison chart, and how to update an installed skill (`npx skills update`).
