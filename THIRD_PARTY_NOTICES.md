# Third-party notices

This project (MIT, see `LICENSE`) bundles or derives from the components below. License texts are in
`skills/interactive-architecture-doc/licenses/`.

| Component | Version | License | Upstream | Used in |
|-----------|---------|---------|----------|---------|
| IAD Sans — a renamed subset of Pretendard Variable (Basic Latin, punctuation, symbols, KS X 1001 Hangul) | Pretendard 1.3.9 | SIL OFL 1.1 (`licenses/OFL-Pretendard.txt`) | https://github.com/orioncactus/pretendard | `skills/interactive-architecture-doc/assets/fonts/iad-sans.woff2`, inlined as base64 `@font-face` by the renderer into generated HTML |
| Geist Mono (subset: Basic Latin, punctuation, symbols) | 1.7.2 | SIL OFL 1.1 (`licenses/OFL-GeistMono.txt`) | https://github.com/vercel/geist-font | `skills/interactive-architecture-doc/assets/fonts/geist-mono.woff2`, inlined by the renderer |
| Radix Colors (color scale values, slate/sand/crimson/pink/violet/green/teal/amber/blue, light and dark) | 3.0.0 | MIT (`licenses/MIT-Radix.txt`) | https://github.com/radix-ui/colors | Design tokens in `skills/interactive-architecture-doc/assets/template.html` |
| Primer Primitives (spacing, radius and shadow scale values) | 11.10.0 | MIT (`licenses/MIT-Primer.txt`) | https://github.com/primer/primitives | Design tokens (`--space-*`, `--radius-*`, `--shadow-*`) in `skills/interactive-architecture-doc/assets/template.html` |

The fonts are modified (subset and converted to woff2) by `tools/build-fonts/`. Pretendard's license declares
"Pretendard" a Reserved Font Name (OFL clause 3: a Modified Version must not use it), so the subset is
renamed: its naming records (family, full, unique and PostScript names) say "IAD Sans" / "IADSans", and the
generated HTML declares it as `font-family: "IAD Sans"`. The copyright, trademark and license records of the
original are kept, and IAD Sans remains under the SIL Open Font License 1.1. Geist Mono's license declares no
Reserved Font Name; its subset keeps the name "Geist Mono" and remains under the SIL Open Font License 1.1.
