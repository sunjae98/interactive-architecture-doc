# Document format (IR) — v3 walkthrough (DRAFT)

> **Draft (v3 prototype gate).** Only the tables are settled enough to test; prose, examples and the
> migration note come after the gate. v2 walkthrough documents (top-level `steps` / `board`) are
> rejected with `E_V2_WALKTHROUGH`. The **overview** style has its own page:
> [format-overview.md](format-overview.md). `meta.style` selects the format.

An interactive architecture document is a single JSON file. `scripts/iad.mjs` validates it and
renders it into one self-contained HTML file. **Never edit the rendered HTML** — edit the JSON
and render again. The rendered HTML embeds a copy of the JSON in
`<script type="application/json" id="iad-data">`.

The validator (`scripts/lib/validate.mjs`) is the single source of truth; a test fails if the rule
table below (plus the one in format-overview.md) and the validator drift apart. Commands: [cli.md](cli.md).

## Top level

| Field | Required | Type | Notes |
|---|---|---|---|
| `meta` | yes | object | `{title, intro?, facts?[{label, value, mono?}], source?, style?, lang?}` |
| `legend` | yes | object | `{nodes: {kind: label}, edges?: {file?, text?, ctrl?}, tokens?: [{kind, text}]}`; every used node kind needs a label |
| `groups` | no | array | `{id, title, meta?, tone?: default \| muted}`; the box is the members' bounding box plus an inset |
| `nodes` | yes | array (≥1) | see below |
| `edges` | yes | array (≥1) | `{id, from, to, kind: file \| text \| ctrl, route?}` |
| `gauges` | no | array | `{id, node, caption?, empty?}`; one per node; steps set values, which carry forward |
| `scenarios` | yes | array (1..6) | `{id, title, summary, lead, tag?, note?: {title?, items}, skip?: [{node, label}], gauge_empty?: {gaugeId: label}, steps}`; `gauge_empty` replaces a gauge's `empty` label in this scenario |
| `tldr` | no | object | `{title?, points: string[]}` |
| `tables` | no | array | `{title, columns: string[], rows: string[][]}`; each row has one cell per column |
| `callouts` / `considerations` / `tool_examples` | no | | as in v2; shown as cards under the map |

### `nodes[]`

| Field | Required | Notes |
|---|---|---|
| `id` | yes | lowercase words joined by `-` or `_` |
| `kind` | yes | `client` (crimson) \| `infra` (violet) \| `app` (amber) \| `store` (green) \| `tool` (gray) \| `dep` (blue) |
| `title` | yes | plain text |
| `mono` / `sub` (≤3) / `lines` | no | mono subtitle, extra lines, fixed-width lines (leading spaces kept). A `lines` item is a string or `{text, muted?}`; `muted: true` draws it in the muted color |
| `facts` | no | markup lines shown when the box is clicked |
| `group` | no | group id |
| `lane` / `row` | no | grid column / row (≥0); automatic when omitted. With no `lane` anywhere the map is fully automatic: lanes follow the file/text flow, each group gets its own block of lanes, and a map wider than 6 lanes folds neighbouring lanes so long chains run downward |
| `span` / `rows` | no | lanes / rows the box covers (≥1) |
| `x`, `y` | no | absolute position (both or neither); wins over lane/row |
| `w`, `h` | no | forced size |

### `edges[].route`

`{from_side?, to_side?, via?: [[x, y], ...], d?}`. Sides: `top` \| `right` \| `bottom` \| `left`.
`d` is a raw absolute SVG path (M L H V C Q Z only) and wins over the rest.

### `scenarios[].steps[]`

| Field | Required | Notes |
|---|---|---|
| `title` | yes | step list and narration heading |
| `edges` | yes | edge ids (may be empty); the token travels them in order |
| `nodes` | no | nodes to highlight without an edge; required when `edges` is empty |
| `token` | yes | `{text, kind: file \| text \| ctrl \| err}` |
| `what` / `where` / `fail` | yes | the three narration boxes (markup) |
| `gauges` | no | `{gaugeId: {value: 0..1, label}}` |
| `markers` | no | `[{node, label}]` error markers shown at this step only |

## Text and markup

All text is HTML-escaped. In markup fields only `**bold**` and `` `code` `` are converted.
`W_PLACEHOLDER` ignores text inside `` `code` `` and bracketed constants such as `[DONE]` or `[PHONE_1]`.
`meta.title`, node `title` / `mono` / `sub` / `lines`, group text and token text are plain text.

## Rules

Errors (`E_*`) make `validate` exit 1 and `render` refuse. Warnings (`W_*`) are reported but do not
block. Structural rules run first; cross-reference rules run only when the structure is valid; layout
rules (`E_LAYOUT_OVERLAP`, `W_EDGE_CROSSES_NODE`, `W_TEXT_LONG`) run only on an error-free document.
`E_NODE_UNKNOWN`, `E_GROUP_UNKNOWN` and `W_TEXT_LONG` are listed in format-overview.md and apply here too.

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
| `E_GAUGE_UNKNOWN` | error | A step (`gauges`) or a scenario (`gauge_empty`) names a gauge id that does not exist. |
| `E_GAUGE_RANGE` | error | A gauge value is outside 0..1. |
| `E_GAUGE_DUP_NODE` | error | Two gauges are drawn on the same node (one gauge per node). |
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
| `W_PLACEHOLDER` | warning | A string still contains a `[...]` placeholder or `TODO`. |

## Changes from the v3 plan (draft)

Decided at the prototype gate; recorded here until the plan is updated.

| Change | Why |
|---|---|
| `scenarios[].gauge_empty: {gaugeId: label}` (new, optional) | a scenario can say why a gauge stays empty ("0B · nothing written") |
| `nodes[].lines` items may be `{text, muted?}` (new form) | metadata lines in the muted color, as in the reference map |
| lane gap +20 (not +40) where the set of groups changes | matches the reference map's spacing |
| a node with no edge takes its group's lowest lane | an unlinked member must not pull its group to lane 0 |
| fully automatic maps fold to at most 6 lanes (`maxAutoLanes`) | a long chain turns downward instead of becoming an unreadable strip |
| lane/row/span/rows ≤ 64, coordinates and sizes within ±1e5 | bounded layout work |
| self-loop edges rejected (`E_EDGE_SELF`) | no geometry for them; a single-node step uses `step.nodes` |

## Starting point

`node scripts/iad.mjs init doc.json` writes a valid v3 skeleton to fill in ([cli.md](cli.md)).
