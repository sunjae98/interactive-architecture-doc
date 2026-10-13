# Document format (IR)

An interactive architecture document is a single JSON file. `scripts/iad.mjs` validates it and
renders it into one self-contained HTML file. **Never edit the rendered HTML** — edit the JSON
and render again. The rendered HTML embeds a copy of the JSON in
`<script type="application/json" id="iad-data">`, so the JSON can be recovered from it.

The validator (`scripts/lib/validate.mjs`) is the single source of truth. This page describes the
same rules; a test fails if the rule table below and the validator drift apart.

Commands, options, exit codes and `--json` output: [cli.md](cli.md).

## Top level

| Field | Required | Type | Notes |
|---|---|---|---|
| `meta` | yes | object | see below |
| `steps` | yes | array (≥1) of `{label}` | step number = array index + 1; becomes the stepper |
| `legend` | yes | object | `{client?, decision?, existing?, new?}` — what each node kind means *in this document* |
| `scenarios` | yes | array (≥1) | the playground drop-down |
| `board` | yes | array (≥1) of blocks | the diagram |
| `tldr` | no | object | `{headline, points[{title, detail}]}` |
| `callouts` | no | array of `{title, body}` | side-by-side cards under the board |
| `considerations` | no | object | `{title, items[{decision, why}]}` — every decision needs a `why` |
| `tool_examples` | no | object | `{title, lead?, tools[{name, code, note?}]}` |

Unknown keys are errors everywhere (typo guard).

### `meta`

| Field | Required | Notes |
|---|---|---|
| `title` | yes | plain text (no markup); also used in `<title>` |
| `subtitle` | no | one-line summary under the title |
| `lang` | no | `"en"` (default) or `"ko"` — selects the UI strings (buttons, status). Author text is never translated |
| `entry_request` | no | request template shown in the `entry` node; `{{input}}` is replaced by the selected scenario's `input`. If written as `"{{input}}"` (inside double quotes) the input is inserted as a JSON string, so quotes are escaped |

### `scenarios[]`

| Field | Required | Notes |
|---|---|---|
| `id` | yes | kebab-case, unique; referenced by `node.branches` |
| `label` | yes | shown in the drop-down and status line |
| `icon` | no | short prefix in the drop-down, e.g. an emoji |
| `input` | no | example input; shown in the drop-down and substituted into `meta.entry_request` |
| `steps` | yes | `{"1": "...", "2": "...", ...}` — data flowing at each step, shown verbatim (code) in the side panel. Keys are step numbers |

### `legend`

Keys are node kinds; values are sentences. Every kind used on the board must be present. The
four kinds and their default meaning:

| Kind | Default meaning | Color family |
|---|---|---|
| `client` | the client outside the system | crimson |
| `decision` | where a path is chosen | violet |
| `existing` | already exists / handled elsewhere | green |
| `new` | built in this project | amber |

The meaning may be redefined per document (e.g. sync/async) — the legend text is what readers see.

## Board blocks

`board` and every `children` array hold blocks, distinguished by `type`.

| `type` | Fields | Renders as |
|---|---|---|
| `node` | see below | a box; centered on its own row unless inside `columns` |
| `arrow` | `label?` | a vertical `↓` with an optional caption |
| `internal` | `badge`, `children` | dashed box: "internal, invisible to the client" |
| `external` | `badge`, `systems[{name, items[{text, tag?}]}]` | dashed box with one card per external system |
| `fork` | `children` | a fork zone; fan arrows are drawn from `fan_hub` to `fan_target` nodes inside it |
| `columns` | `columns[{title?, children}]` | side-by-side columns; the column count is set with `--cols` (responsive: 2 then 1 column on narrow screens) |

### `node`

| Field | Required | Notes |
|---|---|---|
| `kind` | yes | `client` \| `decision` \| `existing` \| `new` |
| `step` | yes | integer in 1..N. Several nodes may share a step ("same step, different actor") |
| `body` | yes | main text |
| `branches` | no | scenario ids; the node is only active in those scenarios. Omit = active in all |
| `tag` | no | small label at the top |
| `code` | no | code block (escaped verbatim, no markup) |
| `note` | no | small muted text at the bottom |
| `width` | no | `narrow` (70%) \| `wide` (92%) \| `full` (100%); omit = fit content (or the column) |
| `details` | no | `{code?, items[{title, body, variant?}]}` — two-column breakdown; `variant` is `default` or `alt` |
| `fan_hub` | no | kebab-case id; this node is the source of a fan of arrows. Only inside a `fork` |
| `fan_target` | no | id of a `fan_hub` in the **same** `fork`; this node receives an arrow |
| `entry` | no | `true` on at most one node; its code block shows `meta.entry_request` for the selected scenario |

## Text and markup

All text is HTML-escaped. In text fields only two inline conversions exist: `**bold**` and
`` `code` ``. Code fields — `node.code`, `details.code`, `tools[].code`, `scenarios[].steps`, and
`meta.entry_request` — are escaped and shown verbatim. `meta.title`, scenario `label` / `icon` /
`input` and tool `name` are plain text (escaped, no markup).

## Rules

Errors (`E_*`) make `validate` exit 1 and `render` refuse. Warnings (`W_*`) are reported but do not
block. Structural rules run first; cross-reference rules run only when the structure is valid.

| Code | Level | Meaning |
|---|---|---|
| `E_TYPE` | error | Value has the wrong JSON type. |
| `E_REQUIRED` | error | A required field is missing. |
| `E_EMPTY` | error | A required string or array is empty. |
| `E_UNKNOWN_KEY` | error | An object has a key the format does not define (typo guard). |
| `E_UNKNOWN_BLOCK` | error | A board block has an unknown `type`. |
| `E_UNKNOWN_KIND` | error | A node has an unknown `kind`. |
| `E_LANG` | error | `meta.lang` is not `ko` or `en`. |
| `E_ENUM` | error | A value is not one of the allowed options (`width`, `variant`). |
| `E_STEP_RANGE` | error | `node.step` is outside 1..N (N = number of steps). |
| `E_STEP_NO_NODE` | error | A step has no node on the board. |
| `E_BRANCH_UNKNOWN` | error | `node.branches` references a scenario id that does not exist. |
| `E_ID_FORMAT` | error | A scenario id or fan id is not kebab-case. |
| `E_ID_DUPLICATE` | error | A scenario id or `fan_hub` id is used more than once. |
| `E_SCENARIO_STEP_KEY` | error | A `scenario.steps` key is not a step number in 1..N. |
| `E_FAN_HUB_NO_TARGET` | error | A `fan_hub` has no `fan_target` in the same fork block. |
| `E_FAN_TARGET_NO_HUB` | error | A `fan_target` has no matching `fan_hub` in the same fork block. |
| `E_FAN_OUTSIDE_FORK` | error | `fan_hub` / `fan_target` is used on a node that is not inside a fork block. |
| `E_LEGEND_MISSING_KIND` | error | A node kind used on the board is not described in `legend`. |
| `E_WHY_EMPTY` | error | `considerations.items[].why` is empty. |
| `E_ENTRY` | error | More than one `entry` node, or an `entry` node without `meta.entry_request`. |
| `W_SCENARIO_NO_ACTIVE` | warning | A scenario has no active node at some step. |
| `W_SCENARIO_STEP_MISSING` | warning | A scenario has no `steps` text for some step. |
| `W_PLACEHOLDER` | warning | A string still contains a `[...]` placeholder or `TODO`. |
| `W_ENTRY_NO_INPUT` | warning | `meta.entry_request` does not contain `{{input}}`. |

"Same fork block" means the nearest enclosing `fork`; `internal` and `columns` in between do not
start a new scope. A node is *active* for a scenario at step *s* when `node.step = s` and it has no
`branches` or its `branches` include the scenario id.

## Starting point

`node scripts/iad.mjs init doc.json` writes a valid skeleton to fill in ([cli.md](cli.md)). Complete
examples: `examples/minimal.en.json` (3 steps, 1 scenario) and `examples/three-branch.en.json` (fork
with three paths, external systems, all optional sections). Korean versions: `*.ko.json`.
