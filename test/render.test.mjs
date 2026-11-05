import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, writeFileSync, mkdtempSync, mkdirSync, rmSync, existsSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { renderHtml, ValidationFailed, TEMPLATE_PATH, fontFaces, writeFileAtomic } from "../skills/interactive-architecture-doc/scripts/lib/render.mjs";
import { UI } from "../skills/interactive-architecture-doc/scripts/lib/i18n.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SKILL = join(ROOT, "skills/interactive-architecture-doc");
const EXAMPLES = join(SKILL, "examples");
const CLI = join(SKILL, "scripts/iad.mjs");
const FIXTURE = join(ROOT, "test/fixtures/walkthrough.en.json");

const load = () => JSON.parse(readFileSync(FIXTURE, "utf8"));
const count = (s, re) => (s.match(re) || []).length;
const tmp = () => mkdtempSync(join(tmpdir(), "iad-render-"));
const run = (...args) => spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8" });
const ko = () => {
  const d = load();
  d.meta.lang = "ko";
  return d;
};

test("template: no hardcoded colors outside :root and theme blocks", () => {
  const src = readFileSync(TEMPLATE_PATH, "utf8");
  const tokenBlocks = /(^|\n)\s*(:root|\[data-theme="[a-z]+"\])\s*\{[^}]*\}/g;
  assert.ok(count(src, tokenBlocks) >= 2, "expected a :root block and a [data-theme] block");
  const rest = src.replace(tokenBlocks, "");
  const offenders = rest.match(/#[0-9a-fA-F]{3,8}(?![\w-])|\b(?:rgba?|hsla?|hwb|lab|lch|oklch|oklab)\(|&#/g);
  assert.equal(offenders, null, `hardcoded colors: ${offenders}`);
  // and no named colors used as values in component CSS
  const named = rest.match(/:\s*(?:white|black|red|green|blue|gray|grey)\b/g);
  assert.equal(named, null, `named colors: ${named}`);
});

test("template: exactly one :root block and a dark theme slot", () => {
  const src = readFileSync(TEMPLATE_PATH, "utf8");
  assert.equal(count(src, /:root\s*\{/g), 1);
  assert.equal(count(src, /\[data-theme="dark"\]\s*\{/g), 1);
});

// Token values per theme, parsed from the template: light = :root, dark = :root overridden by [data-theme="dark"].
function themeTokens() {
  const src = readFileSync(TEMPLATE_PATH, "utf8");
  const block = (sel) => {
    const m = src.match(new RegExp(`(?:^|\\n)\\s*${sel}\\s*\\{([^}]*)\\}`));
    assert.ok(m, `missing ${sel} block`);
    return Object.fromEntries([...m[1].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(([, k, v]) => [k, v.trim()]));
  };
  const light = block(":root");
  return { light, dark: { ...light, ...block('\\[data-theme="dark"\\]') } };
}

function contrast(a, b) {
  const lum = (hex) => {
    assert.match(hex, /^#[0-9a-f]{6}$/i, `expected an opaque #rrggbb color, got ${hex}`);
    const [r, g, bl] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

test("tokens: text on surfaces >= 4.5:1; kind and scenario text on their own bg >= 4.5:1 (light, dark)", () => {
  const themes = themeTokens();
  const fails = [];
  for (const [theme, t] of Object.entries(themes)) {
    const pairs = [["--text", "--surface"], ["--text", "--bg"], ["--muted", "--surface"], ["--muted", "--bg"], ["--muted", "--surface-2"], ["--err-tx", "--err-bg"]];
    for (const k of ["client", "infra", "app", "store", "tool", "dep"]) pairs.push([`--${k}-tx`, `--${k}-bg`]);
    for (let i = 1; i <= 6; i++) pairs.push([`--s${i}-tx`, `--s${i}-bg`]);
    for (const [fg, bg] of pairs) {
      const ratio = contrast(t[fg], t[bg]);
      if (ratio < 4.5) fails.push(`${theme} ${fg} on ${bg}: ${ratio.toFixed(2)}`);
    }
  }
  assert.deepEqual(fails, []);
});

test("theme: toggle button and UI strings exist (behaviour: test/runtime.test.mjs)", () => {
  const src = readFileSync(TEMPLATE_PATH, "utf8");
  assert.match(src, /<button class="theme-toggle" id="pgTheme" type="button" aria-label="\{\{t:theme_to_dark\}\}"/);
  assert.match(src, /class="icon-moon"[^>]*aria-hidden="true"/);
  assert.match(src, /class="icon-sun"[^>]*aria-hidden="true"/);
  assert.match(src, /\[data-theme="dark"\] \.theme-toggle \.icon-sun\{display:block;\}/);
  for (const lang of ["en", "ko"]) {
    for (const key of ["theme_to_dark", "theme_to_light"]) {
      assert.equal(typeof UI[lang][key], "string", `${lang}.${key}`);
    }
  }
});

test("template: reference breakpoints (1180 / 820 / 640) and the 340px narration column", () => {
  const src = readFileSync(TEMPLATE_PATH, "utf8");
  assert.match(src, /\.stage\{display:grid;grid-template-columns:minmax\(0,1fr\) 340px;/);
  assert.match(src, /@media \(max-width:1180px\)\{\s*\.stage\{grid-template-columns:1fr;grid-template-areas:"map" "ctrl" "aside";\}\s*aside\.detail\{position:static;margin-top:12px;\}/);
  // wide maps on desktop: stacked mode puts the narration between the map and the controls
  assert.match(src, /\.stage\[data-fit="stacked"\]\{grid-template-columns:minmax\(0,1fr\);grid-template-areas:"map" "aside" "ctrl";\}/);
  assert.match(src, /@media \(min-width:1181px\)\{\.stage\[data-fit="side"\] \.diagram svg\{min-width:calc\(var\(--map-w\) \* \.8\);\}\}/);
  assert.ok(src.includes('<div class="stage" id="stage" data-fit="side">'));
  assert.match(src, /@media \(max-width:820px\)\{\s*\.cases\{grid-template-columns:repeat\(3,minmax\(0,1fr\)\)\}?;?\}?/);
  assert.match(src, /@media \(max-width:640px\)\{\s*\.cases\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\);\}/);
  assert.match(src, /\.diagram\{[^}]*overflow-x:auto;/, "the map scrolls on narrow screens, not the page");
  // scale clamp: at most 1.15x the viewBox width, at least 0.85x (then the panel scrolls)
  assert.match(src, /\.diagram svg\{[^}]*width:min\(100%, calc\(var\(--map-w\) \* 1\.15\)\);min-width:calc\(var\(--map-w\) \* \.85\);/);
});

test("i18n: ko and en tables have identical keys and every {{t:key}} exists", () => {
  assert.deepEqual(Object.keys(UI.ko).sort(), Object.keys(UI.en).sort());
  const src = readFileSync(TEMPLATE_PATH, "utf8");
  for (const [, key] of src.matchAll(/\{\{t:([a-z0-9_]+)\}\}/g)) assert.ok(key in UI.en, key);
  // keys used by the runtime via t("...")
  for (const [, key] of src.matchAll(/\bt\("([a-z0-9_]+)"/g)) assert.ok(key in UI.en, key);
  // placeholders match across languages
  for (const key of Object.keys(UI.en)) {
    const ph = (s) => (s.match(/\{\w+\}/g) || []).sort().join();
    assert.equal(ph(UI.ko[key]), ph(UI.en[key]), key);
  }
});

for (const [name, make] of [["en", load], ["ko", ko]]) {
  test(`render fixture (${name}): static map and slots match the IR`, () => {
    const doc = make();
    const { html, warnings } = renderHtml(doc);
    assert.deepEqual(warnings, []);
    assert.ok(!/\{\{(IAD_|t:)/.test(html), "unreplaced slot");
    assert.ok(html.startsWith(`<!DOCTYPE html>\n<html lang="${name}">`));
    assert.deepEqual([...html.matchAll(/<g class="node (\w+)" data-id="([^"]+)"/g)].map((m) => [m[2], m[1]]), doc.nodes.map((n) => [n.id, n.kind]));
    assert.deepEqual([...html.matchAll(/<g class="edge" data-id="([^"]+)" data-k="(\w+)"/g)].map((m) => [m[1], m[2]]), doc.edges.map((e) => [e.id, e.kind]));
    assert.equal(count(html, /<path class="hit" d="/g), doc.edges.length);
    assert.equal(count(html, /<path class="ln" d="/g), doc.edges.length);
    assert.equal(count(html, /<g class="grp/g), doc.groups.length);
    assert.equal(count(html, /<g class="grp grp-muted"/g), doc.groups.filter((g) => g.tone === "muted").length);
    assert.equal(count(html, /<g class="badges" data-s=/g), doc.scenarios.length);
    assert.equal(count(html, /<g class="badge" data-step="\d+" tabindex="0" role="button" aria-label="/g), doc.scenarios.reduce((n, s) => n + s.steps.length, 0));
    assert.equal(count(html, /<rect class="gauge" data-gauge=/g), doc.gauges.length);
    assert.equal(count(html, /<g class="skipmark" data-s=/g), doc.scenarios.reduce((n, s) => n + (s.skip || []).length, 0));
    assert.equal(count(html, /<button type="button" class="case" data-s="s\d"/g), doc.scenarios.length);
    assert.equal(count(html, /<g class="node \w+" data-id="[^"]+" tabindex="0" role="button"/g), doc.nodes.length);
    assert.equal(count(html, /<div class="fact">/g), doc.meta.facts.length);
    assert.equal(count(html, /<section class="card table-card">/g), doc.tables.length);
    assert.ok(html.includes(`>${UI[name].next_step}</button>`));
    // embedded IR round-trips
    const data = html.match(/<script type="application\/json" id="iad-data">([\s\S]*?)<\/script>/)[1];
    assert.deepEqual(JSON.parse(data), doc);
  });

  test(`render fixture (${name}): byte-identical across two renders`, () => {
    assert.equal(renderHtml(make()).html, renderHtml(make()).html);
  });
}

test("render: a v2 walkthrough is refused with E_V2_WALKTHROUGH", () => {
  const v2 = JSON.parse(readFileSync(join(ROOT, "test/fixtures/v2-walkthrough.en.json"), "utf8"));
  assert.throws(() => renderHtml(v2), (e) => e instanceof ValidationFailed && e.result.errors.length === 1 && e.result.errors[0].code === "E_V2_WALKTHROUGH");
});

test("render: CSP meta allows exactly the inline executable scripts by hash", () => {
  const { html } = renderHtml(load());
  const meta = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/);
  assert.ok(meta, "CSP meta present");
  assert.ok(html.indexOf(meta[0]) < html.indexOf("<script"), "CSP precedes every script");
  const csp = meta[1].replace(/&#39;/g, "'");
  const directives = Object.fromEntries(csp.split(/;\s*/).map((d) => { const [k, ...v] = d.split(" "); return [k, v]; }));
  assert.deepEqual(directives["default-src"], ["'none'"]);
  assert.deepEqual(directives["style-src"], ["'unsafe-inline'"]);
  assert.deepEqual(directives["font-src"], ["data:"]);
  assert.deepEqual(directives["img-src"], ["data:", "blob:"]);
  assert.deepEqual(directives["base-uri"], ["'none'"]);
  assert.deepEqual(directives["form-action"], ["'none'"]);
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  assert.equal(scripts.length, 3, "theme + error collector + walkthrough runtime");
  const expected = scripts.map((b) => `'sha256-${createHash("sha256").update(b, "utf8").digest("base64")}'`);
  assert.deepEqual(directives["script-src"], expected);
  assert.ok(!directives["script-src"].includes("'unsafe-inline'"));
});

test("render: </script> and markup in author text are neutralized", () => {
  const doc = load();
  const evil = "</script><script>alert(1)</script><img src=x onerror=alert(2)>";
  doc.meta.title = evil;
  doc.meta.intro = evil + " **bold**";
  doc.nodes[0].title = evil;
  doc.nodes[0].lines = [evil];
  doc.groups[0].title = evil;
  doc.scenarios[0].title = evil;
  doc.scenarios[0].steps[0].title = evil;
  doc.tldr.points[0] = evil;
  const { html } = renderHtml(doc);
  assert.ok(!html.includes("<script>alert"));
  assert.ok(!html.includes("<img"));
  assert.equal(count(html, /<script\b/g), 5, "2 JSON data blocks + early theme script + error collector + runtime");
  assert.equal(count(html, /<\/script>/g), 5);
  assert.ok(html.includes("&lt;/script&gt;&lt;script&gt;alert(1)&lt;/script&gt;"));
  assert.ok(html.includes("<b>bold</b>"));
  const data = html.match(/id="iad-data">([\s\S]*?)<\/script>/)[1];
  assert.deepEqual(JSON.parse(data), doc);
});

test("render: plain-text fields keep markup characters literally", () => {
  const doc = load();
  doc.nodes[0].title = "**not bold** `not code`";
  doc.nodes[0].lines = ["  <indented>"];
  const { html } = renderHtml(doc);
  assert.ok(html.includes(">**not bold** `not code`</text>"));
  assert.ok(html.includes('">  &lt;indented&gt;</text>'), "leading spaces kept (CSS white-space:pre)");
  assert.ok(!html.includes("xml:space"));
});

test("render: muted lines get class \"nl m\"", () => {
  const doc = load();
  doc.nodes[3].lines = ["plain", { text: "dim", muted: true }];
  const { html } = renderHtml(doc);
  assert.match(html, /<text class="nl" x="[\d.]+" y="[\d.]+">plain<\/text>/);
  assert.match(html, /<text class="nl m" x="[\d.]+" y="[\d.]+">dim<\/text>/);
});

test("render: refuses documents with errors", () => {
  const doc = load();
  doc.nodes[0].kind = "server";
  assert.throws(() => renderHtml(doc), (e) => e instanceof ValidationFailed && e.result.errors[0].code === "E_UNKNOWN_KIND");
});

test("render: fonts slot is empty without fonts and inlines woff2 when present", () => {
  const dir = tmp();
  try {
    assert.equal(fontFaces(join(dir, "missing")), "");
    assert.equal(fontFaces(dir), "");
    writeFileSync(join(dir, "Demo.woff2"), Buffer.from([1, 2, 3]));
    const css = fontFaces(dir);
    assert.ok(css.includes('font-family:"Demo"') && css.includes("base64,AQID"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("render: bundled fonts are inlined as IAD Sans and Geist Mono and named by the font tokens", () => {
  const css = fontFaces();
  assert.equal(count(css, /@font-face\{/g), 2);
  assert.ok(css.includes('font-family:"IAD Sans";src:url(data:font/woff2;base64,'));
  assert.ok(css.includes('font-family:"Geist Mono";src:url(data:font/woff2;base64,'));
  assert.ok(/font-family:"IAD Sans";[^}]*font-weight:45 930;/.test(css), "variable weight range");
  assert.ok(!/pretendard/i.test(css), "Reserved Font Name must not be used for the subset");
  const src = readFileSync(TEMPLATE_PATH, "utf8");
  assert.match(src, /--font-sans:"IAD Sans",[^;]*sans-serif,"Apple Color Emoji"/);
  assert.match(src, /--font-mono:"Geist Mono",[^;]*monospace,"Apple Color Emoji"/);
});

test("CLI render: default output next to the JSON, atomic write leaves no temp files", () => {
  const dir = tmp();
  try {
    const input = join(dir, "doc.json");
    copyFileSync(FIXTURE, input);
    const r = run("render", input);
    assert.equal(r.status, 0, r.stderr);
    assert.ok(existsSync(join(dir, "doc.html")));
    assert.deepEqual(readdirSync(dir).sort(), ["doc.html", "doc.json"]);
    const first = readFileSync(join(dir, "doc.html"));
    assert.equal(run("render", input, "-o", join(dir, "again.html")).status, 0);
    assert.ok(first.equals(readFileSync(join(dir, "again.html"))), "byte-identical");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("CLI render: errors exit 1 and write nothing; --json reports them", () => {
  const dir = tmp();
  try {
    const doc = load();
    doc.scenarios[0].steps[0].edges = ["ghost"];
    const input = join(dir, "bad.json");
    writeFileSync(input, JSON.stringify(doc));
    const r = run("render", input);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /^\/scenarios\/0\/steps\/0\/edges\/0 E_EDGE_UNKNOWN /m);
    const j = run("render", input, "--json");
    assert.equal(j.status, 1);
    assert.equal(JSON.parse(j.stdout).errors[0].code, "E_EDGE_UNKNOWN");
    assert.deepEqual(readdirSync(dir), ["bad.json"]);
    assert.equal(run("render").status, 2);
    assert.equal(run("render", input, "-o").status, 2);
    assert.equal(run("render", FIXTURE, "-o", join(dir, "no/such/dir.html")).status, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("CLI render: refuses to overwrite the input (explicit -o or default path of an .html input)", () => {
  const dir = tmp();
  try {
    const input = join(dir, "doc.json");
    copyFileSync(FIXTURE, input);
    const r = run("render", input, "-o", join(dir, ".", "doc.json"));
    assert.equal(r.status, 2);
    assert.match(r.stderr, /overwrite the input/);
    const html = join(dir, "doc.html");
    copyFileSync(input, html);
    assert.equal(run("render", html).status, 2);
    assert.deepEqual(readFileSync(html), readFileSync(input), "input untouched");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("CLI --json: file and write errors still print {ok:false, error}", () => {
  const dir = tmp();
  try {
    const missing = join(dir, "missing.json");
    const v = run("validate", missing, "--json");
    assert.equal(v.status, 2);
    const one = JSON.parse(v.stdout);
    assert.equal(one.ok, false);
    assert.match(one.error, /cannot read/);
    const many = run("validate", FIXTURE, missing, "--json");
    assert.equal(many.status, 2);
    const arr = JSON.parse(many.stdout);
    assert.equal(arr.length, 2);
    assert.equal(arr[0].ok, true);
    assert.deepEqual({ ...arr[1], error: typeof arr[1].error }, { file: missing, ok: false, error: "string" });
    const w = run("render", FIXTURE, "-o", join(dir, "no/such/dir.html"), "--json");
    assert.equal(w.status, 2);
    const werr = JSON.parse(w.stdout);
    assert.equal(werr.ok, false);
    assert.match(werr.error, /^cannot write /);
    assert.ok(!/\n\s+at /.test(w.stderr), "no stack trace");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("render: template problems are reported as template errors, not write errors", () => {
  const dir = tmp();
  try {
    const doc = load();
    assert.throws(() => renderHtml(doc, { templatePath: join(dir, "nope.html") }), /^Error: template .* cannot be read/);
    const bad = join(dir, "bad.html");
    writeFileSync(bad, "<p>{{IAD_NOPE}}</p>");
    assert.throws(() => renderHtml(doc, { templatePath: bad }), /template uses unknown slot \{\{IAD_NOPE\}\}/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("writeFileAtomic: random exclusive temp file, nothing left behind on failure", () => {
  const dir = tmp();
  try {
    const target = join(dir, "out.html");
    writeFileAtomic(target, "one");
    writeFileAtomic(target, "two");
    assert.equal(readFileSync(target, "utf8"), "two");
    assert.deepEqual(readdirSync(dir), ["out.html"]);
    // rename onto a directory fails after the temp file was written: it must be removed
    const asDir = join(dir, "sub");
    mkdirSync(asDir);
    writeFileSync(join(asDir, "keep"), "x");
    assert.throws(() => writeFileAtomic(asDir, "data"));
    assert.deepEqual(readdirSync(dir).sort(), ["out.html", "sub"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("fonts: family names from file names are sanitized", () => {
  const dir = tmp();
  try {
    writeFileSync(join(dir, 'Evil";}body{x:url(y)}.woff2'), Buffer.from([1]));
    writeFileSync(join(dir, "\u00e9\u00e9.woff2"), Buffer.from([2]));
    const css = fontFaces(dir);
    assert.ok(css.includes('font-family:"Evilbodyxurly"'), css);
    assert.ok(css.includes('font-family:"font"'), css);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("export: PNG / SVG / copy buttons at the right end of the control bar, with a live status", () => {
  const src = readFileSync(TEMPLATE_PATH, "utf8");
  const ctrl = src.slice(src.indexOf('<div class="ctrl"'), src.indexOf('<div class="prog"'));
  const order = ["id=\"prev\"", "id=\"next\"", "id=\"play\"", "id=\"reset\"", "id=\"counter\"", "id=\"pgExportPng\"", "id=\"pgExportSvg\"", "id=\"pgExportCopy\""].map((k) => ctrl.indexOf(k));
  assert.ok(order.every((i, k) => i > 0 && (k === 0 || i > order[k - 1])), "buttons in order, export last");
  assert.ok(/<span class="exp-status" id="pgExportStatus" role="status" aria-live="polite"><\/span>/.test(ctrl));
  // export copies only map rules: every SVG rule is scoped under .wt-map
  const css = src.slice(src.indexOf("<style>"), src.indexOf("</style>"));
  const unscoped = [...css.matchAll(/(?:^|[}\n])\s*([^{}@\n]*\.(?:node|edge|grp|badge|tok|xm|gauge|skipmark)\b[^{]*)\{/g)]
    .map((m) => m[1].trim())
    .filter((sel) => !sel.split(",").every((x) => x.trim().startsWith(".wt-map")));
  assert.deepEqual(unscoped, []);
  // Safari needs the ClipboardItem inside the click handler, before any await/then/timer.
  const copy = src.slice(src.indexOf('exportCopyBtn.addEventListener("click"'));
  const item = copy.indexOf("new ClipboardItem(");
  assert.ok(item > 0);
  for (const deferral of ["setTimeout(", ".then(", "await "]) {
    const at = copy.indexOf(deferral);
    assert.ok(at === -1 || at > item, `${deferral} before ClipboardItem`);
  }
});

test("export: i18n tables carry every export string in both languages", () => {
  const keys = [
    "export_title", "export_png", "export_svg", "export_copy", "export_busy", "export_saved",
    "export_copied", "export_png_failed", "export_svg_failed", "export_clip_unsupported", "export_clip_denied",
  ];
  for (const lang of ["en", "ko"]) for (const k of keys) assert.equal(typeof UI[lang][k], "string", `${lang}.${k}`);
  for (const lang of ["en", "ko"]) {
    // every failure message points to an alternative
    for (const k of ["export_png_failed", "export_clip_unsupported", "export_clip_denied"]) assert.match(UI[lang][k], /SVG/);
  }
});

for (const f of readdirSync(EXAMPLES).filter((x) => x.endsWith(".json") && !x.includes(".overview."))) {
  test(`render example ${f}: no warnings, embedded IR round-trips, byte-identical twice`, () => {
    const doc = JSON.parse(readFileSync(join(EXAMPLES, f), "utf8"));
    const { html, warnings } = renderHtml(doc);
    assert.deepEqual(warnings, []);
    assert.ok(html.startsWith(`<!DOCTYPE html>\n<html lang="${doc.meta.lang}">`));
    assert.deepEqual(JSON.parse(html.match(/id="iad-data">([\s\S]*?)<\/script>/)[1]), doc);
    assert.equal(html, renderHtml(JSON.parse(readFileSync(join(EXAMPLES, f), "utf8"))).html);
  });
}
