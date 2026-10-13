# Third-party notices

This project (MIT, see `LICENSE`) bundles or derives from the components below. License texts are in
`skills/interactive-architecture-doc/licenses/`.

| Component | Version | License | Upstream | Used in |
|-----------|---------|---------|----------|---------|
| Pretendard Variable (subset: Basic Latin, punctuation, symbols, KS X 1001 Hangul) | 1.3.9 | SIL OFL 1.1 (`licenses/OFL-Pretendard.txt`) | https://github.com/orioncactus/pretendard | `skills/interactive-architecture-doc/assets/fonts/pretendard.woff2`, inlined as base64 `@font-face` by the renderer into generated HTML |
| Geist Mono (subset: Basic Latin, punctuation, symbols) | 1.7.2 | SIL OFL 1.1 (`licenses/OFL-GeistMono.txt`) | https://github.com/vercel/geist-font | `skills/interactive-architecture-doc/assets/fonts/geist-mono.woff2`, inlined by the renderer |
| Radix Colors (color scale values, slate/sand/crimson/pink/violet/green/teal/amber/blue, light and dark) | 3.0.0 | MIT (`licenses/MIT-Radix.txt`) | https://github.com/radix-ui/colors | Design tokens in `skills/interactive-architecture-doc/assets/template.html` |
| Primer Primitives (spacing, radius and shadow scale values) | 11.10.0 | MIT (`licenses/MIT-Primer.txt`) | https://github.com/primer/primitives | Design tokens (`--space-*`, `--radius-*`, `--shadow-*`) in `skills/interactive-architecture-doc/assets/template.html` |

The fonts are modified (subset and converted to woff2) by `tools/build-fonts/`. Pretendard's license declares
"Pretendard" a Reserved Font Name (OFL clause 3: a Modified Version must not use it). The current subset keeps the
upstream internal font name; this needs a decision before public release (rename the font's internal family
name, or confirm with upstream that official subsetting is acceptable).
