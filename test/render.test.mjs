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

test("tokens: each kind's text is >= 4.5:1 on its own bg and on the neutral surfaces, light and dark", () => {
  const themes = themeTokens();
  for (const [theme, t] of Object.entries(themes)) {
    for (const kind of ["client", "decision", "existing", "new"]) {
      const text = t[`--kind-${kind}-text`];
      for (const bg of [`--kind-${kind}-bg`, "--color-surface", "--color-bg"]) {
        const ratio = contrast(text, t[bg]);
        assert.ok(ratio >= 4.5, `${theme} --kind-${kind}-text on ${bg}: ${ratio.toFixed(2)}`);
      }
    }
    for (const [fg, bg] of [
      ["--color-text", "--color-surface"],
      ["--color-text-muted", "--color-surface"],
      ["--color-text-muted", "--color-bg"],
      ["--kind-decision-text", "--kind-decision-tag-bg"],
      ["--color-primary-text", "--color-primary-bg"],
      ["--color-code-text", "--color-code-bg"],
      ["--kind-decision-code-text", "--color-code-bg"],
      ["--kind-new-code-text", "--color-code-bg"],
    ]) {
      const ratio = contrast(t[fg], t[bg]);
      assert.ok(ratio >= 4.5, `${theme} ${fg} on ${bg}: ${ratio.toFixed(2)}`);
    }
  }
});

test("theme: early head script picks saved theme or OS preference, toggle persists it guardedly", () => {
  const src = readFileSync(TEMPLATE_PATH, "utf8");
  const head = src.slice(0, src.indexOf("</head>"));
  const early = head.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(early, "inline theme script in <head>");
  assert.ok(head.indexOf("<script>") < head.indexOf("<style>"), "theme is set before the CSS is parsed");
  for (const needle of ['localStorage.getItem("iad-theme")', "(prefers-color-scheme: dark)", 'setAttribute("data-theme", theme)']) {
    assert.ok(early[1].includes(needle), needle);
  }
  assert.ok(/try \{ theme = localStorage\.getItem/.test(early[1]), "storage read is guarded");
  assert.ok(src.includes('<button class="pg-btn pg-theme" id="pgTheme" aria-pressed="false">{{t:theme_dark}}</button>'));
  assert.ok(/try \{ localStorage\.setItem\("iad-theme", next\); \} catch/.test(src), "storage write is guarded");
  for (const lang of ["en", "ko"]) assert.equal(typeof UI[lang].theme_dark, "string", `${lang}.theme_dark`);
  // export copies the live theme
  assert.ok(src.includes('root.setAttribute("data-theme", html.getAttribute("data-theme"))'));
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
  assert.equal(count(html, /<script\b/g), 5, "2 JSON data blocks + early theme script + 2 runtime scripts");
  assert.equal(count(html, /<\/script>/g), 5);
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

test("export: sidebar has PNG / SVG / copy buttons and a live status area", () => {
  const src = readFileSync(TEMPLATE_PATH, "utf8");
  assert.ok(src.includes('<button class="pg-btn" id="pgExportPng">{{t:export_png}}</button>'));
  assert.ok(src.includes('<button class="pg-btn" id="pgExportSvg">{{t:export_svg}}</button>'));
  assert.ok(src.includes('<button class="pg-btn" id="pgExportCopy">{{t:export_copy}}</button>'));
  assert.ok(/<div class="pg-export-status" id="pgExportStatus" role="status" aria-live="polite"><\/div>/.test(src));
  assert.ok(src.includes("{{t:export_title}}"));
});

test("export: runtime follows the capture recipe", () => {
  const src = readFileSync(TEMPLATE_PATH, "utf8");
  for (const needle of [
    "window.draw(); // fan arrows",
    "window.matchMedia(rule.media.mediaText).matches",
    "<foreignObject",
    'xmlns="http://www.w3.org/2000/svg"',
    "new XMLSerializer().serializeToString(root)",
    '"data:image/svg+xml;charset=utf-8," + encodeURIComponent(ex.svg)',
    "Math.min(window.devicePixelRatio || 1, 2)",
    "EXPORT_MAX_PIXELS = 16000000",
    'new ClipboardItem({ "image/png": png })',
    'if (blob) resolve(blob); else reject(new Error("toBlob returned null"))',
  ]) {
    assert.ok(src.includes(needle), needle);
  }
  // export-only overrides and a caption that is hidden on the live page
  assert.ok(/\.export-caption\{display:none;\}/.test(src));
  assert.ok(/\.iad-export \.export-caption\{\s*display:block;/.test(src));
  assert.ok(/\.iad-export \*,[^{]*\{transition:none !important;animation:none !important;\}/.test(src));
  assert.ok(/\.iad-export \.stepper\{[^}]*flex-wrap:wrap;[^}]*position:static;/.test(src));
});

test("export: i18n tables carry every export string in both languages", () => {
  const keys = [
    "export_title", "export_png", "export_svg", "export_copy", "export_caption", "export_busy", "export_saved",
    "export_copied", "export_png_failed", "export_svg_failed", "export_clip_unsupported", "export_clip_denied",
  ];
  for (const lang of ["en", "ko"]) for (const k of keys) assert.equal(typeof UI[lang][k], "string", `${lang}.${k}`);
  for (const lang of ["en", "ko"]) {
    assert.match(UI[lang].export_caption, /\{scenario\}.*\{step\}\/\{total\}/);
    // every failure message points to an alternative
    for (const k of ["export_png_failed", "export_clip_unsupported", "export_clip_denied"]) assert.match(UI[lang][k], /SVG/);
  }
});

for (const file of exampleFiles) {
  test(`render ${file}: data-export marks exactly h1, subtitle, stepper, legend, board and caption`, () => {
    const doc = load(file);
    const { html } = renderHtml(doc);
    const body = html.split("</style>").pop();
    const marked = [...body.matchAll(/<(\w+)(?: class="([^"]+)")? data-export[ >]/g)].map(([, tag, cls]) => (cls ? `${tag}.${cls}` : tag));
    const expected = ["h1", ...(doc.meta.subtitle ? ["div.subtitle"] : []), "div.stepper", "div.legend", "div.board", "div.export-caption"];
    assert.deepEqual(marked, expected);
    assert.ok(body.includes('<div class="export-caption" data-export></div>'), "caption slot is empty until export");
    assert.ok(!/class="(tldr|callout|considerations|tool-examples|sidebar|playground)"[^>]*data-export/.test(body));
  });
}
