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
| `{{IAD_CSP}}` | the Content-Security-Policy `<meta>` value (see below) |
| `{{IAD_TITLE}}` | `meta.title — subtitle` as plain text |
| `{{IAD_FONTS}}` | `<style>` with `@font-face` rules for every `assets/fonts/*.woff2` (base64), or empty when there are none. `iad-sans.woff2` → family "IAD Sans", `geist-mono.woff2` → "Geist Mono" (with their variable weight ranges); any other file uses its basename, reduced to `[A-Za-z0-9 _-]` |
| `{{IAD_HEADER}}` | `<h1>` + subtitle |
| `{{IAD_TLDR}}` | `.tldr` box, or empty |
| `{{IAD_STEPPER}}` | `.stepper` with one `.step` per `steps[]` entry |
| `{{IAD_LEGEND}}` | `.legend`, kinds in the fixed order client, decision, existing, new |
| `{{IAD_BOARD}}` | the board blocks |
| `{{IAD_SECTIONS}}` | `.callout`, `.considerations`, `.tool-examples` (each only if present) |
| `{{IAD_DATA}}` | the full IR as JSON (`<`, U+2028, U+2029 escaped) inside `<script type="application/json" id="iad-data">` |
| `{{IAD_I18N}}` | the UI string table for `meta.lang` inside `<script type="application/json" id="iad-i18n">` |
| `{{t:key}}` | one UI string, HTML-escaped (buttons, panel titles, step hint) |

**Content-Security-Policy.** The page loads nothing from the network, so the policy is closed:
`default-src 'none'; script-src 'sha256-…' (one per inline script); style-src 'unsafe-inline';
font-src data:; img-src data: blob:; base-uri 'none'; form-action 'none'`. The renderer computes the
hashes from the template's attribute-less `<script>` elements (the theme script and the two runtime
scripts), so they always match the shipped code; the JSON data islands are not executed and need no
hash. Inline scripts may not contain slots (render error), which keeps the hashes and the output
byte-deterministic. Editing a runtime script needs no manual CSP change.

The runtime reads only `#iad-data` (`steps.length`, `scenarios`, `meta.entry_request`, and `meta.title` for export file names) and
`#iad-i18n`. The drop-down options are built from `scenarios`, so they can never disagree with the
board. UI strings live in `scripts/lib/i18n.mjs` (`en` and `ko`, identical keys).

## Tokens

All colors live in two blocks at the top of the template: `:root` (light) and `[data-theme="dark"]`
(only the tokens that differ). Component CSS and JS use only `var(--…)` — a test fails on any `#hex`,
`rgb(`/`rgba(`/`hsl(`, numeric HTML entity or named color outside those two blocks. Each value carries a
comment naming its source scale and step.

**Sources.** Colors: [Radix Colors](https://github.com/radix-ui/colors) 3.0.0 (MIT). Spacing, radius and
shadows: [Primer Primitives](https://github.com/primer/primitives) 11.10.0 (MIT). License texts are in
`licenses/`. Only the steps listed below are used.

**Scales.** Neutral **slate** (cool gray; it sits next to the blue primary and is closest to the v1
grays — sand was the alternative). Kinds: client **crimson**, decision **violet**, existing **green**,
new **amber**. Primary **blue**. Dark mode uses the same step numbers from the Radix dark scales.

| Token | Radix step (light → dark uses the same step of the dark scale) | Use |
|---|---|---|
| `--color-bg` | slate 2 (dark: slate 1) | page |
| `--color-surface` | slate 1 (dark: slate 2) | cards, nodes, playground |
| `--color-surface-2` | slate 3 | badges, inline code, button hover |
| `--color-border` | slate 6 | lines and borders |
| `--color-text` / `--color-text-muted` | slate 12 / slate 11 | text, secondary text |
| `--color-hatch` | slate 1 (dark: slate 2) | diagonal stripes of `.internal` |
| `--line` | slate 8 | fan arrows (SVG uses `currentColor`; `.zone-overlay` sets `color:var(--line)`) |
| `--color-primary` | blue 9 | stepper numbers, primary button |
| `--color-primary-bg` / `--color-primary-text` | blue 3 / blue 12 (dark: blue 11) | scenario pill, pressed theme toggle |
| `--color-on-solid` | white | text on step-9 fills |
| `--color-code-bg` | slate **dark** 1 in both themes | code blocks are dark in both themes |
| `--color-code-text`, `--kind-decision-code-text`, `--kind-new-code-text` | green / violet / amber **dark** 11 in both themes | code text |
| `--kind-<k>-bg` | 3 | tinted node background (client, decision), tags, badges |
| `--kind-decision-tag-bg` | violet 4 | decision tag |
| `--kind-existing-zone-bg` | green 2 | `.external-zone` |
| `--kind-<k>-border` | 7 | node and zone borders |
| `--kind-<k>-solid` | 9 | step badge, legend dot |
| `--kind-new-on-solid` | amber 12 | text on the amber 9 badge (white is 1.6:1) |
| `--kind-<k>-text` | 11; **12** for existing and new in light | kind-colored text |

Green 11 and amber 11 reach only 4.21:1 / 4.25:1 on their step-3 background in light mode, so those two
kinds (and the primary pill, blue 11 = 4.25:1) use step 12 in light. A test parses both blocks and
requires ≥ 4.5:1 (WCAG AA) for every `--kind-<k>-text` on its `-bg`, `--color-surface` and `--color-bg`,
light and dark, plus muted text, tags, the pill and code text. Current ratios (text on bg 3 / surface / page):

| Kind | Light | Dark |
|---|---|---|
| client (crimson 11) | 4.66 / 5.26 / 5.13 | 7.65 / 8.35 / 8.95 |
| decision (violet 11) | 5.51 / 6.02 / 5.87 | 7.34 / 8.43 / 9.03 |
| existing (green 12 light, 11 dark) | 11.00 / 12.01 / 11.71 | 7.86 / 9.38 / 10.06 |
| new (amber 12 light, 11 dark) | 10.47 / 11.09 / 10.81 | 10.26 / 11.49 / 12.32 |

Known limit: white on blue 9 (primary button, stepper numbers) is 3.26:1 — Radix's intended pairing,
kept as is; it is not body text.

**Primer scales** (values in px; the Primer name is in the template comment):

| Token | Value | Primer |
|---|---|---|
| `--space-1` … `--space-6` | 4, 6, 8, 12, 24, 32 | `base-size-4/6/8/12/24/32` |
| `--radius-dot` | 3 | `borderRadius-small` |
| `--radius-tag`, `-badge`, `-control`, `-node` | 6 | `borderRadius-medium` |
| `--radius-card`, `-zone`, `-internal` | 12 | `borderRadius-large` |
| `--radius-pill` | 9999 | `borderRadius-full` |
| `--shadow-card` | `shadow-resting-medium` | TL;DR box |
| `--shadow-panel` | `shadow-floating-small` | playground |
| `--shadow-active` | 3px blue 8 ring + `shadow-floating-small` (without its 1px ring) | active node |

Shadows use Primer's light values in `:root` and its dark values in the dark block.

**Fonts.** `--font-sans` = `"IAD Sans"`, then system UI and Korean system fonts, `sans-serif`, then the
system emoji fonts (Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji) for scenario icons.
`--font-mono` = `"Geist Mono"`, system monospace, `monospace`, emoji fonts. Both families are inlined by
the renderer from `assets/fonts/` as variable fonts (`font-weight` ranges 45–930 and 100–900).
IAD Sans is a subset of Pretendard Variable 1.3.9 renamed because Pretendard is a Reserved Font Name
under its OFL (see `THIRD_PARTY_NOTICES.md` and `tools/build-fonts/README.md` in the repository);
Geist Mono 1.7.2 has no Reserved Font Name.

**Glyph coverage.** Both fonts carry Basic Latin, Latin-1 (punctuation and the letters U+00C0–00FF,
e.g. `é ü ñ ß`), common punctuation/arrows/symbols; IAD Sans adds the 2,350 KS X 1001 Hangul
syllables. Everything else falls back to the system fonts in the stack: Hangul syllables outside
KS X 1001 (e.g. `똠 쀍 햏`), Hangul Jamo, Hanja/CJK, Latin Extended (e.g. `ő ł ş`), Greek, Cyrillic,
and emoji. Fallback text stays readable but its metrics differ slightly from IAD Sans.

**Rendered size.** Fonts are ~516 KB of woff2 (~689 KB as base64). Rendered examples:
`minimal.en` 740,232 B, `minimal.ko` 740,909 B, `three-branch.en` 762,384 B, `three-branch.ko`
764,616 B. All are well under the 1.5 MB threshold the plan set for falling back to system fonts, so
both fonts stay embedded (decision recorded 2026-10-13).

## Dark mode

- An inline script at the top of `<head>` sets `data-theme="light"|"dark"` on `<html>` before the CSS
  is parsed (no flash): the saved choice from `localStorage["iad-theme"]` if any, otherwise
  `prefers-color-scheme`. Without a saved choice the page keeps following OS changes.
- The icon button fixed to the top-right corner (`#pgTheme`, `.theme-toggle`) flips the attribute and
  saves the choice. It shows a moon in light mode and a sun in dark mode (inline SVG, `currentColor`), and its
  `aria-label`/`title` name the action (`theme_to_dark` / `theme_to_light` in the UI tables). It is not part of
  the export. Every `localStorage` access is in `try/catch`: on `file://` pages storage can be
  blocked, and then the choice simply lasts until reload. The key is shared by all documents of the
  same origin, so the choice carries over between documents.
- `color-scheme` is set per theme so native controls (select, scrollbars) follow.
- Export copies the live `data-theme` and current token values, so images match the theme on screen.

## Node kinds

| Class | Default meaning | Color |
|---|---|---|
| `.node.client` | client outside the system | crimson (tinted background) |
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
- Fan arrows are redrawn on load, resize, when a `.fork-zone` changes size (`ResizeObserver`,
  debounced), when web fonts finish loading (`document.fonts.ready`) and on every step change. A fork draws only the hubs and
  targets whose nearest `.fork-zone` is itself, so nested forks do not double-draw.
- Fan arrows go only to targets that are the **first node of their column** and whose column starts
  in the **first grid row** of the fork. When the columns wrap (2 columns) or stack (1 column,
  ≤900px), lower targets get no arrow, so no line runs through the nodes above them; a stacked fork
  shows one short connector from the hub into the first column. Arrows stop a few px above a
  column's `.fork-title` (or, without a title, above the node's step badge) rather than crossing it.
- `.arrow-label` and `.fork-title` have a bottom margin that clears the step badge (`.node .num`,
  10 px above the node plus its 2 px ring), so badges never overlap labels or titles.
- `≤1080px`: `.layout` stretches its children; as fit-content flex items the nowrap stepper would
  otherwise widen the page.
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

1. shows `export_busy` and waits one paint (PNG/SVG), disables `.node` transitions while it calls
   `draw()` so fan arrows match the settled layout (an active node may be mid-scale), then clones every `[data-export]` element into
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
`data:image/svg+xml` URL into an `<img>` (keeps the canvas untainted), waits for `img.decode()`
where available (embedded fonts are ready on the first export), draws it on a canvas and calls
`toBlob`. Copy image creates `new ClipboardItem({"image/png": promise})` synchronously inside the
click handler (required for user activation, notably in Safari) and passes it to
`navigator.clipboard.write`.

**Files.** `<title>-<scenario id>-step<N>.png` / `.svg` (step 0 = nothing selected). The title has
`< > : " / \ | ? *` and control characters removed, whitespace turned into `-`, and is cut at 80
characters; non-Latin letters are kept.

**Limits.**

- Scale starts at `devicePixelRatio` clamped to 1..2, then shrinks (fractional) until the canvas is at
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

## Self-check

`doc.html#iad-selfcheck` (or `window.iadSelfCheck()`, which returns a Promise) checks the page from the
inside so agents and tools can verify a render without screenshots. Result format: [cli.md](cli.md).

- A small inline script in `<head>` (hashed in the CSP like the others) collects `error`,
  `unhandledrejection` and `securitypolicyviolation` events from load onward into `window.__iadErrors`.
- The playground waits for `load` and `document.fonts.ready`, stops auto-play, adds `.iad-measuring`
  (no transitions) and, for every scenario × step, calls the real `render()` and `draw()` without
  scrolling, then records: number of `.active` nodes, `#pgData` text, the entry request text, visible
  fan targets vs. drawn `line`/`path` elements per `.fork-zone`, and `scrollWidth` vs. `clientWidth`.
  `judgeStep()` and `selfCheckResult()` in the pure-helpers block turn that into failures and warnings
  (unit-tested in `test/runtime.test.mjs`).
- Afterwards the scenario, step, auto-play and scroll position are restored. The JSON goes into a
  `<pre id="iad-selfcheck-result" data-state="pass|fail">` created on demand (visually hidden with
  `clip-path`, still readable as text) and one `IAD_SELFCHECK {json}` console line. Without the hash
  nothing runs; setting the hash later (`hashchange`) runs it too.

## Overview template

`assets/template.overview.html` renders documents with `meta.style: "overview"`
([format-overview.md](format-overview.md)). It shares the language, CSP, title, fonts, header, data
and UI-string slots with the walkthrough template, and adds three of its own:

| Slot | Filled with |
|---|---|
| `{{IAD_OV_TABS}}` | `.ov-tabs` with an "Overview" tab and one tab per path, or empty without paths |
| `{{IAD_OV_DIAGRAM}}` | the whole diagram as inline `<svg class="ov-diagram">`, positions computed by `scripts/lib/layout.mjs` |
| `{{IAD_OV_CAPTIONS}}` | one `.ov-caption` per view (`data-caption=""` for the overview, the path id otherwise) |

The diagram is static SVG, so it needs no layout code in the browser. The runtime only toggles
`.has-path` on the SVG and `.on` on the nodes and edges of the selected path. It also swaps edge labels
(`data-for`), switches captions and runs the theme toggle, export and self-check.

- **Tokens**: the same Radix slate and blue steps as the walkthrough, plus `--outer-*` for solid
  "outside the system" nodes (dark on light, light on dark). There is one accent, blue, and it marks
  the selected path. There is no kind palette or legend.
- **Text metrics**: the font sizes in the `.ov-diagram` rules match `TEXT` in
  `scripts/lib/layout.mjs`, which estimates text width for `W_TEXT_LONG`. Change both together.
- **Export**: PNG, SVG and clipboard export the diagram only, in the current theme and path. The SVG
  copy carries every rule whose selector starts with `.ov-diagram`, the `@font-face` rules and the
  live token values, so it renders the same in docs sites and image viewers. Keep diagram rules
  scoped to `.ov-diagram` (a test checks this).
- **Responsive**: the figure scrolls horizontally below 640px instead of shrinking the text.
