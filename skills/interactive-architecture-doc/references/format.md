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
| `scenarios` | yes | array (1..8) | one card each; each has its own steps |
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
| `from`, `to` | yes | node ids or group ids, different from each other. A group end ("one of these boxes") meets the middle of the group border that faces the other end; see below |
| `kind` | yes | `file` (bulk data, thick), `text` (requests and text), `ctrl` (control and responses, dotted) |
| `route` | no | `{from_side?, to_side?, via?, d?}`; see [Layout](#layout) |

An edge to or from a group stands for "one of the group's boxes": a step that uses it lights up every
member, the automatic layout ranks it like an edge to each member, and the members count as connected
(no `W_NODE_ISOLATED`). The arrow follows the group border when the layout changes, so it needs no
`route.d`. When a node and a group share an id, the edge end is the node. A group cannot connect to
its own member (`E_EDGE_SELF`).

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
  gets exactly that lane or row, and the groups around it move or grow so they stay together. The other
  nodes keep their flow order: a hint further right than the node's place in the flow pushes what
  follows to the right. A hint further left can only move its group ahead of its predecessors; the
  edges it turns right to left are reported (`W_HINT_REVERSES_FLOW`). In such a
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

## Links to a scenario or step

The page keeps its URL in step with what the reader sees, so any view can be shared: `doc.html#s2` opens
scenario 2 on its full path and `doc.html#s2/3` opens scenario 2 at step 3 (both 1-based, in the
order of `scenarios` and `steps`). The hash is updated without adding browser history entries; the
first scenario's full path has no hash. A link to a scenario or step that does not exist opens the
default view. `?theme=dark` or `?theme=light` forces a theme for that visit without saving it. The
self-check hash `#iad-selfcheck` is unaffected.

## Page layout

The map is drawn between 0.80x and 1.15x of its own size; small maps are not blown up. On screens
wider than 1180px the narration sits beside the map when the map fits there at 0.80x or more; otherwise
the map takes the full width and the narration moves between the map and the controls as one
what / where / fail row (at least 0.85x). A map that still does not fit scrolls sideways: the clipped
edge fades out and the current step is scrolled into view. Up to 1180px the narration sits under the
controls. The mode is decided when the page loads and again whenever the page's width changes.

## Rules

Errors (`E_*`) make `validate` exit 1 and `render` refuse. Warnings (`W_*`) are reported but do not
block. Structural rules run first; cross-reference rules run only when the structure is valid; layout
rules run only on an error-free document. `E_NODE_UNKNOWN`, `E_GROUP_UNKNOWN` and `W_TEXT_LONG` are
listed in [format-overview.md](format-overview.md) and apply here too; in a walkthrough an edge end that
is neither a node nor a group is `E_NODE_UNKNOWN`, and one that names a group without members is
`E_GROUP_UNKNOWN`.

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
| `E_SCENARIO_LIMIT` | error | More than 8 scenarios (there are 8 scenario colors). |
| `E_NODE_LIMIT` | error | More than 64 nodes; split the map into several documents. |
| `E_GAUGE_UNKNOWN` | error | A step (`gauges`) or a scenario (`gauge_empty`) names a gauge id that does not exist. |
| `E_GAUGE_RANGE` | error | A gauge value is outside 0..1. |
| `E_GAUGE_DUP_NODE` | error | Two gauges are drawn on the same node (one gauge per node). |
| `E_LANE_GROUPS` | error | Lane hints put nodes of different groups (or grouped and ungrouped nodes) in the same lane of a partly automatic map; each lane belongs to one group there. |
| `E_POS_PARTIAL` | error | A node has only one of `x` / `y`; absolute positions need both. |
| `E_LAYOUT_OVERLAP` | error | Two nodes, two groups, or a node and a group it does not belong to overlap on the map. |
| `E_ROUTE_PATH` | error | `route.d` is not an absolute SVG path: it must start with M and use M L H V C Q Z with whole argument groups (M/L 2, H/V 1, C 6, Q 4, Z 0) of finite numbers within ±1e5. |
| `E_EDGE_SELF` | error | An edge starts and ends at the same node, or connects a group with one of its own members (use `step.nodes` to highlight a single node). |
| `E_TABLE_SHAPE` | error | A table row does not have one cell per column. |
| `W_EDGE_UNUSED` | warning | An edge is not used by any step of any scenario. |
| `W_NODE_ISOLATED` | warning | A node has no edge (an edge to or from its group counts). |
| `W_EDGE_CROSSES_NODE` | warning | An edge runs through a node it does not connect; set `route` or move a node. |
| `W_FACTS_MISSING` | warning | A node has no `facts`, so clicking it shows an empty panel. |
| `W_POS_IGNORED` | warning | A node has both `x`/`y` and `lane`/`row`; `x`/`y` wins and `lane`/`row` are ignored. |
| `W_GAUGE_UNUSED` | warning | No step sets this gauge, so it always shows its empty state. |
| `W_HINT_REVERSES_FLOW` | warning | Lane hints on a partly automatic map turn a `file`/`text` edge right to left that runs left to right without them (a hinted node or its group sits left of its predecessor). |
| `W_LANE_EMPTY` | warning | Lane hints leave lanes without any node; they are drawn without width, but a lower hint is usually meant. |
| `W_BADGE_CROWDED` | warning | A step badge found no spot clear of the scenario's other badges and of node boxes (many steps start on one short edge); it overlaps. |
| `W_PLACEHOLDER` | warning | A string still contains a `[...]` placeholder or `TODO`. |

## Design notes

Why the format works the way it does, for authors deciding how much to specify:

- **Layout is computed, hints are constraints.** Most maps need no `lane`, `row` or `route`. A hint on
  a few nodes keeps the rest automatic; only a `lane` on every node turns the grid fully manual.
- **Groups own their lanes.** A group's box is drawn around its members, so in an automatic map each
  group gets a contiguous block of lanes and a lane never mixes groups (`E_LANE_GROUPS`).
- **Wide maps fold.** More than 6 lanes would make the map unreadable at desktop width, so
  neighbouring lanes of the same group fold and long chains run downward.
- **Crossings are routed, not just reported.** An edge that would cross a box goes around it through
  the gaps; `W_EDGE_CROSSES_NODE` remains only when no gap is free or a manual `route` crosses a box.
- **Bounded work.** At most 64 nodes, lanes / rows / spans up to 64 and coordinates within ±1e5 keep
  validation and rendering well under a second.
- **Per-scenario details.** `gauge_empty` says why a gauge stays empty in one scenario ("nothing
  written"), and `{text, muted}` lines separate a node's data from its metadata.
- **One node per step needs no edge.** A step that only highlights a node uses `nodes`; edges from a
  node to itself are rejected (`E_EDGE_SELF`).

## Starting point

`node scripts/iad.mjs init doc.json` writes a valid skeleton to fill in ([cli.md](cli.md)). Complete
examples: `examples/minimal.en.json` (a small login flow, two scenarios) and
`examples/payment-auth.en.json` (groups, a gauge, error markers, a table, four scenarios). Korean
versions: `*.ko.json`.
