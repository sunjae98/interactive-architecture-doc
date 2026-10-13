# Contributing

## Development environment

- Node.js 18+ (no npm dependencies; the project uses only `node:` built-ins).
- Python 3 is needed only to regenerate fonts (see below).

```sh
npm test       # node --test test/*.test.mjs
npm run check  # validate every example
```

Run `npm test` before every commit.

## Layout

- `skills/interactive-architecture-doc/` is the distributed unit that `npx skills add` copies. Keep it
  self-contained: runtime scripts, template, fonts, examples, references, licenses.
- **No development files in the skill folder**: no tests, build tools, or CI config. Tests live in `test/`,
  tools in `tools/`. `test/docs.test.mjs` enforces this.
- `scripts/lib/validate.mjs` is the single source of truth for validation rules.

## Adding or changing a validation rule

1. Add the rule (with its code) to `RULES` in `scripts/lib/validate.mjs`.
2. Add a row for the same code to the rule table in
   `skills/interactive-architecture-doc/references/format.md`, and update the field docs if needed.
   A test cross-checks the table against the validator and fails if they drift.
3. Add a failing fixture for the code to `test/validate.test.mjs`.

## Regenerating fonts

Fonts are committed as subset woff2 files in `skills/interactive-architecture-doc/assets/fonts/`.
To rebuild them, follow `tools/build-fonts/README.md` (a local Python venv with fontTools; source archives
are pinned by version and SHA-256). Commit the new woff2 files together with `hashes.json`. If font
licenses or versions change, update `THIRD_PARTY_NOTICES.md` and the files in
`skills/interactive-architecture-doc/licenses/`; `test/docs.test.mjs` checks that they agree.

## Documentation

Keep `README.md` and `README.ko.md` in sync. `SKILL.md` is written in English for agents and must stay
within 150 lines. All relative links in markdown files must resolve (tested).
