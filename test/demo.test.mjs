// The live demo pages in docs/demo/ (GitHub Pages) must match a fresh render of the examples, so they
// cannot go stale: after changing the template or an example, run `npm run demo` and commit the result.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { DEMO, demoPages, renderPage, indexHtml } from "../tools/demo/build.mjs";

const pages = demoPages();

test("demo: one page per example plus the index, nothing else", () => {
  const expected = [...pages.map((p) => p.file), "index.html"].sort();
  assert.deepEqual(readdirSync(DEMO).filter((f) => f.endsWith(".html")).sort(), expected);
  assert.ok(pages.some((p) => p.overview) && pages.some((p) => !p.overview));
});

for (const p of pages) {
  test(`demo: docs/demo/${p.file} matches a fresh render (run npm run demo)`, () => {
    assert.ok(readFileSync(join(DEMO, p.file), "utf8") === renderPage(p), `${p.file} is stale: run npm run demo`);
  });
}

test("demo: the index matches, links every page, and loads nothing (no scripts, no external requests)", () => {
  const html = readFileSync(join(DEMO, "index.html"), "utf8");
  assert.ok(html === indexHtml(pages), "index.html is stale: run npm run demo");
  for (const p of pages) assert.ok(html.includes(`href="${p.file}"`), p.file);
  assert.ok(!/<script|<link|@import|url\(|src=/i.test(html), "nothing to fetch");
  assert.match(html, /default-src 'none'/);
  assert.match(html, /prefers-color-scheme:dark/);
});

test("demo: GitHub Pages serves the files as they are (no Jekyll processing)", () => {
  assert.ok(existsSync(join(DEMO, "..", ".nojekyll")));
});
