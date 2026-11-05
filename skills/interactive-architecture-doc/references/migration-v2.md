# Migrating a v2 walkthrough to v3

v3 replaces the walkthrough format. A v2 document (top-level `steps` and `board`) is rejected with a
single `E_V2_WALKTHROUGH`; nothing converts it automatically. The two formats describe different
things: v2 drew a vertical board of boxes per step, v3 draws a **component map** (boxes and the arrows
between them) and lets each scenario light up arrows step by step. v2 has no arrows between named
components and no "where does it live / what if it fails" text, so a converter could only produce an
empty shell. Rewrite the document by hand; for most documents that takes a few minutes with this page.

Overview documents (`meta.style: "overview"`) are unchanged.

## Recipe

1. List the **components** your v2 boxes talk about (client, services, stores, external systems).
   Each becomes one entry in `nodes` with a `kind`. Boxes that only described an action ("validates
   the token") become step text instead.
2. List the **arrows** between those components and give each an `id` and a `kind` (`file` for bulk
   data, `text` for requests and text, `ctrl` for control and responses). Each becomes an entry in
   `edges`.
3. For each v2 scenario, write its **own** `steps`: the global v2 steps that apply to it, each naming
   the edges (or nodes) it uses, a short token, and the three narration texts.
4. Put the `legend` labels under `legend.nodes`, move `subtitle` into `meta.intro`, and keep `tldr`,
   `callouts`, `considerations` and `tool_examples` (adjusting `tldr`, see below).
5. `node scripts/iad.mjs validate doc.json`, then `layout` / `render` as usual.

## Field mapping

| v2 | v3 | Notes |
|---|---|---|
| `meta.title` | `meta.title` | |
| `meta.subtitle` | `meta.intro` | markup is allowed now |
| `meta.entry_request`, `scenarios[].input` | `steps[].token.text`, `steps[].what` | no request template; write the request in the first step |
| top-level `steps[{label}]` (shared by all scenarios) | `scenarios[].steps[{title, ...}]` | every scenario has its own list |
| `scenarios[].label` | `scenarios[].title` | plus a required one-line `summary` and a `lead` |
| `scenarios[].icon` | (none) | use `tag` for a short label |
| `scenarios[].steps{"1": "..."}` | `steps[].what` (and `token.text`) | the data text moves into the narration |
| `legend{client, decision, existing, new}` | `legend.nodes{client, infra, app, store, tool, dep}` | see kinds below |
| `board` blocks | `nodes`, `edges`, `groups` | the map is laid out automatically |
| `node.kind` | `nodes[].kind` | see kinds below |
| `node.body` | `nodes[].title` + `sub` / `facts` | short title on the box, details in `facts` |
| `node.tag` | `nodes[].mono` | |
| `node.code` | `nodes[].lines` | fixed-width lines |
| `node.note`, `node.details` | `nodes[].facts` | shown when the box is clicked |
| `node.step` | the steps that use the node | a node has no step number of its own |
| `node.branches` | (none) | a scenario simply uses different edges; `skip` marks nodes it bypasses |
| `node.width` | `span` / `w` | usually not needed |
| `node.entry` | (none) | |
| `internal` / `external` blocks | `groups` | one group per zone; `tone: "muted"` for external systems |
| `fork` / `columns` / `fan_hub` / `fan_target` | edges from the deciding node | the branches are separate edges, each used by its own scenario |
| `arrow` block | an edge | with a `kind` |
| `tldr{headline, points[{title, detail}]}` | `tldr{title?, points: string[]}` | write each point as one markup line, e.g. `**title**: detail` |
| `callouts`, `considerations`, `tool_examples` | unchanged | shown as cards under the map |

**Kinds.** v2's four kinds described a node's role in the project; v3's six describe what the
component is. A reasonable start: `client` → `client`; `decision` → `app`; `new` → `app`; `existing`
→ `store` for databases and caches, `dep` for external services, `infra` for gateways and queues. The
legend text is what readers see, so say what each kind means in your document.

**Removed with no replacement:** the stepper bar, the scenario drop-down (scenarios are cards), the
entry request box with `{{input}}`, fan arrows, `iad init --fork`.

## Before and after

v2 (abridged):

```json
{
  "meta": { "title": "Image Upload", "subtitle": "Three steps, one scenario.", "entry_request": "PUT /v1/images" },
  "steps": [{ "label": "Upload" }, { "label": "Store" }, { "label": "Respond" }],
  "legend": { "client": "The app", "new": "Upload service" },
  "scenarios": [{ "id": "upload", "label": "Upload a photo",
    "steps": { "1": "PUT /v1/images", "2": "storage.put(...)", "3": "201 Created" } }],
  "board": [
    { "type": "node", "kind": "client", "step": 1, "body": "The app uploads the image." },
    { "type": "arrow" },
    { "type": "node", "kind": "new", "step": 2, "tag": "Upload service", "body": "Stores the original." },
    { "type": "arrow" },
    { "type": "node", "kind": "client", "step": 3, "body": "The app receives the id." }
  ]
}
```

v3:

```json
{
  "meta": { "title": "Image Upload", "intro": "Three steps, one scenario." },
  "legend": { "nodes": { "client": "The app", "app": "Upload service", "store": "Object storage" } },
  "nodes": [
    { "id": "app", "kind": "client", "title": "Mobile app", "facts": ["Uploads the raw bytes."] },
    { "id": "upload", "kind": "app", "title": "Upload service", "mono": "PUT /v1/images", "facts": ["Stores the original."] },
    { "id": "bucket", "kind": "store", "title": "Object storage", "mono": "images/", "facts": ["Keeps the original."] }
  ],
  "edges": [
    { "id": "put", "from": "app", "to": "upload", "kind": "file" },
    { "id": "store", "from": "upload", "to": "bucket", "kind": "file" },
    { "id": "created", "from": "upload", "to": "app", "kind": "ctrl" }
  ],
  "scenarios": [{
    "id": "upload", "title": "Upload a photo", "summary": "App → service → storage",
    "lead": "The app uploads a photo and gets its id back.",
    "steps": [
      { "title": "Upload", "edges": ["put"], "token": { "text": "PUT 1.2MB", "kind": "file" },
        "what": "The image bytes.", "where": "Request body.", "fail": "Too large: **413**." },
      { "title": "Store", "edges": ["store"], "token": { "text": "put()", "kind": "file" },
        "what": "The original image.", "where": "`images/3c9e.png`.", "fail": "Storage down: **503**, nothing kept." },
      { "title": "Respond", "edges": ["created"], "token": { "text": "201", "kind": "ctrl" },
        "what": "`{ id, url }`.", "where": "Response body.", "fail": "None." }
    ]
  }]
}
```

The same text, but each step now says which arrow carries what, where it lives and what happens when
it fails, and the reader sees the token move between named components.
