# Overview format (IR)

The overview style draws **one layered diagram** for product docs, feature pages and READMEs:
boxes on a column grid, straight vertical edges between adjacent layers, optional dashed groups
and boundary lines, and optional **paths**. A path is a tab that highlights a set of nodes in the
same layout and shows its own caption. There are no steps, scenarios or design decisions. For
those, use the walkthrough style ([format.md](format.md)).

Same workflow as the walkthrough: write JSON, `validate`, `render`. The renderer computes every
coordinate, so the JSON holds no positions beyond a column and a span.

## Top level

| Field | Required | Type | Notes |
|---|---|---|---|
| `meta` | yes | object | `style: "overview"` is what selects this format |
| `layers` | yes | array (≥1) | top to bottom; each layer is one row of the grid |
| `groups` | no | array of `{id, label}` | dashed boxes around contiguous layers (e.g. `"ROUTER"`) |
| `edges` | no | array | vertical connections between nodes in adjacent layers |
| `paths` | no | array | tabs that highlight a subset of nodes |
| `caption` | no | text | one sentence under the diagram when no path is selected |

Unknown keys are errors everywhere (typo guard).

### `meta`

| Field | Required | Notes |
|---|---|---|
| `style` | yes | `"overview"` |
| `title` | yes | plain text; also used in `<title>` and as the SVG label |
| `subtitle` | no | one-line summary under the title |
| `lang` | no | `"en"` (default) or `"ko"`: UI strings only, author text is never translated |
| `columns` | no | grid width, `2`..`4` (default `3`) |

### `layers[]`

| Field | Required | Notes |
|---|---|---|
| `nodes` | yes | array (≥1) of nodes, placed left to right |
| `group` | no | a `groups[].id`; all layers of one group must be next to each other |
| `boundary` | no | label for a dotted line drawn above this layer (e.g. `"EXTERNAL SERVICES"`); not on the first layer |

### Nodes

| Field | Required | Notes |
|---|---|---|
| `id` | yes | kebab-case, unique across the document; referenced by edges and paths |
| `title` | yes | plain text, one line. Keep it to a component name |
| `code` | no | one line in monospace under the title (an endpoint, a module, a host) |
| `rows` | no | array of one-line strings: turns the node into a card with a header and code rows. Not together with `code` |
| `span` | no | columns the node covers (default 1) |
| `col` | no | 1-based start column; omit to continue after the previous node. Use it to leave gaps |
| `tone` | no | `default`, or `outer` for things outside the system (clients, external services): a solid box. Not on cards |

### `edges[]`

| Field | Required | Notes |
|---|---|---|
| `from`, `to` | yes | node ids in **adjacent** layers. The arrow points at `to`, so `to` may be above `from` (a response) |
| `label` | no | short text on the edge: a route, a verb, a status (`POST /v1/ask`, `query`) |
| `label_by_path` | no | `{pathId: text}`: replaces `label` while that path is selected (e.g. a different status code per path). Needs `label`, which shows on the overview and on the other paths |

The edge is drawn where the two nodes overlap horizontally, so they must share at least part of a
column. Two edges between the same pair (request and response) are spread into separate lanes.

### `paths[]`

| Field | Required | Notes |
|---|---|---|
| `id` | yes | kebab-case, unique; also the URL hash (`doc.html#lookup` opens that path). `iad-selfcheck` is reserved |
| `label` | yes | tab text |
| `nodes` | yes | node ids to highlight; an edge is highlighted when both of its ends are in the path, so every node needs an edge to another node of the path |
| `caption` | no | sentence shown instead of the top-level `caption` while the path is selected |

## Writing for docs

- One idea per diagram. If a layer needs more than `columns` nodes, split the diagram or group
  similar parts into one card.
- Titles name things ("Search service"); prose belongs in `caption` and the path captions.
- `tone: "outer"` and `boundary` say "outside the system", so you need no legend.
- Edge labels are one to three words. Long labels collide (`W_TEXT_LONG`).

## Text and markup

Everything is HTML-escaped. `caption` and `paths[].caption` support `**bold**` and `` `code` ``;
all other fields are plain text.

## Rules

Overview documents are checked with the shared structural codes from [format.md](format.md)
(`E_TYPE`, `E_REQUIRED`, `E_EMPTY`, `E_UNKNOWN_KEY`, `E_LANG`, `E_STYLE`, `E_ENUM`, `E_ID_FORMAT`,
`E_ID_DUPLICATE`, `W_PLACEHOLDER`) plus these:

| Code | Level | Meaning |
|---|---|---|
| `E_NODE_UNKNOWN` | error | An edge or a path names a node id that does not exist. |
| `E_PATH_UNKNOWN` | error | A `label_by_path` key is not a path id. |
| `E_GROUP_UNKNOWN` | error | `layers[].group` is not a group id, or a group's layers are not contiguous. |
| `E_LAYOUT` | error | The grid cannot hold the layer: `meta.columns` outside 2..4, a node outside the grid or on another node, a boundary on the first layer, `rows` with `code` or with `tone: outer`. |
| `E_EDGE_LAYER` | error | An edge does not connect two nodes in adjacent layers. |
| `E_PATH_DISCONNECTED` | error | A path node has no edge to another node of the same path. |
| `E_EDGE_ALIGN` | error | The two nodes of an edge do not overlap horizontally, so no vertical line fits. |
| `W_TEXT_LONG` | warning | Text is likely wider than its box, or a label collides with another label, an edge line or the edge of the diagram. |

Geometry checks (`E_EDGE_ALIGN`, `W_TEXT_LONG`) run only when there are no other errors.
Text widths are estimates; the self-check and a look at the page settle borderline cases.

## Starting point

`node scripts/iad.mjs init doc.json --style overview [--paths a,b]` writes a valid skeleton
([cli.md](cli.md)). Complete example: `examples/request-router.overview.en.json` (Korean:
`.ko.json`). It draws the same system as `examples/three-branch.en.json` in the overview style.
