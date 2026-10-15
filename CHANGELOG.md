# Changelog

## Unreleased

- Two document styles. **Walkthrough** is the existing step-by-step document for tech specs and design
  reviews, and stays the default. **Overview** is new: one layered diagram for product docs, feature pages and
  READMEs, with tabs that highlight a path through the same layout (`doc.html#<path-id>` opens one), a caption
  per view, and export of the diagram itself as SVG, PNG or a clipboard image.
- `meta.style` (`walkthrough` | `overview`) selects the format; documents without it render as before.
  Overview format: `references/format-overview.md`, example: `examples/request-router.overview.*.json`.
- `iad init --style overview [--paths a,b]` writes an overview skeleton. Walkthrough-only options
  (`--steps`, `--scenarios`, `--fork`) and the overview-only `--paths` are rejected for the other style.
- New rule codes: `E_STYLE`, and for overview documents `E_NODE_UNKNOWN`, `E_PATH_UNKNOWN`,
  `E_GROUP_UNKNOWN`, `E_LAYOUT`, `E_EDGE_LAYER`, `E_EDGE_ALIGN`, `W_TEXT_LONG`, `W_PATH_DISCONNECTED`.
- `SKILL.md` starts by picking the style from the request, and asks once when the request does not say.
- The overview self-check (`#iad-selfcheck`) checks each path's highlight, edge labels and page overflow.
- READMEs describe both styles, with Overview screenshots.

## 2.1.0 — 2026-10-13

- Self-check mode: open a rendered page with `#iad-selfcheck` (or call `window.iadSelfCheck()`) to replay
  every scenario × step and get one JSON result (active node, data panel, entry request, fan arrows, horizontal
  overflow, page errors) in `#iad-selfcheck-result` and the console. Agents read this instead of taking screenshots.
- `iad init <out.json> [--lang ko|en] [--steps N] [--scenarios ids] [--fork]` writes a skeleton document with
  0 validation errors and `[...]` placeholders; refuses to overwrite without `--force`.
- Smaller agent read set: `SKILL.md` no longer asks to read `design-system.md`; the CLI details and the v1
  mapping moved out of `format.md` into `references/cli.md` and `references/migration-v1.md`.
- READMEs: `iad init`, `#iad-selfcheck`, a comparison with a single hand-edited `SKILL.md` template, an
  estimated token comparison chart, and how to update an installed skill (`npx skills update`).
- The v2 plan document is no longer part of the repository.
- Theme toggle is now an icon button (moon / sun) fixed to the top-right corner instead of a text button in
  the sidebar; its label names the action ("Switch to dark mode" / "다크 모드로 전환").

## 2.0.0 — 2026-10-13

First public release.

- JSON-based workflow: the agent writes a JSON document; `scripts/iad.mjs validate` checks structure and
  cross-references (steps, branches, fan arrows, legend), and `render` produces one self-contained HTML file.
  The JSON is embedded in the HTML (`#iad-data`) so it can be recovered.
- Export of the current view (selected scenario and step) as PNG, SVG, or clipboard image.
- Redesigned tokens (Radix Colors, Primer scales), light and dark themes, embedded IAD Sans (renamed subset of
  Pretendard) and Geist Mono fonts, responsive column layout.
- Korean and English UI strings, selected by `meta.lang`.
- New English `SKILL.md`, English and Korean READMEs, format reference with a v1-to-JSON mapping table.
- Generated pages carry a Content-Security-Policy with hashed inline scripts.
- Removed the v1 hand-edited `reference/template.html` workflow.
- Tested in current Chrome; Safari and other browsers are not verified.
