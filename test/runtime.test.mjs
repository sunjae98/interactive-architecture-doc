// Behavioural tests for the browser runtime in assets/template.html.
// The scripts are taken from a rendered page (what actually ships) and run in node:vm with minimal
// stubs: the early theme script as a whole, and the "pure helpers" blocks of the runtime scripts.
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { renderHtml } from "../skills/interactive-architecture-doc/scripts/lib/render.mjs";
import { UI } from "../skills/interactive-architecture-doc/scripts/lib/i18n.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const EXAMPLES = join(ROOT, "skills/interactive-architecture-doc/examples");
const HTML = renderHtml(JSON.parse(readFileSync(join(EXAMPLES, "minimal.en.json"), "utf8"))).html;

// Values created inside the vm context have that context's prototypes; compare as plain JSON.
const plain = (v) => JSON.parse(JSON.stringify(v));

// ---- pure helpers -------------------------------------------------------------

const PURE_RE = /\/\/ ---- BEGIN pure helpers[^\n]*\n([\s\S]*?)\/\/ ---- END pure helpers/g;

class FakeMediaRule {
  constructor(mediaText, cssRules) { this.media = { mediaText }; this.cssRules = cssRules; }
}
class FakeSupportsRule {
  constructor(conditionText, cssRules) { this.conditionText = conditionText; this.cssRules = cssRules; }
}

function loadHelpers({ ui = UI.en, matches = () => false, supports = () => false } = {}) {
  const blocks = [...HTML.matchAll(PURE_RE)].map((m) => m[1]);
  assert.equal(blocks.length, 2, "fan-arrow and playground scripts each have one pure block");
  const window = { CSSMediaRule: FakeMediaRule, CSSSupportsRule: FakeSupportsRule, matchMedia: (q) => ({ matches: matches(q) }) };
  const ctx = vm.createContext({
    UI: ui,
    window,
    CSSMediaRule: FakeMediaRule,
    CSSSupportsRule: FakeSupportsRule,
    CSS: { supports },
  });
  window.CSS = ctx.CSS;
  vm.runInContext(blocks.join("\n"), ctx);
  return ctx;
}

test("t(): fills known placeholders, keeps unknown ones, works for every UI string", () => {
  const h = loadHelpers({ ui: { a: "Step {step}/{total} {other}", b: "plain" } });
  assert.equal(h.t("a", { step: 2, total: 5 }), "Step 2/5 {other}");
  assert.equal(h.t("a"), "Step {step}/{total} {other}");
  assert.equal(h.t("b", { step: 1 }), "plain");
  // inherited names are not parameters
  assert.equal(h.t("a", Object.create({ step: 9 })), "Step {step}/{total} {other}");
  for (const lang of ["en", "ko"]) {
    const hl = loadHelpers({ ui: UI[lang] });
    assert.ok(hl.t("export_caption", { scenario: "S", step: 1, total: 3 }).includes("1/3"), lang);
  }
});

test("entry request: one pass, quoted {{input}} is JSON-escaped, bare is raw", () => {
  const h = loadHelpers();
  assert.equal(h.fillEntryRequest('POST /x\n{ "q": "{{input}}" }', 'say "hi"\n'), 'POST /x\n{ "q": "say \\"hi\\"\\n" }');
  assert.equal(h.fillEntryRequest("GET /s?q={{input}}", "a b"), "GET /s?q=a b");
  // input that itself contains the marker is never substituted again
  assert.equal(h.fillEntryRequest('"{{input}}" {{input}}', "{{input}}"), '"{{input}}" {{input}}');
  assert.equal(h.fillEntryRequest("{{input}}", "$& $1 $$"), "$& $1 $$", "no replacement patterns");
});

test("entry text: scenario input fills the request; no input keeps the code or falls back to empty input", () => {
  const h = loadHelpers();
  const tpl = 'POST /x { "q": "{{input}}" }';
  assert.equal(h.entryText(tpl, "hi", "authored"), 'POST /x { "q": "hi" }');
  assert.equal(h.entryText(tpl, undefined, "authored"), "authored");
  assert.equal(h.entryText(tpl, undefined, ""), 'POST /x { "q": "" }');
  assert.equal(h.entryText(undefined, "hi", "authored"), "authored");
});

test("file names: unsafe characters removed, whitespace dashed, trimmed, capped at 80", () => {
  const h = loadHelpers();
  assert.equal(h.sanitizeFilePart('a<b>c:"d"/e\\f|g?h*i'), "abcdefghi");
  assert.equal(h.sanitizeFilePart("  Request   Router  "), "Request-Router");
  assert.equal(h.sanitizeFilePart("a\u0000\u001b[31mb\u007f"), "a[31mb");
  assert.equal(h.sanitizeFilePart("..-x-.."), "x");
  assert.equal(h.sanitizeFilePart("요청 라우터"), "요청-라우터");
  assert.equal(h.sanitizeFilePart("x".repeat(200)).length, 80);
});

test("export scale: dpr clamped to 1..2, then capped by canvas area and side", () => {
  const h = loadHelpers();
  assert.equal(h.exportScale(1000, 1000, 1), 1);
  assert.equal(h.exportScale(1000, 1000, 0.5), 1, "low dpr is raised to 1");
  assert.equal(h.exportScale(1000, 1000, undefined), 1);
  assert.equal(h.exportScale(1000, 1000, 2), 2);
  assert.equal(h.exportScale(1000, 1000, 3), 2, "high dpr is capped at 2");
  const area = h.exportScale(4000, 4000, 2);
  assert.ok(Math.abs(4000 * 4000 * area * area - 16000000) < 1, "area cap ~16MP");
  assert.equal(h.exportScale(100, 20000, 2), 16384 / 20000, "side cap");
});

test("collectRules: keeps matching @media/@supports, drops the rest, collects token names", () => {
  const h = loadHelpers({ matches: (q) => q === "(max-width:1180px)", supports: (c) => c === "(display:grid)" });
  const rule = (selectorText, props = []) => ({ selectorText, cssText: `${selectorText}{}`, style: Object.assign([...props], { length: props.length }) });
  const rules = [
    rule(":root", ["--color-bg", "color-scheme"]),
    rule('[data-theme="dark"]', ["--line"]),
    rule(".node", ["--not-a-token-source"]),
    new FakeMediaRule("(max-width:1180px)", [rule(".fork-row"), new FakeMediaRule("(max-width:900px)", [rule(".nested")])]),
    new FakeMediaRule("(max-width:900px)", [rule(".stacked")]),
    new FakeSupportsRule("(display:grid)", [rule(".grid")]),
    new FakeSupportsRule("(display:nope)", [rule(".nope")]),
  ];
  const css = [];
  const tokens = {};
  h.collectRules(rules, css, tokens);
  assert.deepEqual(plain(css), [":root{}", '[data-theme="dark"]{}', ".node{}", ".fork-row{}", ".grid{}"]);
  assert.deepEqual(Object.keys(tokens).sort(), ["--color-bg", "--line"]);
});

test("fan targets: only first-node-in-column targets in the first grid row get arrows", () => {
  const h = loadHelpers();
  const pick = (targets) =>
    plain(h.firstRowTargets(targets, (el) => el.colTop, (el) => el.first)).map((el) => el.id);
  // three columns side by side, all first in their column
  assert.deepEqual(pick([{ id: "a", colTop: 100, first: true }, { id: "b", colTop: 100.4, first: true }, { id: "c", colTop: 100, first: true }]), ["a", "b", "c"]);
  // wrapped into two rows: the third column moved down
  assert.deepEqual(pick([{ id: "a", colTop: 100, first: true }, { id: "b", colTop: 100, first: true }, { id: "c", colTop: 400, first: true }]), ["a", "b"]);
  // a target below another node in the same (first-row) column gets no arrow
  assert.deepEqual(pick([{ id: "a", colTop: 100, first: true }, { id: "b", colTop: 100, first: false }]), ["a"]);
  // the first row is decided by first-in-column targets only
  assert.deepEqual(pick([{ id: "low", colTop: 50, first: false }, { id: "a", colTop: 100, first: true }]), ["a"]);
  assert.deepEqual(pick([{ id: "x", colTop: 100, first: false }]), []);
  assert.deepEqual(pick([]), []);
});

// ---- early theme script -----------------------------------------------------

function runThemeScript({ stored, throws = false, prefersDark = false, hasMatchMedia = true }) {
  const head = HTML.slice(0, HTML.indexOf("</head>"));
  const code = head.match(/<script>([\s\S]*?)<\/script>/)[1];
  const attrs = {};
  const localStorage = {
    getItem(k) {
      if (throws) throw new Error("SecurityError");
      return k === "iad-theme" ? stored : null;
    },
  };
  const window = hasMatchMedia ? { matchMedia: (q) => ({ matches: q === "(prefers-color-scheme: dark)" && prefersDark }) } : {};
  const document = { documentElement: { setAttribute: (k, v) => { attrs[k] = v; } } };
  vm.runInNewContext(code, { window, document, localStorage });
  return attrs["data-theme"];
}

test("theme script: saved choice wins, else OS preference; storage errors are survivable", () => {
  const head = HTML.slice(0, HTML.indexOf("</head>"));
  assert.ok(head.indexOf("<script>") < head.indexOf("<style>"), "theme is set before the CSS is parsed");
  assert.equal(runThemeScript({ stored: "dark" }), "dark");
  assert.equal(runThemeScript({ stored: "light", prefersDark: true }), "light");
  assert.equal(runThemeScript({ stored: null, prefersDark: true }), "dark");
  assert.equal(runThemeScript({ stored: null, prefersDark: false }), "light");
  assert.equal(runThemeScript({ stored: "purple", prefersDark: true }), "dark", "invalid saved value is ignored");
  assert.equal(runThemeScript({ throws: true, prefersDark: true }), "dark");
  assert.equal(runThemeScript({ stored: null, hasMatchMedia: false }), "light");
});
