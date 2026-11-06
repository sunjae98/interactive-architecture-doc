# Changelog

## 3.1.0 — 2026-11-06

Walkthrough authoring fixes. Existing 3.0.0 documents validate and render as before; the new warnings
below can appear on documents whose tokens, gauge labels or edges were already overflowing.

**Added**

- A walkthrough takes up to 8 scenarios (was 6): two more scenario color slots, `--s7` and `--s8`.
- An edge may start or end at a group (`from` / `to` = a group id) for "goes to one of these boxes":
  the arrow meets the middle of the group border that faces the other end and follows it when the
  layout changes, the step lights every member, the layout ranks it like an edge to each member, and
  members connected this way are not `W_NODE_ISOLATED`. When a node and a group share an id, the edge
  end is the node.
- Walkthrough pages keep a link to the current scenario and step in the URL (`#s2/3`), open such links
  directly, and accept `?theme=dark|light`.
- New warnings: `W_HINT_REVERSES_FLOW` (lane hints turn a `file` / `text` edge right to left) and
  `W_TOKEN_LONG` (a token is wider than the map's token chip).
- `iad layout` prints each group's title area (`titles` in `--json`).
- Live demo pages of every example in `docs/demo/`, served by GitHub Pages and linked from the READMEs.

**Changed**

- Lane hints on some nodes keep the other nodes in flow order: when hinted nodes leave their group's
  (or their own) column, the group goes back to its place in the flow and grows up to the hinted lane,
  so what follows moves right instead of ending up ahead of it.
- The moving token chip on the map is at most 220px wide: longer text is cut with `…` on whole
  characters and shown whole on hover; the narration and step list show it whole.
- Gauge labels stay inside the gauge: a longer label is cut with `…` (whole on hover), `W_TEXT_LONG`
  reports it, and the self-check fails with `gauge-fit` when a label spills out of its gauge.
- Edges and step badges keep off group titles: a long edge across several groups runs in the corridor
  under their titles, badges pick a spot clear of them, an edge that still runs over a title is
  `W_EDGE_CROSSES_NODE`, and `W_BADGE_CROWDED` counts titles too.
- `E_EDGE_SELF` also covers an edge between a group and its own member; `E_GROUP_UNKNOWN` covers an
  edge to a group without members.

## 3.0.0 — 2026-11-05

The walkthrough style is rebuilt around a **component map**. Overview documents are unchanged.

**Breaking**

- New walkthrough format. A document now has `nodes`, `edges`, optional `groups` and `gauges`, and
  `scenarios` that each carry their own `steps`. The v2 format (top-level `steps` and `board`) is
  rejected with a single `E_V2_WALKTHROUGH`; there is no automatic conversion. Rewrite v2 documents
  with [migration-v2.md](skills/interactive-architecture-doc/references/migration-v2.md).
- Node kinds are now `client`, `infra`, `app`, `store`, `tool` and `dep` (`decision`, `existing` and
  `new` are gone); `legend` became `legend.nodes`. `meta.subtitle` and `meta.entry_request` are
  removed from walkthroughs (`meta.intro` replaces the subtitle).
- `iad init --fork` is removed (exit 2); `references/migration-v1.md` is removed.
- Validator codes of the v2 walkthrough are removed: `E_BRANCH_UNKNOWN`, `E_ENTRY`,
  `E_FAN_HUB_NO_TARGET`, `E_FAN_OUTSIDE_FORK`, `E_FAN_TARGET_NO_HUB`, `E_SCENARIO_STEP_KEY`,
  `E_STEP_NO_NODE`, `E_STEP_RANGE`, `E_UNKNOWN_BLOCK`, `W_ENTRY_NO_INPUT`, `W_SCENARIO_NO_ACTIVE`,
  `W_SCENARIO_STEP_MISSING`.
- The rendered walkthrough page is new: scenario cards instead of a drop-down, a map instead of the
  block board and stepper, and export of the map instead of the whole page.

**Added**

- The page: scenario cards, the map with focus and dimming, file / text / ctrl edge styles, a token
  that moves along each step's edges, numbered step badges, previous / next / auto play / restart with
  a progress bar and step list, "what moves / where it lives / if it fails" narration, node facts,
  gauges whose values carry forward (`gauges`, `scenarios[].gauge_empty`), skipped nodes and error
  markers. Keyboard: ←/→ for steps, Enter/Space on boxes and badges. `prefers-reduced-motion` stops
  the token and the moving dash.
- Automatic layout at render time: lanes follow the data flow, ctrl-only nodes stack under their
  source, each group keeps its own block of lanes, maps wider than 6 lanes fold downward, and edges
  that would cross a box are routed around it through the gaps (shared gaps are spread apart).
- Layout hints: `lane` / `row` on a few nodes are constraints on top of the automatic layout;
  `span` / `rows`, absolute `x` / `y`, and `route` (`from_side` / `to_side`, `via`, `d`) for edges.
- `iad layout <doc> [--json]` prints the computed lanes, rows, gaps, node boxes and edge paths.
- `iad init --lanes N` and a fully automatic skeleton (no pre-filled lanes).
- Fit modes for wide maps: the narration sits beside the map when it fits at 0.80x or more, otherwise
  under it (0.85x floor); a map that still does not fit scrolls sideways, fades its clipped edge and
  follows the current step. Small maps are drawn at most 1.15x.
- Self-check (`#iad-selfcheck`) for every scenario and step: highlighted edges and nodes, narration,
  badges, gauge labels, markers, page overflow and page errors. A headless Chromium smoke test runs it
  in CI when a browser is available.
- Validator codes for the new format: `E_V2_WALKTHROUGH`, `E_EDGE_UNKNOWN`, `E_STEP_EMPTY`,
  `E_SCENARIO_LIMIT`, `E_NODE_LIMIT` (at most 64 nodes), `E_GAUGE_UNKNOWN`, `E_GAUGE_RANGE`,
  `E_GAUGE_DUP_NODE`, `E_POS_PARTIAL`, `E_LAYOUT_OVERLAP` (with the lanes and rows involved),
  `E_LANE_GROUPS` (lane hints of two groups in one lane), `E_ROUTE_PATH`, `E_EDGE_SELF`,
  `E_TABLE_SHAPE`, and the warnings `W_EDGE_UNUSED`, `W_NODE_ISOLATED`, `W_EDGE_CROSSES_NODE`,
  `W_FACTS_MISSING`, `W_POS_IGNORED`, `W_GAUGE_UNUSED`, `W_LANE_EMPTY` (lanes a hint skips over) and
  `W_BADGE_CROWDED` (no clear spot for a step badge).
- New examples: `minimal.{en,ko}` (a small login flow) and `payment-auth.{en,ko}` (groups, a gauge,
  error markers, a table, four scenarios).

**Changed**

- Export (PNG, SVG, clipboard) captures the map SVG with its styles, fonts and current colors inlined.
- `W_PLACEHOLDER` ignores bracketed constants such as `[DONE]` in walkthrough documents.

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
