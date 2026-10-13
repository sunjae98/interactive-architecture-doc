# Changelog

## Unreleased

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
