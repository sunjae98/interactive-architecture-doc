import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, writeFileSync, mkdtempSync, rmSync, existsSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { renderHtml, ValidationFailed, TEMPLATE_PATH, fontFaces } from "../skills/interactive-architecture-doc/scripts/lib/render.mjs";
import { collectNodes } from "../skills/interactive-architecture-doc/scripts/lib/validate.mjs";
import { UI } from "../skills/interactive-architecture-doc/scripts/lib/i18n.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SKILL = join(ROOT, "skills/interactive-architecture-doc");
const EXAMPLES = join(SKILL, "examples");
const CLI = join(SKILL, "scripts/iad.mjs");

const load = (name) => JSON.parse(readFileSync(join(EXAMPLES, name), "utf8"));
const count = (s, re) => (s.match(re) || []).length;
const tmp = () => mkdtempSync(join(tmpdir(), "iad-render-"));
const run = (...args) => spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8" });

function countBlocks(blocks, type) {
  let n = 0;
  for (const b of blocks) {
    if (b.type === type) n++;
    if (b.children) n += countBlocks(b.children, type);
    if (b.columns) for (const c of b.columns) n += countBlocks(c.children, type);
  }
  return n;
}

const exampleFiles = readdirSync(EXAMPLES).filter((f) => f.endsWith(".json"));

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
  assert.ok(src.includes("stroke=\"currentColor\""), "fan arrows use currentColor");
  assert.ok(/\.zone-overlay\{[^}]*color:var\(--line\)/.test(src), "fan arrow color comes from --line");
});

test("template: grid columns come from --cols, not inline grid-template-columns", () => {
  const src = readFileSync(TEMPLATE_PATH, "utf8");
  assert.ok(/\.fork-row\{[^}]*repeat\(var\(--cols,4\),1fr\)/.test(src));
  assert.ok(/\.external-row\{[^}]*repeat\(var\(--cols,4\),1fr\)/.test(src));
  assert.ok(/@media \(max-width:1180px\)\{\s*\.fork-row,\.external-row\{grid-template-columns:repeat\(var\(--cols-md,2\),1fr\)/.test(src));
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

for (const file of exampleFiles) {
  test(`render ${file}: structure matches the IR`, () => {
    const doc = load(file);
    const { html, warnings } = renderHtml(doc);
    assert.deepEqual(warnings, []);
    assert.ok(!/\{\{(IAD_|t:)/.test(html), "unreplaced slot");
    assert.equal(count(html, /<div class="step">/g), doc.steps.length);
    const nodes = collectNodes(doc.board);
    assert.equal(count(html, / data-step="\d+"/g), nodes.length);
    assert.equal(count(html, / data-branch="/g), nodes.filter((n) => n.node.branches).length);
    for (const { node } of nodes) {
      if (node.branches) assert.ok(html.includes(`data-step="${node.step}" data-branch="${node.branches.join(",")}"`));
    }
    const forks = countBlocks(doc.board, "fork");
    assert.equal(count(html, /class="fork-zone"/g), forks);
    assert.equal(count(html, /<svg [^>]*data-fan-svg/g), forks);
    assert.ok(!/grid-template-columns/.test(html.split("</style>").pop()), "no inline grid-template-columns");
    const lang = doc.meta.lang || "en";
    assert.ok(html.startsWith(`<!DOCTYPE html>\n<html lang="${lang}">`));
    assert.ok(html.includes(UI[lang].steps_hint.replace(/"/g, "&quot;")));
    // embedded IR round-trips
    const data = html.match(/<script type="application\/json" id="iad-data">([\s\S]*?)<\/script>/)[1];
    assert.deepEqual(JSON.parse(data), doc);
  });

  test(`render ${file}: byte-identical across two renders`, () => {
    const doc = load(file);
    assert.equal(renderHtml(doc).html, renderHtml(load(file)).html);
  });
}

test("render: columns get --cols N and --cols-md min(N,2)", () => {
  const { html } = renderHtml(load("three-branch.en.json"));
  assert.ok(html.includes('class="fork-row" style="--cols:3;--cols-md:2"'));
  assert.ok(html.includes('class="external-row" style="--cols:2;--cols-md:2"'));
});

test("render: </script> and markup in author text are neutralized", () => {
  const doc = load("minimal.en.json");
  const evil = "</script><script>alert(1)</script><img src=x onerror=alert(2)>";
  doc.meta.title = evil;
  doc.board[0].body = evil + " **bold**";
  doc.board[0].code = evil;
  doc.scenarios[0].label = evil;
  doc.scenarios[0].steps["1"] = evil;
  const { html } = renderHtml(doc);
  assert.ok(!html.includes("<script>alert"));
  assert.ok(!html.includes("<img"));
  assert.equal(count(html, /<script\b/g), 4, "2 JSON data blocks + 2 runtime scripts");
  assert.equal(count(html, /<\/script>/g), 4);
  assert.ok(html.includes("&lt;/script&gt;&lt;script&gt;alert(1)&lt;/script&gt;"));
  assert.ok(html.includes("<b>bold</b>"));
  const data = html.match(/id="iad-data">([\s\S]*?)<\/script>/)[1];
  assert.deepEqual(JSON.parse(data), doc);
});

test("render: code fields are escaped only (no markup)", () => {
  const doc = load("minimal.en.json");
  doc.board[0].code = "**not bold** `not code`";
  const { html } = renderHtml(doc);
  assert.ok(html.includes("<code class=\"blk\" data-entry>**not bold** `not code`</code>"));
});

test("render: refuses documents with errors", () => {
  const doc = load("minimal.en.json");
  doc.board[0].kind = "server";
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

test("CLI render: default output next to the JSON, atomic write leaves no temp files", () => {
  const dir = tmp();
  try {
    const input = join(dir, "doc.json");
    copyFileSync(join(EXAMPLES, "three-branch.ko.json"), input);
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
    const doc = load("minimal.en.json");
    doc.steps.push({ label: "orphan" });
    const input = join(dir, "bad.json");
    writeFileSync(input, JSON.stringify(doc));
    const r = run("render", input);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /^\/steps\/3 E_STEP_NO_NODE /m);
    const j = run("render", input, "--json");
    assert.equal(j.status, 1);
    assert.equal(JSON.parse(j.stdout).errors[0].code, "E_STEP_NO_NODE");
    assert.deepEqual(readdirSync(dir), ["bad.json"]);
    assert.equal(run("render").status, 2);
    assert.equal(run("render", input, "-o").status, 2);
    assert.equal(run("render", join(EXAMPLES, "minimal.en.json"), "-o", join(dir, "no/such/dir.html")).status, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
