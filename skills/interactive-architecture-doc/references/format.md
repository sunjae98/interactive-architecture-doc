# Document format (IR)

This page is the **walkthrough** style (the default): a component map that the reader steps through
scenario by scenario. The **overview** style, one layered diagram for docs pages, has its own page:
[format-overview.md](format-overview.md). `meta.style` selects the format.

An interactive architecture document is a single JSON file. `scripts/iad.mjs` validates it and
renders it into one self-contained HTML file. **Never edit the rendered HTML**: edit the JSON
and render again. The rendered HTML embeds a copy of the JSON in
`<script type="application/json" id="iad-data">`, so the JSON can be recovered from it.

The validator (`scripts/lib/validate.mjs`) is the single source of truth. This page describes the
same rules; a test fails if the rule tables (this page plus format-overview.md) and the validator
drift apart. Commands and options: [cli.md](cli.md). Documents from v2 (top-level `steps` / `board`)
are rejected with `E_V2_WALKTHROUGH`; see [migration-v2.md](migration-v2.md).

## What the reader sees

A header (title, intro, fact chips), one card per scenario, and the **stage**: the component map
with its controls (previous, next, auto play, restart, step counter, progress bar, step list) and a
narration panel. Before the first step the panel shows the scenario's `lead`; at each step it shows
what moves, where it lives and what happens if it fails, while the step's edges light up and a token
travels along them. Clicking a box shows its `facts`. Under the stage: the summary (`tldr`), tables
and the legend.

## Top level

| Field | Required | Type | Notes |
|---|---|---|---|
| `meta` | yes | object | see below |
| `legend` | yes | object | see below |
| `nodes` | yes | array (1..64) | the boxes of the map |
| `edges` | yes | array (≥1) | the arrows between them |
| `scenarios` | yes | array (1..6) | one card each; each has its own steps |
| `groups` | no | array | dashed boxes around nodes |
| `gauges` | no | array | a fill gauge drawn inside a node, set by steps |
| `tldr` | no | object | `{title?, points: string[]}`: a numbered summary under the map |
| `tables` | no | array | `{title, columns: string[], rows: string[][]}`; one cell per column |
| `callouts` | no | array of `{title, body}` | cards under the map |
| `considerations` | no | object | `{title, items[{decision, why}]}`; every decision needs a `why` |
| `tool_examples` | no | object | `{title, lead?, tools[{name, code, note?}]}` |

### `meta`

| Field | Required | Notes |
|---|---|---|
| `title` | yes | plain text; also the page `<title>` |
| `intro` | no | markup; the line under the title |
| `facts` | no | `[{label, value, mono?}]`: chips under the intro; `mono` (default true) sets the value in the mono font |
| `source` | no | markup; the footer |
| `style` | no | `"walkthrough"` (default) or `"overview"` |
| `lang` | no | `"en"` (default) or `"ko"`: UI strings only. Author text is never translated |

### `legend`

| Field | Required | Notes |
|---|---|---|
| `nodes` | yes | `{kind: label}`: what each node kind means **in this document**. Every kind used by a node needs a label |
| `edges` | no | `{file?, text?, ctrl?}`: labels of the three line styles (defaults come from the UI strings) |
| `tokens` | no | `[{kind, text}]`: token samples shown in the legend |

Node kinds are fixed; their meaning is whatever the legend says.

| Kind | Typical meaning | Color |
|---|---|---|
| `client` | who starts the flow (app, browser, user) | crimson |
| `infra` | load balancer, gateway, queue | violet |
| `app` | a step of the system being described | amber |
| `store` | disk, database, cache | green |
| `tool` | an internal tool or a person's console | gray |
| `dep` | an external service or dependency | blue |

### `nodes[]`

| Field | Required | Notes |
|---|---|---|
| `id` | yes | lowercase words joined by `-` or `_`, unique |
| `kind` | yes | one of the six kinds |
| `title` | yes | plain text |
| `mono` | no | plain; a mono subtitle in the kind's color |
| `sub` | no | up to 3 plain lines |
| `lines` | no | fixed-width lines (leading spaces are kept). An item is a string or `{text, muted?}`; `muted: true` draws it in the muted color |
| `facts` | no | markup lines shown when the box is clicked (`W_FACTS_MISSING` without them) |
| `group` | no | a group id |
| `lane`, `row` | no | layout hints (0..64); see [Layout](#layout) |
| `span`, `rows` | no | lanes / rows the box covers (1..64) |
| `x`, `y` | no | absolute position in map units (both or neither, within ±1e5); wins over `lane` / `row` |
| `w`, `h` | no | forced size (> 0). A forced `h` smaller than the content is reported (`W_TEXT_LONG`) |

### `groups[]`

`{id, title, meta?, tone?}`: `id` is kebab-case; `meta` is a mono line under the title; `tone: "muted"`
dims the group with the rest of the map while a scenario is shown. The box is drawn around its members
(`node.group`), so a group's members should sit next to each other.

### `edges[]`

| Field | Required | Notes |
|---|---|---|
| `id` | yes | lowercase words joined by `-` or `_`, unique |
| `from`, `to` | yes | node ids, different from each other |
| `kind` | yes | `file` (bulk data, thick), `text` (requests and text), `ctrl` (control and responses, dotted) |
| `route` | no | `{from_side?, to_side?, via?, d?}`; see [Layout](#layout) |

### `gauges[]`

`{id, node, caption?, empty?}`: one gauge per node. A step sets it with `gauges: {id: {value, label}}`
(`value` 0..1); the value carries forward to later steps. At the start of a scenario it shows 0 and the
`empty` label, or the scenario's `gauge_empty` label for that gauge.

### `scenarios[]`

| Field | Required | Notes |
|---|---|---|
| `id` | yes | kebab-case, unique |
| `title`, `summary` | yes | the card; `summary` is the second line |
| `lead` | yes | markup; the narration before the first step |
| `tag` | no | a small label on the card ("proposal", "outage") |
| `note` | no | `{title?, items: string[]}`: a box under the lead |
| `skip` | no | `[{node, label}]`: nodes this scenario does not touch; drawn dashed with the label |
| `gauge_empty` | no | `{gaugeId: label}`: the empty label of a gauge in this scenario ("nothing written") |
| `steps` | yes | array (≥1), below |

### `scenarios[].steps[]`

| Field | Required | Notes |
|---|---|---|
| `title` | yes | markup; step list and narration heading |
| `edges` | yes | edge ids (may be empty); the token travels them in order |
| `nodes` | no | nodes highlighted without an edge; required when `edges` is empty |
| `token` | yes | `{text, kind}`: the moving chip; `kind` is `file`, `text`, `ctrl` or `err` |
| `what`, `where`, `fail` | yes | markup; the three narration boxes |
| `gauges` | no | `{gaugeId: {value: 0..1, label}}` |
| `markers` | no | `[{node, label}]`: error markers at the node's top-right corner, this step only |

## Text and markup

All text is HTML-escaped. In markup fields only `**bold**` and `` `code` `` are converted. Plain-text
fields show their characters as typed: `meta.title`, node `title` / `mono` / `sub` / `lines`, group
text, gauge text, skip and marker labels, token text and tool names / code. `W_PLACEHOLDER` flags
leftover `[...]`, `[words]` and `TODO`; it ignores bracketed constants such as `[DONE]` or `[PHONE_1]`,
and text inside `` `code` `` in markup fields.

## Layout

The map is computed when the document is rendered; the page ships a static SVG.

- **Automatic.** Lanes (columns) follow the `file` / `text` flow left to right; a node reached only by
  `ctrl` edges stacks under its source; a node without edges sits with its group. Each group gets its
  own block of lanes. When a map would be wider than 6 lanes, neighbouring lanes of the same group fold
  together so long chains run downward. Rows fill top to bottom.
- **Hints.** `lane` and `row` on some nodes are constraints on top of the automatic layout: the node
  gets exactly that lane or row, and the groups around it move or grow so they stay together. In such a
  partly automatic map a lane belongs to one group: hinting nodes of two groups (or a grouped and an
  ungrouped node) into the same lane is `E_LANE_GROUPS`, and lanes a hint skips over stay empty
  (`W_LANE_EMPTY`, drawn without width). Only when every node has a `lane` are lanes used exactly as
  given. `x` / `y` place a node outside the grid.
- **Edges.** Each edge leaves and enters its boxes on the facing sides; edges between the same pair
  are spread apart. When a curve would run through another box, the edge is routed around the boxes
  through the gaps between lanes and rows (detours sharing a gap are spread 6px apart). `route`
  overrides this: `from_side` / `to_side` (`top`, `right`, `bottom`, `left`) force the sides, `via`
  lists waypoints (`[[x, y], ...]`, drawn with rounded corners), and `d` is a raw absolute SVG path
  (`M L H V C Q Z` only, whole argument groups).
- **Seeing the geometry.** `node scripts/iad.mjs layout doc.json` prints every lane and row, the free
  gaps between them, each node's box and each edge's path, so `via` points can be read off it.
- **Warnings.** `W_EDGE_CROSSES_NODE` (an edge still runs through a box), `W_TEXT_LONG` (text wider
  than its box) and `E_LAYOUT_OVERLAP` (boxes or groups overlap, with the lanes / rows of both) come
  from the layout and run only on documents without other errors.

## Page layout

The map is drawn between 0.80x and 1.15x of its own size; small maps are not blown up. On screens
wider than 1180px the narration sits beside the map when the map fits there at 0.80x or more; otherwise
the map takes the full width and the narration moves between the map and the controls as one
what / where / fail row (at least 0.85x). A map that still does not fit scrolls sideways: the clipped
edge fades out and the current step is scrolled into view. Up to 1180px the narration sits under the
controls. The mode is decided when the page loads and when the window is resized.

## Rules

Errors (`E_*`) make `validate` exit 1 and `render` refuse. Warnings (`W_*`) are reported but do not
block. Structural rules run first; cross-reference rules run only when the structure is valid; layout
rules run only on an error-free document. `E_NODE_UNKNOWN`, `E_GROUP_UNKNOWN` and `W_TEXT_LONG` are
listed in [format-overview.md](format-overview.md) and apply here too.

| Code | Level | Meaning |
|---|---|---|
| `E_TYPE` | error | Value has the wrong JSON type, or is outside its range (lane/row/span/rows <= 64, coordinates and sizes within ±1e5, list lengths). |
| `E_REQUIRED` | error | A required field is missing. |
| `E_EMPTY` | error | A required string or array is empty. |
| `E_UNKNOWN_KEY` | error | An object has a key the format does not define (typo guard). |
| `E_UNKNOWN_KIND` | error | A node (or a `legend.nodes` key) has a kind other than client, infra, app, store, tool, dep. |
| `E_LANG` | error | `meta.lang` is not `ko` or `en`. |
| `E_STYLE` | error | `meta.style` is not `walkthrough` or `overview`. |
| `E_ENUM` | error | A value is not one of the allowed options (edge/token kind, group tone, route side, overview tone). |
| `E_ID_FORMAT` | error | An id is malformed: scenario, group and path ids are kebab-case; node, edge and gauge ids are lowercase words joined by `-` or `_`. |
| `E_ID_DUPLICATE` | error | An id (scenario, node, edge, group, gauge, path) is used more than once. |
| `E_LEGEND_MISSING_KIND` | error | A node kind used in the document is not described in `legend` (`legend.nodes` for walkthroughs). |
| `E_WHY_EMPTY` | error | `considerations.items[].why` is empty. |
| `E_V2_WALKTHROUGH` | error | The document is a v2 walkthrough (top-level `steps` or `board`); v3 replaced that format. Rewrite it by hand (references/migration-v2.md). |
| `E_EDGE_UNKNOWN` | error | A step names an edge id that does not exist. |
| `E_STEP_EMPTY` | error | A step has neither `edges` nor `nodes`, so nothing would be highlighted. |
| `E_SCENARIO_LIMIT` | error | More than 6 scenarios (there are 6 scenario colors). |
| `E_NODE_LIMIT` | error | More than 64 nodes; split the map into several documents. |
| `E_GAUGE_UNKNOWN` | error | A step (`gauges`) or a scenario (`gauge_empty`) names a gauge id that does not exist. |
| `E_GAUGE_RANGE` | error | A gauge value is outside 0..1. |
| `E_GAUGE_DUP_NODE` | error | Two gauges are drawn on the same node (one gauge per node). |
| `E_LANE_GROUPS` | error | Lane hints put nodes of different groups (or grouped and ungrouped nodes) in the same lane of a partly automatic map; each lane belongs to one group there. |
| `E_POS_PARTIAL` | error | A node has only one of `x` / `y`; absolute positions need both. |
| `E_LAYOUT_OVERLAP` | error | Two nodes, two groups, or a node and a group it does not belong to overlap on the map. |
| `E_ROUTE_PATH` | error | `route.d` is not an absolute SVG path: it must start with M and use M L H V C Q Z with whole argument groups (M/L 2, H/V 1, C 6, Q 4, Z 0) of finite numbers within ±1e5. |
| `E_EDGE_SELF` | error | An edge starts and ends at the same node (use `step.nodes` to highlight a single node). |
| `E_TABLE_SHAPE` | error | A table row does not have one cell per column. |
| `W_EDGE_UNUSED` | warning | An edge is not used by any step of any scenario. |
| `W_NODE_ISOLATED` | warning | A node has no edge. |
| `W_EDGE_CROSSES_NODE` | warning | An edge runs through a node it does not connect; set `route` or move a node. |
| `W_FACTS_MISSING` | warning | A node has no `facts`, so clicking it shows an empty panel. |
| `W_POS_IGNORED` | warning | A node has both `x`/`y` and `lane`/`row`; `x`/`y` wins and `lane`/`row` are ignored. |
| `W_GAUGE_UNUSED` | warning | No step sets this gauge, so it always shows its empty state. |
| `W_LANE_EMPTY` | warning | Lane hints leave lanes without any node; they are drawn without width, but a lower hint is usually meant. |
| `W_BADGE_CROWDED` | warning | A step badge found no spot clear of the scenario's other badges and of node boxes (many steps start on one short edge); it overlaps. |
| `W_PLACEHOLDER` | warning | A string still contains a `[...]` placeholder or `TODO`. |

## Differences from the v3 design plan

| Change | Why |
|---|---|
| `scenarios[].gauge_empty` and `{text, muted}` items in `lines` | the reference maps needed a per-scenario empty label and muted metadata lines |
| `lane` on some nodes is a constraint, not a switch to manual layout | a single hint used to invalidate the whole map |
| fully automatic maps fold to at most 6 lanes | a long chain stays readable instead of becoming a strip |
| edges are routed around boxes automatically | most crossings never need a `route` |
| lane gap +20 (not +40) where the set of groups changes | matches the reference spacing |
| lane/row/span/rows ≤ 64, coordinates and sizes within ±1e5 | bounded layout work |
| self-loop edges are rejected (`E_EDGE_SELF`) | a single-node step uses `step.nodes` |

## Starting point

`node scripts/iad.mjs init doc.json` writes a valid skeleton to fill in ([cli.md](cli.md)). Complete
examples: `examples/minimal.en.json` (a small login flow, two scenarios) and
`examples/payment-auth.en.json` (groups, a gauge, error markers, a table, four scenarios). Korean
versions: `*.ko.json`.
