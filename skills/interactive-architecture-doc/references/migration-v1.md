# Converting a v1 document to JSON

For converting a v1 document (hand-edited `template.html` with `TOTAL_STEPS` / `SCENARIOS`) into JSON
once. Fields are described in [format.md](format.md). After converting, validate and render, compare
the result with the original in a browser, and from then on work from the JSON.

## v1 → JSON mapping

| v1 | JSON |
|---|---|
| `<h1>` / `.subtitle` | `meta.title` / `meta.subtitle` |
| `.tldr` `.headline` and its `.card` items | `tldr.headline` / `tldr.points[{title, detail}]` |
| `.stepper` `.step` (N items) | `steps[{label}]`, N = array length |
| `var TOTAL_STEPS = N` | not needed: `steps.length` |
| `.legend` `.dot.<kind>` + text | `legend.<kind>` = the text |
| `.node.client` / `.decision` / `.existing` / `.new` | `node.kind` |
| `data-step="N"` | `node.step` |
| `data-branch="a,b"` | `node.branches: ["a", "b"]` |
| `.tag` / `.sub` / `.note` / code `<pre>` in a node | `node.tag` / `node.body` / `node.note` / `node.code` |
| `.center-row` + `.node` | a top-level `node` block (`width`: `.narrow` / `.wide` / `.full` classes) |
| `.plain-arrow`, `.arrow-label` | `{type: "arrow", label}` |
| `.internal` with `.badge` | `{type: "internal", badge, children}` |
| `.external-zone` `.external-card` `.ext-tag` | `{type: "external", badge, systems[{name, items[{text, tag}]}]}` |
| `.fork-zone` + `.fork-row` of `.fork-col` | `{type: "fork", children}` containing a `columns` block; each `.fork-col` is a `columns[]` entry (`.fork-title` = `title`) |
| inline `grid-template-columns` | not needed: column count comes from `columns.length` (`--cols`) |
| `data-fan-hub="id"` / `data-fan-target="id"` | `node.fan_hub` / `node.fan_target` (same fork block) |
| `<svg class="zone-overlay" data-fan-svg>` | generated per `fork` |
| `.detail-grid` (`.detail-left` / `.detail-right`, `.alt-item`) | `node.details{code, items[{title, body, variant: "alt"}]}` |
| `.callout` | `callouts[{title, body}]` |
| `.considerations` items with `.why` | `considerations.items[{decision, why}]` |
| `.tool-examples` `.tool-card` (`.tool-name`, `.tool-note`) | `tool_examples{title, lead, tools[{name, code, note}]}` |
| `SCENARIOS = {key: {label, steps: {1: "..."}}}` | `scenarios[{id: key, label, steps: {"1": "..."}}]` |
| `<select id="pgPrompt">` options | `scenarios[].icon` / `.input` (the drop-down is generated) |
| `#entryCode` and `buildEntryRequest()` template | `meta.entry_request` with `{{input}}`, plus `entry: true` on that node |
| Korean `word-break: keep-all` on body | handled by the template; set `meta.lang` |
