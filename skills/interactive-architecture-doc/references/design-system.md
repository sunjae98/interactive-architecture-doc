# Design system

How `assets/template.html` is built. Authors never touch the template or the rendered HTML; they
write JSON (see [format.md](format.md)) and `scripts/iad.mjs render` fills the template. This page is
for people changing the template itself.

## Template slots

The renderer replaces slots in a single pass (substituted content is never re-scanned). An unknown
slot is a render error.

| Slot | Filled with |
|---|---|
| `{{IAD_LANG}}` | `meta.lang` (`en` default) — `<html lang>` |
| `{{IAD_TITLE}}` | `meta.title — subtitle` as plain text |
| `{{IAD_FONTS}}` | `<style>` with `@font-face` rules for every `assets/fonts/*.woff2` (base64), or empty when there are none. The family name is the file's basename |
| `{{IAD_HEADER}}` | `<h1>` + subtitle |
| `{{IAD_TLDR}}` | `.tldr` box, or empty |
| `{{IAD_STEPPER}}` | `.stepper` with one `.step` per `steps[]` entry |
| `{{IAD_LEGEND}}` | `.legend`, kinds in the fixed order client, decision, existing, new |
| `{{IAD_BOARD}}` | the board blocks |
| `{{IAD_SECTIONS}}` | `.callout`, `.considerations`, `.tool-examples` (each only if present) |
| `{{IAD_DATA}}` | the full IR as JSON (`<`, U+2028, U+2029 escaped) inside `<script type="application/json" id="iad-data">` |
| `{{IAD_I18N}}` | the UI string table for `meta.lang` inside `<script type="application/json" id="iad-i18n">` |
| `{{t:key}}` | one UI string, HTML-escaped (buttons, panel titles, step hint) |

The runtime reads only `#iad-data` (`steps.length`, `scenarios`, `meta.entry_request`) and
`#iad-i18n`. The drop-down options are built from `scenarios`, so they can never disagree with the
board. UI strings live in `scripts/lib/i18n.mjs` (`en` and `ko`, identical keys).

## Tokens

All colors live in the single `:root` block at the top of the template. A `[data-theme="dark"]`
block follows it (empty for now; dark values arrive with the redesign). Component CSS and JS use
only `var(--…)` — a test fails on any `#hex`, `rgb(`/`rgba(`/`hsl(`, numeric HTML entity or named
color outside those two blocks. Values are currently identical to v1.

| Token | Use |
|---|---|
| `--color-bg`, `--color-surface`, `--color-surface-2` | page, cards/nodes, badges and hover |
| `--color-border`, `--color-text`, `--color-text-muted` | lines, text, secondary text |
| `--color-on-solid` | text on solid fills (step numbers, primary button) |
| `--color-primary`, `--color-primary-bg` | stepper numbers, primary button, scenario pill |
| `--color-code-bg`, `--color-code-text` | dark code blocks |
| `--color-hatch` | diagonal stripes of `.internal` |
| `--line` | fan arrows (SVG uses `currentColor`; `.zone-overlay` sets `color:var(--line)`) |
| `--kind-<k>-bg` / `-border` / `-solid` / `-text` | per node kind (`client`, `decision`, `existing`, `new`) |
| `--kind-decision-tag-bg`, `--kind-decision-code-text`, `--kind-new-code-text`, `--kind-existing-zone-bg` | kind-specific extras |
| `--font-sans`, `--font-mono` | font stacks |
| `--radius-*` | `dot`, `tag`, `badge`, `control`, `node`, `card`, `zone`, `internal`, `pill` |
| `--space-1` … `--space-6` | 4, 6, 10, 14, 22, 34 px |
| `--shadow-card`, `--shadow-panel`, `--shadow-active` | TL;DR box, playground, active node |

## Node kinds

| Class | Default meaning | Color |
|---|---|---|
| `.node.client` | client outside the system | pink (tinted background) |
| `.node.decision` | where a path is chosen | violet (tinted background) |
| `.node.existing` | already exists / handled elsewhere | green border |
| `.node.new` | built in this project | amber border |

Documents may redefine the meanings; the legend text is what readers see.

## Classes produced by the renderer

| IR | Markup |
|---|---|
| `node` | `.node.<kind>[.w-narrow|.w-wide|.w-full]` with `data-step`, optional `data-branch="a,b"`, `data-fan-hub`, `data-fan-target`. Inside: `.num`, `.tag`, `.body`, `code.blk` (`data-entry` on the entry node), `.detail-grid` (`.detail-left`, `.detail-right`, `.detail-item[.alt-item]`), `.note`. Outside `columns` it is wrapped in `.center-row` |
| `arrow` | `.plain-arrow` with optional `.arrow-label` |
| `internal` | `.internal` + `.badge` |
| `external` | `.external-zone` + `.badge2` + `.external-row` of `.external-card` |
| `fork` | `.fork-zone` + `<svg class="zone-overlay" data-fan-svg>` |
| `columns` | `.fork-row` of `.fork-col` (+ `.fork-title`) |
| inline `` `code` `` | `code.ic` |

`.active` / `.altpath` are toggled by the runtime only.

## Layout and responsiveness

- `.fork-row` and `.external-row` use `grid-template-columns: repeat(var(--cols,4),1fr)`. The
  renderer writes `style="--cols:N;--cols-md:M"` with `M = min(N,2)` — never an inline
  `grid-template-columns`, so media queries keep working.
- `≤1180px`: those rows use `--cols-md` (2 columns at most). `≤900px`: 1 column, and `.callout`
  becomes 1 column. `≤760px`: `.tool-cards` 1 column. `≤640px`: `.detail-grid` 1 column.
- `≤1080px`: the playground sidebar stops being sticky and moves above the content.
- Fan arrows are redrawn on load, resize and every step change. A fork draws only the hubs and
  targets whose nearest `.fork-zone` is itself, so nested forks do not double-draw.
- `body` keeps `word-break: keep-all` so Korean words do not break mid-word.
