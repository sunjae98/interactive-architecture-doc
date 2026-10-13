# CLI reference

All commands run from the skill folder (or use absolute paths). Node.js 18+, no dependencies.

## Commands

```sh
node scripts/iad.mjs validate doc.json          # human-readable: <JSON pointer> <CODE> <message>
node scripts/iad.mjs validate doc.json --json   # {ok, errors[], warnings[]}
node scripts/iad.mjs render doc.json [-o out.html]
node scripts/iad.mjs init doc.json [--lang ko|en] [--steps N] [--scenarios id1,id2] [--fork] [--force]
```

`init` writes a skeleton with 0 errors whose strings are all `[...]` placeholders (reported as
`W_PLACEHOLDER` until filled). Defaults: `en`, 3 steps, one scenario `default`, no fork. `--fork`
(needs ≥2 scenarios and ≥2 steps) adds a decision `fan_hub` and one branch-scoped `fan_target`
column per scenario. It refuses to overwrite an existing file (exit 2) unless `--force`.

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
`window.iadSelfCheck()` (returns a Promise of the result). The page replays every scenario × step and
writes one JSON line into `<pre id="iad-selfcheck-result" data-state="pass|fail">` (visually hidden)
and the console (`IAD_SELFCHECK {...}`):

```json
{"ok":true,"checked":21,"scenarios":3,"steps":7,"failures":[],"warnings":[],"errors":[]}
```

`failures[]` items are `{scenario, step, check, detail}` with `check` one of `active-node` (no node is
active), `data-panel` (empty data panel), `entry-request` (empty entry request box), `fan-arrows` (a
fork has visible fan targets but no arrow was drawn), `overflow` (horizontal page overflow).
`warnings[]` has `step-text` for steps a scenario has no `steps` text for. `errors[]` lists page
errors (`error`, `unhandledrejection`, `csp`) since load. `ok` is true when `failures` and `errors` are
both empty. The scenario, step and auto-play state are restored afterwards.
