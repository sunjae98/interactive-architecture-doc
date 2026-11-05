# Design system

How `assets/template.html` (walkthrough) and `assets/template.overview.html` are built. Authors never
touch the templates or the rendered HTML; they write JSON (see [format.md](format.md)) and
`scripts/iad.mjs render` fills the template. This page is for people changing the templates.

## Template slots (walkthrough)

The renderer replaces slots in a single pass (substituted content is never re-scanned). An unknown
slot is a render error.

| Slot | Filled with |
|---|---|
| `{{IAD_LANG}}` | `meta.lang` (`en` default): `<html lang>` |
| `{{IAD_CSP}}` | the Content-Security-Policy `<meta>` value (see below) |
| `{{IAD_TITLE}}` | `meta.title` as plain text |
| `{{IAD_FONTS}}` | `<style>` with `@font-face` rules for every `assets/fonts/*.woff2` (base64), or empty when there are none. `iad-sans.woff2` → family "IAD Sans", `geist-mono.woff2` → "Geist Mono" (with their variable weight ranges); any other file uses its basename, reduced to `[A-Za-z0-9 _-]` |
| `{{IAD_WT_HEADER}}` | `<h1>`, the intro (`.sub`) and the fact chips (`.facts > .fact`) |
| `{{IAD_WT_CASES}}` | one `button.case` per scenario with `data-s="s1".."s6"` (its color slot) and `data-scenario` |
| `{{IAD_WT_MAP}}` | the whole map as inline `<svg id="wtMap" class="wt-map">`, computed by `scripts/lib/walkthrough-layout.mjs` and written by `scripts/lib/walkthrough-svg.mjs` |
| `{{IAD_WT_BELOW}}` | `.below`: the summary (`tldr`), one `.table-card` per table and the legend card; then `.extra` with callouts, considerations and tool examples |
| `{{IAD_WT_FOOTER}}` | `<footer>` with `meta.source`, or empty |
| `{{IAD_DATA}}` | the full IR as JSON (`<`, U+2028, U+2029 escaped) inside `<script type="application/json" id="iad-data">` |
| `{{IAD_I18N}}` | the UI string table for `meta.lang` inside `<script type="application/json" id="iad-i18n">` |
| `{{t:key}}` | one UI string, HTML-escaped (buttons, labels, hints) |

**Content-Security-Policy.** The page loads nothing from the network, so the policy is closed:
`default-src 'none'; script-src 'sha256-…' (one per inline script); style-src 'unsafe-inline';
font-src data:; img-src data: blob:; base-uri 'none'; form-action 'none'`. The renderer computes the
hashes from the template's attribute-less `<script>` elements (the theme script, the error collector
and the runtime), so they always match the shipped code; the JSON data islands are not executed and
need no hash. Inline scripts may not contain slots (render error), which keeps the hashes and the
output byte-deterministic. Editing the runtime needs no manual CSP change.

The runtime reads only `#iad-data` (scenarios, steps, edges and nodes, legend, gauges) and `#iad-i18n`,
and works on the static SVG: it toggles classes, places the token, draws error markers and fills the
narration. It never computes layout. UI strings live in `scripts/lib/i18n.mjs` (`en` and `ko`,
identical keys).

## Tokens

All colors live in two blocks at the top of the template: `:root` (light) and `[data-theme="dark"]`.
Component CSS and JS use only `var(--…)`: a test fails on any `#hex`, `rgb(`/`rgba(`/`hsl(`, numeric
HTML entity or named color outside those two blocks.

**Source.** [Radix Colors](https://github.com/radix-ui/colors) 3.0.0 (MIT); license text in `licenses/`.
Neutral **slate**; dark mode uses the Radix dark scales.

| Tokens | Use |
|---|---|
| `--bg`, `--surface`, `--surface-2`, `--border`, `--border-soft` | page, panels and cards, inner boxes, lines |
| `--text`, `--muted` | text, secondary text |
| `--primary`, `--primary-bg` | focus rings |
| `--<kind>-bg` / `-bd` / `-tx` for `client`, `infra`, `app`, `store`, `tool`, `dep` | node fill, border, mono and line text; also the legend swatches, the token chips and gauges of nodes of that kind |
| `--s1` … `--s6` with `-bg` / `-tx` | scenario color slots: card accent, current edges and nodes, badges, step list, chips. `[data-s="sN"]` maps them to `--cc`, `--cc-bg`, `--cc-tx` |
| `--err`, `--err-bg`, `--err-tx` | error tokens and markers, the "if it fails" dot |
| `--dim` | opacity of everything outside the current scenario (0.15 light, 0.14 dark) |

Kind colors: client **crimson**, infra **violet**, app **amber**, store **green**, tool **slate**, dep
**blue**. Scenario slots: blue, purple, teal, orange, red, pink. Text steps are Radix step 11; in light
mode `app`, `store`, `dep`, `s1` and `s4` are a few percent darker than step 11 so they reach 4.5:1 on
their own background. A test parses both blocks and requires ≥ 4.5:1 for text and muted text on the
surfaces, every `--<kind>-tx` on its `-bg` and every `--sN-tx` on its `-bg`, in both themes. Current
ratios (text on its bg / on the surface):

| Kind | Light | Dark |
|---|---|---|
| client | 4.93 / 5.55 | 7.98 / 8.35 |
| infra | 5.51 / 6.02 | 7.73 / 8.43 |
| app | 4.63 / 4.91 | 10.26 / 11.49 |
| store | 4.61 / 5.03 | 7.86 / 9.38 |
| tool | 5.22 / 5.79 | 7.64 / 8.45 |
| dep | 4.63 / 5.07 | 7.08 / 8.37 |

Scenario text on its bg: 4.57 to 5.36 in light, 7.08 to 11.95 in dark.

**Fonts.** `--font-sans` = `"IAD Sans"`, then system UI and Korean system fonts, `sans-serif`, then the
system emoji fonts (Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji) for emoji in author text.
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

**Rendered size.** Fonts are ~516 KB of woff2 (~689 KB as base64). Rendered examples: `minimal.en`
766,486 B, `minimal.ko` 767,992 B, `payment-auth.en` 780,977 B, `payment-auth.ko` 782,158 B, all well
under the 1.5 MB threshold for falling back to system fonts.

## Dark mode

- An inline script at the top of `<head>` sets `data-theme="light"|"dark"` on `<html>` before the CSS
  is parsed (no flash): the saved choice from `localStorage["iad-theme"]` if any, otherwise
  `prefers-color-scheme`. Without a saved choice the page keeps following OS changes.
- The icon button in the header (`#pgTheme`, `.theme-toggle`) flips the attribute and saves the
  choice. It shows a moon in light mode and a sun in dark mode, and its `aria-label`/`title` name the
  action (`theme_to_dark` / `theme_to_light`). Every `localStorage` access is in `try/catch`: on
  `file://` pages storage can be blocked, and then the choice lasts until reload. The key is shared by
  all documents of the same origin.
- Export copies the current token values, so images match the theme on screen.

## The map (SVG)

Every map rule starts with `.wt-map`, so the export can copy exactly those rules (a test checks this).
Text sizes match `TEXT_WT` in `scripts/lib/walkthrough-layout.mjs`, which estimates text width for
`W_TEXT_LONG` with widths measured from the embedded fonts; change both together.

| Element | Markup |
|---|---|
| group | `g.grp[.grp-muted]` with `rect`, `text.gt` (title), `text.gm` (meta) |
| edge | `g.edge[data-id][data-k=file|text|ctrl]` with `path.hit` (wide, transparent click target) and `path.ln` |
| node | `g.node.<kind>[data-id]` (`tabindex="0"`, `role="button"`) with `rect.box`, `text.nt` (title), `.nm` (mono), `.ns` (sub), `.nl[.m]` (lines, `white-space:pre`), the gauge (`rect.gauge-bg`, `rect.gauge[data-gauge]`, `text.gauge-l`) and one `g.skipmark[data-s]` per scenario that skips it |
| badges | one `g.badges[data-s]` per scenario, each `g.badge[data-step]` (`tabindex`, `role="button"`) at a build-time position |
| runtime layers | `g.wt-markers` (error markers) and `g.wt-tokens` (the moving token) |

State classes, set by the runtime only: `svg.focus` (a scenario is shown), `.on` (used by the
scenario), `.cur` (current step), `.skip`, `.sel` (box whose facts are open), `.badges.show`,
`.badge.cur`, `.skipmark.show`. Current edges use the scenario color with a moving dash
(`@keyframes wt-flow`); other edges and nodes fade to `--dim`.

**Token.** A chip with the step's `token.text` travels the step's edges in order, eased, with a short
hold, trimmed so it never covers the source or target box. With `prefers-reduced-motion` it rests in
the middle of the route and the dash does not move.

## Stage and responsiveness

- The map and the controls are two joined panels (`.map-panel`, `.ctrl-panel`); the narration
  (`aside.detail`) is a third grid area. `#stage[data-fit]` picks the arrangement:
  - `side` (wide screens, the map fits beside the narration at ≥ 0.80x): narration column of 340px,
    sticky.
  - `stacked` (wide screens, it does not): map full width, narration between map and controls with
    what / where / fail as three columns.
  - `narrow` (≤ 1180px): map, controls, then the narration (the reference layout).
  The runtime decides at load and on resize (debounced); everything else is CSS.
- The map is drawn at most 1.15x and at least 0.85x of its viewBox width (0.80x in `side`); below that
  `.diagram` scrolls sideways, `.map-wrap` fades the clipped edge (`.fade-l` / `.fade-r`), a step
  change scrolls its nodes and edges into view (smooth unless reduced motion) and the full path or a
  new scenario scrolls back to the start.
- `≤ 820px`: 3 scenario cards per row, step list in one column. `≤ 640px`: 2 cards per row without the
  summary line, the cards below stack.
- `body` keeps `word-break: keep-all` so Korean words do not break mid-word.

## Keyboard

←/→ move between steps from anywhere except text fields (also while a box has focus). Boxes and
badges are focusable and open with Enter or Space. Opening a box's facts stops auto play.

## Export

The PNG / SVG / copy buttons at the right end of the control bar export **the map** in its current
state (theme, scenario, step, token, markers). The SVG is a clone of the live one with every
`.wt-map` rule (including those inside `@media` blocks that match now), the `@font-face` rules, the
current token values and the scenario color (`--cc*`) inlined, a background rect and no
transitions or animations. PNG rasterizes that SVG through a `data:` URL in an `<img>` and a canvas
(2x, capped at ~16 MP and 16384 px per side). Copy creates its `ClipboardItem` synchronously inside the
click (Safari). Files are named `<title>-<scenario id>[-<step>]`. Failures never throw: the status line
(`role="status"`) explains what happened and suggests SVG or PNG (`export_*` UI strings).

## Self-check

`doc.html#iad-selfcheck` (or `window.iadSelfCheck()`, which returns a Promise) checks the page from the
inside so agents and tools can verify a render without screenshots. Result format and checks:
[cli.md](cli.md).

- A small inline script in `<head>` (hashed in the CSP like the others) collects `error`,
  `unhandledrejection` and `securitypolicyviolation` events from load onward into `window.__iadErrors`.
- After `load` and `document.fonts.ready`, the runtime selects every scenario and every step (-1
  included), compares the page (current edges and nodes, narration, badges, gauge labels, markers,
  page overflow) with what the IR says, and turns differences into failures with `judgeStep()` in the
  pure-helpers block (unit-tested in `test/runtime.test.mjs`; `test/smoke.test.mjs` runs it in headless
  Chromium when one is installed).
- Afterwards the scenario and step are restored and the map is scrolled to its start. The JSON goes
  into `<pre id="iad-selfcheck-result" data-state="pass|fail">` (visually hidden, still readable as
  text) and one `IAD_SELFCHECK {json}` console line.

## Overview template

`assets/template.overview.html` renders documents with `meta.style: "overview"`
([format-overview.md](format-overview.md)). It shares the language, CSP, title, fonts, data and UI-string
slots with the walkthrough template, uses `{{IAD_HEADER}}` (`<h1>` + subtitle) for its header, and adds
three of its own:

| Slot | Filled with |
|---|---|
| `{{IAD_OV_TABS}}` | `.ov-tabs` with an "Overview" tab and one tab per path, or empty without paths |
| `{{IAD_OV_DIAGRAM}}` | the whole diagram as inline `<svg class="ov-diagram">`, positions computed by `scripts/lib/layout.mjs` |
| `{{IAD_OV_CAPTIONS}}` | one `.ov-caption` per view (`data-caption=""` for the overview, the path id otherwise) |

The diagram is static SVG, so it needs no layout code in the browser. The runtime only toggles
`.has-path` on the SVG and `.on` on the nodes and edges of the selected path. It also swaps edge labels
(`data-for`), switches captions and runs the theme toggle, export and self-check.

- **Tokens**: Radix slate and blue steps (token names `--color-*`), plus `--outer-*` for solid
  "outside the system" nodes (dark on light, light on dark). There is one accent, blue, and it marks
  the selected path. There is no kind palette or legend.
- **Text metrics**: the font sizes in the `.ov-diagram` rules match `TEXT` in
  `scripts/lib/layout.mjs`, which estimates text width for `W_TEXT_LONG`. Change both together.
- **Export**: PNG, SVG and clipboard export the diagram only, in the current theme and path. The SVG
  copy carries every rule whose selector starts with `.ov-diagram`, the `@font-face` rules and the
  live token values, so it renders the same in docs sites and image viewers. Keep diagram rules
  scoped to `.ov-diagram` (a test checks this).
- **Responsive**: the figure scrolls horizontally below 640px instead of shrinking the text.
