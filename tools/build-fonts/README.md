# build-fonts

Reproducible subsetting of the bundled fonts. Development tool only: fontTools is not a
runtime, CI or distribution dependency (CI only verifies the committed woff2 hashes against `hashes.json`).

## Regenerate

```sh
cd tools/build-fonts
python3 -m venv .venv                      # gitignored
.venv/bin/pip install fonttools brotli     # tested with fonttools 4.66.1, brotli 1.2.0
.venv/bin/python build.py                  # writes assets/fonts/*.woff2 and hashes.json
.venv/bin/python build.py --check          # rebuild in memory only, no files written
```

Source archives are downloaded to `.cache/` (gitignored) and their SHA-256 is verified against
`fonts.spec.json` before use; a mismatch aborts. Output is deterministic (timestamps are not
recalculated), so `hashes.json` should be unchanged after a clean rebuild.

## Spec (`fonts.spec.json`)

- Per font: family, version, license, download URL, archive SHA-256, member path inside the archive, glyph ranges.
- Ranges: Basic Latin, Latin-1 punctuation, arrows/symbols used by the template and examples
  (`·` `–` `—` `→` `①` plus the general arrows / circled digit / geometric blocks).
  Emoji (e.g. `⏳ 💬 📷 🔎`) are intentionally not embedded; they fall back to the system emoji font.
- Pretendard additionally includes the KS X 1001 Hangul set: the 2,350 syllables in U+AC00-D7A3 that encode
  under strict KS X 1001 (EUC-KR lead byte 0xB0-0xC8, trail byte 0xA1-0xFE; Python's `euc-kr` codec is CP949,
  so the script filters out the UHC extension).
- Layout features are kept (`*`), hinting is dropped, output is woff2.

## Outputs (`skills/interactive-architecture-doc/assets/fonts/`)

| file | source | axes |
|------|--------|------|
| `pretendard.woff2` | Pretendard Variable v1.3.9 | wght 45-930 |
| `geist-mono.woff2` | Geist Mono v1.7.2 | wght 100-900 |

Both are variable fonts (one file covers weights 400/600/700). Update the pins in `fonts.spec.json`
(version, URL, archive SHA-256) to bump a font, rebuild, and commit the new woff2 plus `hashes.json`.
Licenses: see `skills/interactive-architecture-doc/licenses/` and `THIRD_PARTY_NOTICES.md`.
