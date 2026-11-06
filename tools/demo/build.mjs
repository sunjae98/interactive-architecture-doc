#!/usr/bin/env node
// Renders the bundled examples to docs/demo/ (served by GitHub Pages) and writes docs/demo/index.html.
// Usage: npm run demo. test/demo.test.mjs fails when the committed pages differ from a fresh render.
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, basename } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { renderHtml } from "../../skills/interactive-architecture-doc/scripts/lib/render.mjs";
import { escapeHtml } from "../../skills/interactive-architecture-doc/scripts/lib/markup.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const EXAMPLES = join(ROOT, "skills", "interactive-architecture-doc", "examples");
export const DEMO = join(ROOT, "docs", "demo");

// Every example, in a stable order: walkthroughs first, then overviews; en before ko.
export function demoPages() {
  return readdirSync(EXAMPLES)
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      const doc = JSON.parse(readFileSync(join(EXAMPLES, f), "utf8"));
      return { file: basename(f, ".json") + ".html", doc, overview: doc.meta.style === "overview" };
    })
    .sort((a, b) => Number(a.overview) - Number(b.overview) || a.file.localeCompare(b.file));
}

export function renderPage(page) {
  return renderHtml(page.doc).html;
}

// A small static page: no scripts, no external requests, light and dark from the OS setting.
export function indexHtml(pages) {
  const item = (p) => {
    const d = p.doc;
    const lang = d.meta.lang === "ko" ? "한국어" : "English";
    const what = p.overview
      ? `overview · ${d.paths ? d.paths.length : 0} paths`
      : `walkthrough · ${d.nodes.length} components · ${d.scenarios.length} scenario${d.scenarios.length === 1 ? "" : "s"}`;
    return `<li><a href="${escapeHtml(p.file)}"><span class="t">${escapeHtml(d.meta.title)}</span><span class="m">${escapeHtml(lang)} · ${escapeHtml(what)}</span></a></li>`;
  };
  const section = (title, list) => (list.length ? `<h2>${title}</h2>\n<ul>\n${list.map(item).join("\n")}\n</ul>` : "");
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>interactive-architecture-doc demos</title>
<style>
  :root{color-scheme:light dark;--bg:#f9f9fb;--surface:#fcfcfd;--border:#d9d9e0;--text:#1c2024;--muted:#60646c;--link:#0c6ec4;}
  @media (prefers-color-scheme:dark){:root{--bg:#111113;--surface:#18191b;--border:#363a3f;--text:#edeef0;--muted:#b0b4ba;--link:#70b8ff;}}
  *{box-sizing:border-box;}
  body{margin:0;background:var(--bg);color:var(--text);font:15px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Apple SD Gothic Neo","Malgun Gothic",sans-serif;}
  main{max-width:760px;margin:0 auto;padding:40px 16px 56px;}
  h1{font-size:22px;margin:0 0 6px;}
  h2{font-size:15px;margin:28px 0 10px;color:var(--muted);font-weight:600;}
  p{margin:0;color:var(--muted);}
  ul{list-style:none;margin:0;padding:0;display:grid;gap:8px;}
  a{display:flex;flex-direction:column;gap:2px;padding:10px 14px;border:1px solid var(--border);border-radius:10px;background:var(--surface);color:var(--text);text-decoration:none;}
  a:hover,a:focus-visible{border-color:var(--link);}
  .t{font-weight:600;color:var(--link);}
  .m{font-size:13px;color:var(--muted);}
  footer{margin-top:32px;font-size:13px;color:var(--muted);}
  footer a{display:inline;padding:0;border:0;background:none;color:var(--link);}
</style>
</head>
<body>
<main>
<h1>interactive-architecture-doc demos</h1>
<p>The bundled examples, rendered by the skill. Each page is one self-contained HTML file that works offline.</p>
${section("Walkthrough", pages.filter((p) => !p.overview))}
${section("Overview", pages.filter((p) => p.overview))}
<footer>Source: <a href="https://github.com/sunjae98/interactive-architecture-doc">github.com/sunjae98/interactive-architecture-doc</a></footer>
</main>
</body>
</html>
`;
}

export function build() {
  mkdirSync(DEMO, { recursive: true });
  const pages = demoPages();
  for (const p of pages) writeFileSync(join(DEMO, p.file), renderPage(p));
  writeFileSync(join(DEMO, "index.html"), indexHtml(pages));
  return pages.map((p) => p.file);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const files = build();
  console.log(`wrote docs/demo/index.html and ${files.length} pages: ${files.join(", ")}`);
}
