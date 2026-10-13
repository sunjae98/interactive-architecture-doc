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
| `{{IAD_FONTS}}` | `<style>` with `@font-face` rules for every `assets/fonts/*.woff2` (base64), or empty when there are none. `iad-sans.woff2` → family "IAD Sans", `geist-mono.woff2` → "Geist Mono" (with their variable weight ranges); any other file uses its basename |
| `{{IAD_HEADER}}` | `<h1>` + subtitle |
| `{{IAD_TLDR}}` | `.tldr` box, or empty |
| `{{IAD_STEPPER}}` | `.stepper` with one `.step` per `steps[]` entry |
| `{{IAD_LEGEND}}` | `.legend`, kinds in the fixed order client, decision, existing, new |
| `{{IAD_BOARD}}` | the board blocks |
| `{{IAD_SECTIONS}}` | `.callout`, `.considerations`, `.tool-examples` (each only if present) |
| `{{IAD_DATA}}` | the full IR as JSON (`<`, U+2028, U+2029 escaped) inside `<script type="application/json" id="iad-data">` |
| `{{IAD_I18N}}` | the UI string table for `meta.lang` inside `<script type="application/json" id="iad-i18n">` |
| `{{t:key}}` | one UI string, HTML-escaped (buttons, panel titles, step hint) |

The runtime reads only `#iad-data` (`steps.length`, `scenarios`, `meta.entry_request`, and `meta.title` for export file names) and
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

## Export

The sidebar's **Export current view** panel saves what the reader is looking at — the selected
scenario at the current step — as **PNG**, **SVG** or a **clipboard image**. Everything runs in the
page; no network, no dependencies.

**What is captured.** Elements marked `data-export`, in document order: `h1`, `.subtitle` (when
present), `.stepper`, `.legend`, `.board`, and `.export-caption`. The caption reads
`<scenario icon + label> · Step N/T` (`export_caption` in the UI tables) and is `display:none` on the
live page. The TL;DR, the step hint, the sections below the board and the sidebar are not captured.
Highlights (`.active`, `.altpath`), the entry request filled for the scenario, and the fan arrows are
captured as they are on screen.

**How.** On click the runtime:

1. calls `draw()` so fan arrows match the live layout, then clones every `[data-export]` element into
   one `.iad-export` root whose width is fixed to the live width of `.main` plus 24 px padding;
2. inlines the page CSS: every rule of `document.styleSheets`, with `@media` / `@supports` blocks kept
   only when they match **now** (`matchMedia`), so the export uses the live column count, not the
   SVG's own viewport. `@font-face` rules (base64 fonts) come along, and the current values of all
   tokens declared in `:root` / `[data-theme]` rules are written onto the root, together with the
   page's `data-theme` — the active theme is exported;
3. applies the export-only rules in the template's *Export* block (no transitions/animations,
   stepper wraps and is not scrollable or sticky, caption shown);
4. measures the height off-screen and wraps the root in
   `<svg><foreignObject><div xmlns="http://www.w3.org/1999/xhtml">` via `XMLSerializer`.

SVG saves that string as-is (it opens on its own in a browser). PNG loads it as a
`data:image/svg+xml` URL into an `<img>` (keeps the canvas untainted), draws it on a canvas and calls
`toBlob`. Copy image creates `new ClipboardItem({"image/png": promise})` synchronously inside the
click handler (required for user activation, notably in Safari) and passes it to
`navigator.clipboard.write`.

**Files.** `<title>-<scenario id>-step<N>.png` / `.svg` (step 0 = nothing selected). The title has
`< > : " / \ | ? *` and control characters removed, whitespace turned into `-`, and is cut at 80
characters; non-Latin letters are kept.

**Limits.**

- Scale starts at `devicePixelRatio` capped at 2, then shrinks (fractional) until the canvas is at
  most ~16 MP and no side exceeds 16384 px. Very tall boards therefore export at lower resolution.
- Only what the page's CSS draws is captured: form controls, external images and cross-origin
  stylesheets are skipped (the template has none of these).
- `foreignObject` rendering differs by browser. Chrome/Edge are the reference. Safari has historically
  tainted canvases drawn from `foreignObject` SVG, which makes PNG/copy fail there; SVG still works.
- Emoji in scenario icons use the system emoji font; how it rasterizes depends on the browser.
- The clipboard needs a secure context (`file://` and `https://` qualify in Chrome) and a browser with
  `ClipboardItem` image support.

**Failure behavior.** Errors never throw to the console; the status line under the buttons
(`role="status"`, red via `data-state="error"`) explains what happened and offers an alternative:

| Situation | Message key |
|---|---|
| canvas `SecurityError`, `toBlob` returned `null`, SVG image failed to load | `export_png_failed` (suggests SVG) |
| SVG could not be built | `export_svg_failed` |
| no `navigator.clipboard.write` / `ClipboardItem` | `export_clip_unsupported` (suggests PNG or SVG) |
| clipboard write rejected (permission, focus) | `export_clip_denied` (suggests PNG or SVG) |

Buttons are disabled while an export is running (`export_busy`); success shows `export_saved` with
the file name or `export_copied`.
