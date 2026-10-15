// Overview style (`meta.style: "overview"`): layout geometry, rendered markup, template rules,
// runtime helpers and `iad init --style overview`.
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync, readdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { renderHtml, OVERVIEW_TEMPLATE_PATH } from "../skills/interactive-architecture-doc/scripts/lib/render.mjs";
import { validate } from "../skills/interactive-architecture-doc/scripts/lib/validate.mjs";
import { layoutOverview, textWidth, GEOMETRY } from "../skills/interactive-architecture-doc/scripts/lib/layout.mjs";
import { UI } from "../skills/interactive-architecture-doc/scripts/lib/i18n.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const EXAMPLES = join(ROOT, "skills/interactive-architecture-doc/examples");
const CLI = join(ROOT, "skills/interactive-architecture-doc/scripts/iad.mjs");
const load = (name) => JSON.parse(readFileSync(join(EXAMPLES, name), "utf8"));
const count = (s, re) => (s.match(re) || []).length;
const run = (...args) => spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8" });
const plain = (v) => JSON.parse(JSON.stringify(v));

const overviewFiles = readdirSync(EXAMPLES).filter((f) => f.endsWith(".json") && load(f).meta.style === "overview");

test("overview examples exist in both languages", () => {
  assert.ok(overviewFiles.some((f) => f.endsWith(".en.json")) && overviewFiles.some((f) => f.endsWith(".ko.json")));
});

// ---- rendered markup ---------------------------------------------------------

for (const file of overviewFiles) {
  test(`render ${file}: structure matches the IR`, () => {
    const doc = load(file);
    const { html, warnings } = renderHtml(doc);
    assert.deepEqual(warnings, []);
    assert.ok(!/\{\{(IAD_|t:)/.test(html), "unreplaced slot");
    const lang = doc.meta.lang || "en";
    assert.ok(html.startsWith(`<!DOCTYPE html>\n<html lang="${lang}">`));
    const nodeIds = doc.layers.flatMap((l) => l.nodes.map((n) => n.id));
    assert.deepEqual([...html.matchAll(/ data-node="([^"]+)"/g)].map((m) => m[1]), nodeIds);
    assert.equal(count(html, /class="ov-edge"/g), doc.edges.length);
    const labels = doc.edges.reduce((n, e) => n + (e.label ? 1 : 0) + Object.keys(e.label_by_path || {}).length, 0);
    assert.equal(count(html, /class="ov-pill"/g), labels);
    assert.equal(count(html, /class="ov-pill" data-for="[^"]+" display="none"/g), labels - doc.edges.filter((e) => e.label).length, "path variants start hidden");
    assert.equal(count(html, /class="ov-group"/g), doc.groups.length);
    assert.equal(count(html, /class="ov-boundary"/g), doc.layers.filter((l) => l.boundary).length);
    assert.equal(count(html, /class="ov-tab"/g), doc.paths.length + 1);
    assert.ok(html.includes(`>${UI[lang].tab_overview}</button>`));
    assert.equal(count(html, /class="ov-caption" data-caption="[^"]*"/g), (doc.caption ? 1 : 0) + doc.paths.filter((p) => p.caption).length);
    // walkthrough-only parts are absent
    assert.ok(!/class="(stepper|legend|tldr|sidebar)"/.test(html));
    const data = html.match(/<script type="application\/json" id="iad-data">([\s\S]*?)<\/script>/)[1];
    assert.deepEqual(JSON.parse(data), doc);
  });

  test(`render ${file}: byte-identical across two renders`, () => {
    assert.equal(renderHtml(load(file)).html, renderHtml(load(file)).html);
  });
}

test("render: author text in the SVG and captions is escaped; captions allow only **bold** and `code`", () => {
  const doc = load("request-router.overview.en.json");
  doc.layers[1].nodes[0].title = "<b>x</b>";
  doc.edges[0].label = '"><script>';
  doc.caption = "**ok** `<i>` <img>";
  const { html } = renderHtml(doc);
  const body = html.split("</style>").pop();
  assert.ok(body.includes("&lt;b&gt;x&lt;/b&gt;"));
  assert.ok(body.includes("&quot;&gt;&lt;script&gt;"));
  assert.ok(body.includes('<b>ok</b> <code class="ic">&lt;i&gt;</code> &lt;img&gt;'));
});

test("render: a document without paths has no tabs, and every label shows by default", () => {
  const doc = load("request-router.overview.en.json");
  delete doc.paths;
  delete doc.edges[1].label_by_path;
  const { html } = renderHtml(doc);
  assert.ok(!html.includes('class="ov-tabs"'));
  assert.ok(!html.includes('display="none"'));
});

test("render: overview CSP allows exactly the inline executable scripts by hash", () => {
  const { html } = renderHtml(load("request-router.overview.en.json"));
  const csp = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/)[1].replace(/&#39;/g, "'");
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  assert.equal(scripts.length, 3, "theme + error collector + overview runtime");
  const expected = scripts.map((b) => `'sha256-${createHash("sha256").update(b, "utf8").digest("base64")}'`);
  const scriptSrc = csp.split(/;\s*/).find((d) => d.startsWith("script-src ")).split(" ").slice(1);
  assert.deepEqual(scriptSrc, expected);
  assert.ok(csp.includes("default-src 'none'"));
});

// ---- template -------------------------------------------------------------------

test("overview template: no hardcoded colors outside :root and the dark theme block", () => {
  const src = readFileSync(OVERVIEW_TEMPLATE_PATH, "utf8");
  const tokenBlocks = /(^|\n)\s*(:root|\[data-theme="[a-z]+"\])\s*\{[^}]*\}/g;
  assert.equal(count(src, /:root\s*\{/g), 1);
  assert.equal(count(src, /\[data-theme="dark"\]\s*\{/g), 1);
  const rest = src.replace(tokenBlocks, "");
  const offenders = rest.match(/#[0-9a-fA-F]{3,8}(?![\w-])|\b(?:rgba?|hsla?|hwb|lab|lch|oklch|oklab)\(|&#/g);
  assert.equal(offenders, null, `hardcoded colors: ${offenders}`);
});

test("overview template: every {{t:key}} exists, and diagram rules are scoped for the export", () => {
  const src = readFileSync(OVERVIEW_TEMPLATE_PATH, "utf8");
  for (const [, key] of src.matchAll(/\{\{t:([a-z0-9_]+)\}\}/g)) assert.ok(Object.hasOwn(UI.en, key), key);
  // the export copies rules whose selector starts with .ov-diagram; diagram classes must not be styled elsewhere
  const css = src.slice(src.indexOf("<style>"), src.indexOf("</style>"));
  const unscoped = [...css.matchAll(/(?:^|[}\n])\s*([^{}@\n]*\.ov-(?:node|edge|pill|box|title|code|head|row|line|arrow|group|boundary|label)\b[^{]*)\{/g)]
    .map((m) => m[1].trim())
    .filter((sel) => !sel.split(",").every((s) => s.trim().startsWith(".ov-diagram")));
  assert.deepEqual(unscoped, []);
  assert.ok(src.includes('id="pgTheme"') && src.includes('class="icon-moon"') && src.includes('class="icon-sun"'));
});

// ---- runtime pure helpers ------------------------------------------------------

const PURE_RE = /\/\/ ---- BEGIN pure helpers[^\n]*\n([\s\S]*?)\/\/ ---- END pure helpers/g;
function loadHelpers(ui = UI.en) {
  const html = renderHtml(load("request-router.overview.en.json")).html;
  const blocks = [...html.matchAll(PURE_RE)].map((m) => m[1]);
  assert.equal(blocks.length, 1);
  const ctx = vm.createContext({ UI: ui });
  vm.runInContext(blocks[0], ctx);
  return ctx;
}

test("runtime: pathFromHash accepts only known path ids", () => {
  const h = loadHelpers();
  assert.equal(h.pathFromHash("#lookup", ["simple", "lookup"]), "lookup");
  assert.equal(h.pathFromHash("lookup", ["lookup"]), "lookup");
  assert.equal(h.pathFromHash("#iad-selfcheck", ["lookup"]), "");
  assert.equal(h.pathFromHash("", ["lookup"]), "");
  assert.equal(h.pathFromHash("#path=lookup", ["lookup"]), "");
});

test("runtime: visibleLabel prefers the path's own variant, else the default", () => {
  const h = loadHelpers();
  assert.equal(h.visibleLabel(["", "simple", "job"], "job"), 2);
  assert.equal(h.visibleLabel(["", "simple", "job"], "lookup"), 0);
  assert.equal(h.visibleLabel(["", "simple"], ""), 0);
  assert.equal(h.visibleLabel(["simple"], ""), -1, "no default label: nothing shows on the overview");
  assert.equal(h.visibleLabel(["simple"], "simple"), 0);
});

test("runtime: judgePath reports missing highlights, labels and overflow", () => {
  const h = loadHelpers();
  const out = [];
  h.judgePath("p", { members: ["a", "b"], on: ["a"], edgesOn: 0, labels: [{ edge: "a->b", visible: 2 }], overflow: true }, out);
  assert.deepEqual(plain(out).map((f) => f.check), ["path-nodes", "path-edges", "edge-label", "overflow"]);
  const ok = [];
  h.judgePath("", { members: [], on: [], edgesOn: 0, labels: [{ edge: "a->b", visible: 1 }], overflow: false }, ok);
  assert.deepEqual(plain(ok), []);
});

test("runtime: t() and export scale", () => {
  const h = loadHelpers({ a: "Saved {file} {x}" });
  assert.equal(h.t("a", { file: "f.svg" }), "Saved f.svg {x}");
  assert.equal(h.exportScale(880, 700), 2);
  assert.ok(h.exportScale(10000, 10000) * 10000 <= 16384);
});

// ---- layout ----------------------------------------------------------------------

test("layout: edges are vertical inside both nodes; parallel edges get separate lanes", () => {
  const doc = load("request-router.overview.en.json");
  const geo = layoutOverview(doc);
  assert.deepEqual(geo.issues, []);
  for (const e of geo.edges) {
    for (const id of [e.from, e.to]) {
      const n = geo.nodes[id];
      assert.ok(e.x >= n.x && e.x <= n.x + n.w, `${id} contains x=${e.x}`);
    }
    assert.ok(e.y1 < e.y2);
  }
  const lanes = geo.edges.filter((e) => [e.from, e.to].sort().join() === "classifier,client").map((e) => e.x);
  assert.equal(lanes.length, 2);
  assert.ok(Math.abs(lanes[0] - lanes[1]) >= 100, "request and response lanes are apart");
});

test("layout: edge labels avoid group borders and boundary lines", () => {
  const geo = layoutOverview(load("request-router.overview.en.json"));
  const rails = [...geo.boundaries.map((b) => b.y), ...geo.groups.flatMap((g) => [g.y, g.y + g.h])];
  for (const e of geo.edges) {
    for (const p of e.pills) {
      for (const r of rails) assert.ok(Math.abs(p.y - r) >= GEOMETRY.pillH / 2, `pill at ${p.y} crosses rail ${r}`);
    }
  }
});

test("layout: columns set the grid; text width counts wide glyphs as 1em", () => {
  const doc = load("request-router.overview.en.json");
  doc.meta.columns = 4;
  doc.layers[0].nodes[0].span = 4;
  doc.layers[1].nodes[0].span = 4;
  const geo = layoutOverview(doc);
  assert.equal(geo.columns, 4);
  assert.ok(geo.colW < layoutOverview(load("request-router.overview.en.json")).colW);
  assert.equal(textWidth("가나", 10), 20);
  assert.equal(textWidth("ab", 10, { mono: true }), 12);
});

// layout regressions from review: a small builder for one-off documents
const mini = (layers, edges = [], extra = {}) => ({
  meta: { style: "overview", title: "T", ...(extra.meta || {}) },
  layers,
  ...(edges.length ? { edges } : {}),
  ...(extra.rest || {}),
});
const n = (id, more = {}) => ({ id, title: id.toUpperCase(), ...more });
const textWarnings = (doc) => validate(doc).warnings.filter((w) => w.code === "W_TEXT_LONG");

test("layout: a group around the first layer stays inside the viewBox", () => {
  const doc = mini([{ group: "s", nodes: [n("a", { span: 3 })] }, { nodes: [n("b", { span: 3 })] }], [{ from: "a", to: "b" }], { rest: { groups: [{ id: "s", label: "SYS" }] } });
  assert.deepEqual(validate(doc).errors, []);
  const geo = layoutOverview(doc);
  assert.ok(geo.groups[0].y >= 0, `group top ${geo.groups[0].y}`);
  assert.ok(renderHtml(doc).html.includes('class="ov-group"'));
});

test("layout: an edge label moves off a boundary label in the same gap", () => {
  const doc = mini(
    [{ nodes: [n("client", { span: 3, tone: "outer" })] }, { group: "s", boundary: "EXTERNAL SERVICES", nodes: [n("a"), n("b"), n("c")] }],
    [{ from: "client", to: "a", label: "request" }],
    { rest: { groups: [{ id: "s", label: "SYS" }] } }
  );
  assert.deepEqual(validate(doc), { ok: true, errors: [], warnings: [] });
  const geo = layoutOverview(doc);
  const pill = geo.edges[0].pills[0];
  const b = geo.boundaries[0];
  const labelTop = b.labelY - 11;
  const labelBottom = b.labelY + 3;
  assert.ok(pill.y - 12 >= labelBottom || pill.y + 12 <= labelTop, `pill ${pill.y} vs label ${labelTop}..${labelBottom}`);
});

test("layout: a long group label crossed by an edge line is reported", () => {
  const doc = mini(
    [{ nodes: [n("a", { span: 3 })] }, { group: "t", nodes: [n("b"), n("c"), n("d")] }],
    [{ from: "a", to: "b" }],
    { rest: { groups: [{ id: "t", label: "A VERY LONG GROUP LABEL HERE" }] } }
  );
  assert.ok(textWarnings(doc).some((w) => /crosses the label/.test(w.message)), JSON.stringify(validate(doc).warnings));
});

test("layout: labels a few px apart vertically still count as overlapping", () => {
  const doc = mini(
    [{ nodes: [n("a", { rows: ["x()"] }), n("c")] }, { nodes: [n("b"), n("d")] }],
    [{ from: "a", to: "b", label: "abcdefghijklmnopqrstuvwxyz" }, { from: "c", to: "d", label: "abcdefghijklmnopqrstuvwxyz" }],
    { meta: { columns: 4 } }
  );
  const geo = layoutOverview(doc);
  assert.notEqual(geo.edges[0].pills[0].y, geo.edges[1].pills[0].y, "card shifts the label");
  assert.ok(textWarnings(doc).some((w) => /overlaps the label/.test(w.message)));
});

test("layout: a label past the diagram edge is reported; nodes render in document order", () => {
  const doc = mini([{ nodes: [n("a")] }, { nodes: [n("b")] }], [{ from: "a", to: "b", label: "x".repeat(40) }], { meta: { columns: 4 } });
  assert.ok(textWarnings(doc).some((w) => /past the edge/.test(w.message)));
  const ordered = mini([{ nodes: [n("b"), n("10"), n("2")] }]);
  const ids = [...renderHtml(ordered).html.matchAll(/ data-node="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(ids, ["b", "10", "2"]);
});

// ---- init --------------------------------------------------------------------------

function withDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), "iad-ov-"));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

for (const combo of [[], ["--lang", "ko"], ["--paths", "read,write"], ["--paths", "a,b,c,d", "--lang", "ko"]]) {
  test(`init --style overview ${combo.join(" ")}: 0 errors, only W_PLACEHOLDER warnings, renders`, () =>
    withDir((dir) => {
      const out = join(dir, "doc.json");
      const r = run("init", out, "--style", "overview", ...combo);
      assert.equal(r.status, 0, r.stderr);
      const doc = JSON.parse(readFileSync(out, "utf8"));
      assert.equal(doc.meta.style, "overview");
      const result = validate(doc);
      assert.deepEqual(result.errors, []);
      assert.deepEqual([...new Set(result.warnings.map((w) => w.code))], ["W_PLACEHOLDER"]);
      const paths = combo.includes("--paths") ? combo[combo.indexOf("--paths") + 1].split(",") : [];
      assert.deepEqual((doc.paths || []).map((p) => p.id), paths);
      assert.ok(renderHtml(doc).html.includes('class="ov-diagram"'));
    }));
}

test("init: style-specific options are rejected for the other style (exit 2, nothing written)", () =>
  withDir((dir) => {
    const out = join(dir, "doc.json");
    for (const args of [
      ["--style", "overview", "--steps", "3"],
      ["--style", "overview", "--fork"],
      ["--style", "overview", "--scenarios", "a,b"],
      ["--paths", "a,b"],
      ["--style", "poster"],
      ["--style", "overview", "--paths", "a,b,c,d,e"],
      ["--style", "overview", "--paths", "a,a"],
      ["--style", "overview", "--paths", "Bad"],
      ["--style", "overview", "--paths", "client"],
      ["--style", "overview", "--paths", "iad-selfcheck"],
    ]) {
      const r = run("init", out, ...args);
      assert.equal(r.status, 2, args.join(" "));
      assert.deepEqual(readdirSync(dir), [], args.join(" "));
    }
  }));
