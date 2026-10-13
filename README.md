# interactive-architecture-doc

[한국어](README.ko.md)

An agent skill that turns a system design into a **self-contained, interactive HTML architecture document**:
a TL;DR, numbered steps, color-coded nodes, branching flows, and a scenario playground where the reader
steps through a request and sees which boxes activate and what data flows at each step.

The agent never writes HTML. It writes a JSON document, a dependency-free Node script validates it
(cross-references such as step numbers, branches, and fan arrows are checked), and renders one offline
HTML file. The viewer can export the **current view** (selected scenario and step) as PNG, SVG, or a
clipboard image. Light and dark themes, Korean and English UI.

| Light | Dark |
|---|---|
| ![Interactive architecture document, light theme](docs/screenshot-light.png) | ![Interactive architecture document, dark theme](docs/screenshot-dark.png) |

## Install

```sh
npx skills add sunjae98/interactive-architecture-doc
```

Requirements: Node.js 18+ and shell access for the agent. The generated HTML has no dependencies and
opens offline by double-click.

## Usage

Ask your agent, for example:

> Make an interactive architecture document for our upload pipeline: the client sends a file, the
> gateway decides between image/audio/video handling, and an external moderation service is called.

The agent follows `skills/interactive-architecture-doc/SKILL.md`: it gathers the details, copies the closest
file from `examples/`, writes `doc.json`, and runs

```sh
node scripts/iad.mjs validate doc.json   # fix reported errors and warnings
node scripts/iad.mjs render doc.json     # writes doc.html next to doc.json
```

Keep `doc.json` next to the HTML: it is the source. To update a document, edit the JSON and render again
(the HTML also embeds a copy of the JSON in `<script id="iad-data">`). The format is described in
`skills/interactive-architecture-doc/references/format.md`.

## Browser support and export limits

- Viewing works in current Chrome, Edge, Firefox, and Safari.
- Export renders the page through an SVG `foreignObject`. Output can differ slightly between browsers;
  Safari is the least predictable (fonts, emoji, and sizing may differ). If PNG or clipboard export fails,
  the document shows a message and the SVG export is the fallback.
- Copying an image to the clipboard needs a secure context (`https://` or `localhost`; `file://` support
  varies by browser) and the browser's clipboard permission. Not every browser supports image clipboard writes.
- Exported PNGs are capped at about 16 megapixels; very large views are scaled down.
- Emoji (scenario icons) use the system emoji font, so they look different per platform.

## Fonts and third-party code

Fonts are embedded in the generated HTML: IAD Sans (a renamed subset of Pretendard) and Geist Mono. Colors
and scales derive from Radix Colors and Primer Primitives. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Design notes: [docs/plans/v2.md](docs/plans/v2.md).

## License

MIT, see [LICENSE](LICENSE). Bundled fonts are under the SIL OFL 1.1.
