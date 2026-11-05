# interactive-architecture-doc

[한국어](README.ko.md)

An agent skill that turns a codebase or a system design into a **self-contained, interactive HTML
architecture document**. It provides two styles, **Walkthrough** and **Overview**.

The agent never writes HTML. It writes a JSON document, a dependency-free Node script validates it
(cross-references such as nodes, edges, steps and paths are checked) and lays out the diagram, and it
renders one offline HTML file. The viewer can export the diagram as PNG, SVG, or a clipboard image.
Light and dark themes, Korean and English UI.

## Two styles: Walkthrough and Overview

| | Walkthrough | Overview |
|---|---|---|
| For | Tech specs, design reviews, "what happens when…" write-ups | Product docs, feature pages, READMEs |
| Shows | A map of the components a flow passes through. Each scenario (normal path, failures, retries) lights up its arrows step by step while a token moves along them, with "what moves / where it lives / if it fails" narration, gauges and error markers | One layered diagram (client, components, external services) with tabs that highlight a path through the same layout |
| Reader does | Picks a scenario, presses "Next step" or plays it, clicks a box for its facts | Reads the diagram; switches paths to see which parts a feature uses |
| Export | The map at the current scenario and step | The diagram in the current path and theme, ready to drop into a docs page |
| Format | [format.md](skills/interactive-architecture-doc/references/format.md) | [format-overview.md](skills/interactive-architecture-doc/references/format-overview.md) |

When you ask for a document, the agent picks the style from your request ("for our tech spec" →
Walkthrough, "for the docs" → Overview) and asks you once if it cannot tell. `meta.style` in the JSON records
the choice; documents without it are Walkthrough.

**Walkthrough**

| Light | Dark |
|---|---|
| ![Walkthrough document, light theme](docs/screenshot-light.png) | ![Walkthrough document, dark theme](docs/screenshot-dark.png) |

**Overview** (with the "Needs a lookup" path selected)

| Light | Dark |
|---|---|
| ![Overview document, light theme](docs/screenshot-overview-light.png) | ![Overview document, dark theme](docs/screenshot-overview-dark.png) |

## How it works

```mermaid
flowchart LR
    A["Agent<br/>writes JSON only"] -- "iad.mjs init<br/>(skeleton)" --> J[("doc.json")]
    J --> V{"iad.mjs validate<br/>(Node 18+, node: built-ins only)"}
    V -- "errors<br/>(JSON pointer + rule code)" --> A
    V -- "ok" --> R["iad.mjs render"]
    T["assets/template.html<br/>tokens · CSS · runtime JS"] --> R
    F["assets/fonts/*.woff2"] --> R
    R -- "atomic write" --> H["doc.html<br/>single self-contained file"]
    H --> B["Browser (offline)<br/>scenario walkthrough"]
    B --> E["Export the map<br/>PNG · SVG · clipboard"]
    H --> S["doc.html#iad-selfcheck<br/>replays every scenario × step"]
    S -- "one JSON line<br/>(failures → fix JSON)" --> A
```

- The agent never edits HTML. If something is wrong, it fixes the JSON and renders again.
- The layout is computed at render time: lanes follow the flow, groups stay together, long chains fold
  downward and edges route around boxes. `iad.mjs layout` prints the computed geometry when a hint is
  needed.
- `render` re-runs validation and refuses to write if there are errors.
- The JSON is embedded in the HTML (`#iad-data`), so the source can be recovered from the HTML file.

## Why not a single `SKILL.md` with a template?

A common way to build this kind of skill is a single `SKILL.md` plus a large HTML template that the agent copies
and edits by hand. interactive-architecture-doc instead gives the agent a JSON format, a validator, a renderer,
and a browser self-check.

| | Single `SKILL.md` + hand-edited template | interactive-architecture-doc |
|---|---|---|
| Consistency | step count / step total, `data-step` / `data-branch`, fan hub/target pairs, scenario options and keys kept in sync by hand | all generated from one JSON definition |
| Validation | mismatches found by clicking through the page | rejected before render with a JSON pointer and rule code, e.g. `/scenarios/0/steps/2/edges/0 E_EDGE_UNKNOWN` |
| Verification | manual clicking, many screenshots | `doc.html#iad-selfcheck` replays every scenario × step and returns one JSON line |
| Agent reads | ≈46 KB (`SKILL.md` + reference notes + a ~34 KB HTML template) | ≈25 KB (`SKILL.md` 7.4 KB + `format.md` 15.8 KB + the default `iad init` skeleton ≈2 KB); the template is used only by the renderer |
| Agent writes | ~34 KB+ of HTML | a JSON file (≈7–13 KB for the examples) |
| Updates | re-edit the HTML | edit the JSON and render again; the JSON is embedded in the HTML and can be recovered |
| Distribution | folder copied into each project (copies drift) | one-line install and updates with `npx skills add` / `npx skills update` |

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/token-comparison-dark.svg">
  <img alt="Estimated tokens for one 3-scenario document: single SKILL.md + hand-edited template reads about 11.6K and writes about 8.5K (20.2K total); interactive-architecture-doc reads about 7.6K and writes about 3.2K (10.8K total)." src="docs/token-comparison-light.svg" width="720">
</picture>

- Table figures are file sizes in bytes; the chart estimates tokens as bytes / 4. Neither is an exact
  tokenizer count. Regenerate the chart with `node tools/charts/token-chart.mjs`.
- Maintained as an open-source repository: versioned releases with a [CHANGELOG](CHANGELOG.md), CI on
  Node 18/20/22 (tests, example validation, font hashes), and development files (tests, font build tool, CI)
  kept out of the installed skill folder.
- Trade-off: the agent needs Node.js 18+ and shell access; a template-only skill needs only file editing.

## Install

```sh
npx skills add sunjae98/interactive-architecture-doc
```

Requirements: Node.js 18+ and shell access for the agent. The generated HTML has no dependencies and
opens offline by double-click.

### Update

Run the update in the same scope you installed into:

```sh
npx skills update interactive-architecture-doc       # asks project or global
npx skills update interactive-architecture-doc -p -y # project install (run in the project root)
npx skills update interactive-architecture-doc -g -y # global (user-level) install
```

- Without a skill name, `npx skills update` updates every installed skill.
- The update pulls the latest `main` of this repository. See [CHANGELOG.md](CHANGELOG.md) for what changed.
- If you installed with `--copy`, the update may switch the install to a symlink into `.agents/skills/`.
  To keep a plain copy, reinstall instead: `npx skills add sunjae98/interactive-architecture-doc --copy -y`.
- Documents you already rendered keep working; to pick up template changes (theme, export, self-check),
  render their `doc.json` again with the updated skill.
- **Upgrading from 2.x:** the walkthrough format changed in 3.0.0. A 2.x walkthrough `doc.json` is
  rejected with `E_V2_WALKTHROUGH`; rewrite it with
  [migration-v2.md](skills/interactive-architecture-doc/references/migration-v2.md). Overview documents
  are unchanged.

## Usage

In Claude Code, invoke the skill explicitly with its slash command:

```text
/interactive-architecture-doc Make an interactive architecture document for our upload pipeline: the client
sends a file, it is written to temporary disk, parsed and sent to the model. Show the normal path, a file
that is too large, and the client disconnecting mid-upload.
```

For an Overview, say where the diagram goes:

```text
/interactive-architecture-doc Make an overview diagram of this repository's request flow for our docs site.
```

You can also just describe what you want ("make an interactive architecture document for …"); the agent picks
the skill from its description. Other agents that support skills load it the same way, but the explicit
invocation syntax depends on the agent.

The agent follows `skills/interactive-architecture-doc/SKILL.md`: it gathers the details, starts `doc.json`
from a skeleton (or an example), fills it in, and runs

```sh
node scripts/iad.mjs init doc.json --lang en --scenarios normal,too-large --steps 5   # Walkthrough skeleton with [placeholders]
node scripts/iad.mjs init doc.json --style overview --paths read,write                  # Overview skeleton
node scripts/iad.mjs validate doc.json   # fix reported errors and warnings
node scripts/iad.mjs render doc.json     # writes doc.html next to doc.json (style from meta.style)
node scripts/iad.mjs layout doc.json     # optional: the computed map, for lane/row hints or route.via
```

To check the result, it opens `doc.html#iad-selfcheck` in a browser tool and reads one JSON line from
`#iad-selfcheck-result` (`{"ok":true,"checked":11,...,"failures":[]}`) instead of clicking through every
scenario; screenshots are only needed when the self-check fails. You can open the same URL yourself.

Keep `doc.json` next to the HTML: it is the source. To update a document, edit the JSON and render again
(the HTML also embeds a copy of the JSON in `<script id="iad-data">`). The formats are described in
`skills/interactive-architecture-doc/references/format.md` (Walkthrough) and `references/format-overview.md`
(Overview), the commands in `references/cli.md`. An Overview opens on a path with `doc.html#<path-id>`.

### Language (Korean / English output)

The document language is set by `meta.lang` in the JSON: `"en"` (default) or `"ko"`.

| | English output | Korean output |
|---|---|---|
| How to ask | Write your request in English | Write your request in Korean (or say "write it in Korean") |
| `meta.lang` | `"en"` (or omit) | `"ko"` |
| UI strings (buttons, status, export messages) | English | Korean |
| Starting point | `iad init --lang en` or `examples/*.en.json` | `iad init --lang ko` or `examples/*.ko.json` |

- The agent picks `meta.lang` from the language of your request; you can always override it explicitly
  ("make the document in Korean").
- `meta.lang` only switches the built-in UI strings and the page's `<html lang>`.
  The text you write (titles, steps, nodes, scenarios) is never translated, so write it in the same language.
- To switch an existing document, change `meta.lang` (and translate the text) in `doc.json`, then render again.

```json
{ "meta": { "title": "결제 승인 흐름", "intro": "…", "lang": "ko" } }
```

## Browser support and export limits

- Tested in current Chrome (viewing and all exports). Other modern browsers use only standard features for
  viewing and are expected to work, but are not verified; Safari was not tested.
- Both styles export the diagram itself as SVG (styles, fonts and colors inlined), so it renders the
  same in browsers, docs sites and image viewers. PNG and clipboard images are drawn from that SVG; if
  they fail, the document shows a message and the SVG export is the fallback.
- Copying an image to the clipboard needs a secure context (`https://` or `localhost`; `file://` support
  varies by browser) and the browser's clipboard permission. Not every browser supports image clipboard writes.
- Exported PNGs are capped at about 16 megapixels; very large views are scaled down.
- Wide walkthrough maps: on screens wider than 1180px the narration moves under the map when the map
  would not fit beside it; a map that still does not fit scrolls sideways and follows the current step.

## Fonts and third-party code

Fonts are embedded in the generated HTML: IAD Sans (a renamed subset of Pretendard) and Geist Mono. Colors
and scales derive from Radix Colors and Primer Primitives. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT, see [LICENSE](LICENSE). Bundled fonts are under the SIL OFL 1.1.
