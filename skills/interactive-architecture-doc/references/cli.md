# CLI reference

All commands run from the skill folder (or use absolute paths). Node.js 18+, no dependencies.

## Commands

```sh
node scripts/iad.mjs validate doc.json          # human-readable: <JSON pointer> <CODE> <message>
node scripts/iad.mjs validate doc.json --json   # {ok, errors[], warnings[]}
node scripts/iad.mjs render doc.json [-o out.html]
node scripts/iad.mjs layout doc.json [--json]   # walkthrough: the computed map
node scripts/iad.mjs init doc.json [--lang ko|en] [--steps N] [--scenarios id1,id2] [--lanes N] [--force]
node scripts/iad.mjs init doc.json --style overview [--lang ko|en] [--paths id1,id2] [--force]
```

`init` writes a walkthrough skeleton with 0 errors whose strings are all `[...]` placeholders (reported
as `W_PLACEHOLDER` until filled): `--lanes` components (2..8, default 3) in a chain joined by edges,
and one scenario per `--scenarios` id (kebab-case, at most 6, default `default`) with `--steps` steps
(1..20, default 3) that walk the chain. No node has a lane, so the map is laid out automatically and
nodes you add later are placed too. `--fork` was removed in v3 and exits 2. `init` refuses to
overwrite an existing file (exit 2) unless `--force`.

`--style overview` writes an overview skeleton instead ([format-overview.md](format-overview.md)): a
client, an entry component and one component per `--paths` id (three without `--paths`, at most four),
with one path per id. `--steps`, `--scenarios` and `--lanes` are walkthrough-only and `--paths` is
overview-only; mixing them exits 2. `validate`, `render` and `layout` read `meta.style` and need no option.

`layout` (walkthrough only) prints the map the renderer would draw: the viewBox, every lane (`x`, `w`)
and row (`y`, `h`), the free gaps between lanes and between rows (good `x` / `y` values for
`route.via`), each node's `lane row x y w h`, each group's box and each edge's SVG path. Warnings go to
stderr. `--json` prints the same data as one object (`viewBox`, `lanes`, `rows`, `laneGaps`, `rowGaps`,
`nodes`, `groups`, `edges`, `warnings`). A document with errors prints them and exits 1; an overview
document exits 2.

Exit codes: `0` valid (warnings allowed) · `1` validation errors · `2` usage, read, JSON parse, or write error.
`render` re-validates and refuses to write anything if there are errors. The default output is
next to the JSON with the same basename and `.html`; `render` refuses (exit 2) when the output path
is the input file itself.

`--json` output shape: one input file prints one object, several files print an array of objects
(each with an extra `file` field). A document that was checked prints `{ok, errors[], warnings[]}`
(`render` adds `output` on success). A file that cannot be read, parsed or written prints
`{ok: false, error: "<message>"}` instead, and the exit code is `2`.

## Self-check (browser)

Open the rendered page with `#iad-selfcheck` appended (`doc.html#iad-selfcheck`), or call
`window.iadSelfCheck()` (returns a Promise of the result). While the page is open with that hash it
does not write its scenario / step link (`#s2/3`, see [format.md](format.md)) into the URL, and a
self-check started with `window.iadSelfCheck()` leaves the reader's link as it was. The page replays every scenario, from the
full path (step -1) through every step, and writes one JSON line into
`<pre id="iad-selfcheck-result" data-state="pass|fail">` (visually hidden) and the console
(`IAD_SELFCHECK {...}`):

```json
{"ok":true,"checked":11,"scenarios":2,"failures":[],"errors":[]}
```

`checked` counts the scenario × step views (each scenario's steps plus its full path). `failures[]`
items are `{scenario, step, check, detail}` (`step` is -1 for the full path) with `check` one of:

| Check | Fails when |
|---|---|
| `cur-edges` | the highlighted edges differ from the step's `edges` (all of the scenario's edges at -1) |
| `cur-nodes` | the highlighted nodes differ from the step's nodes and edge ends |
| `narration` | the narration panel is empty |
| `badges` | the number of step badges differs from the scenario's step count |
| `gauge` | a gauge label differs from its carried-forward value |
| `markers` | the number of error markers differs from the step's `markers` |
| `overflow` | the page scrolls horizontally (the map may scroll inside its own panel) |

`errors[]` lists page errors (`error`, `unhandledrejection`, `csp`) since load. `ok` is true when
`failures` and `errors` are both empty. The scenario and step are restored afterwards; the map shows
the restored step again (or its start for the full path) and is not scrolled during the check.

An overview page uses the same hash, function and result element. It shows the overview and then each
path, and prints `{"ok":true,"checked":4,"paths":3,"failures":[],"errors":[]}`. `failures[]` items are
`{path, check, detail}` (`path` is `""` for the overview) with `check` one of `path-nodes` (a path node
is not highlighted), `path-edges` (a path with two or more nodes highlights no edge), `edge-label` (an
edge with labels does not show exactly one) and `overflow`. The selected path is restored afterwards.
