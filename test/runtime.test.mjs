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
import { inline as inlineBuild } from "../skills/interactive-architecture-doc/scripts/lib/markup.mjs";

const DOC = JSON.parse(readFileSync(join(ROOT, "test/fixtures/walkthrough.en.json"), "utf8"));
const HTML = renderHtml(DOC).html;

// Values created inside the vm context have that context's prototypes; compare as plain JSON.
const plain = (v) => JSON.parse(JSON.stringify(v));

// ---- pure helpers -------------------------------------------------------------

const PURE_RE = /\/\/ ---- BEGIN pure helpers[^\n]*\n([\s\S]*?)\/\/ ---- END pure helpers/g;

function loadHelpers(ui = UI.en) {
  const blocks = [...HTML.matchAll(PURE_RE)].map((m) => m[1]);
  assert.equal(blocks.length, 1, "the runtime has one pure block");
  const ctx = vm.createContext({ UI: ui });
  vm.runInContext(blocks[0], ctx);
  return ctx;
}
const EDGES = Object.fromEntries(DOC.edges.map((e) => [e.id, e]));
const keys = (m) => Object.keys(m).sort();

test("t(): fills known placeholders, keeps unknown ones", () => {
  const h = loadHelpers({ a: "Step {step}/{total} {other}", b: "plain" });
  assert.equal(h.t("a", { step: 2, total: 5 }), "Step 2/5 {other}");
  assert.equal(h.t("a"), "Step {step}/{total} {other}");
  assert.equal(h.t("b", { step: 1 }), "plain");
  assert.equal(h.t("a", Object.create({ step: 9 })), "Step {step}/{total} {other}", "inherited names are not parameters");
  for (const lang of ["en", "ko"]) assert.ok(loadHelpers(UI[lang]).t("counter_step", { step: 1, total: 3 }).includes("1 / 3"), lang);
});

test("inline(): same output as the build-time markup.inline (apostrophe entity aside)", () => {
  const h = loadHelpers();
  for (const s of ["a <b> & \"q\"", "**bold** and `x < y`", "`**not bold**`", "<script>alert(1)</script>", "*one* _two_ [link](x)", "x's"]) {
    assert.equal(h.inline(s), inlineBuild(s).replace(/&#39;/g, "&apos;"), s);
  }
});

test("focusSets: step -1 lights the whole scenario; a step lights its edges, their ends and its nodes", () => {
  const h = loadHelpers();
  const steps = DOC.scenarios[1].steps;
  const all = plain(h.focusSets(steps, -1, EDGES));
  assert.deepEqual(keys(all.curE), ["back", "fwd", "up"]);
  assert.deepEqual(keys(all.curN), ["browser", "gateway", "receiver"]);
  assert.deepEqual(all.curE, all.allE);
  const one = plain(h.focusSets(steps, 1, EDGES));
  assert.deepEqual(keys(one.curE), []);
  assert.deepEqual(keys(one.curN), ["receiver"]);
  const two = plain(h.focusSets(DOC.scenarios[0].steps, 4, EDGES));
  assert.deepEqual(keys(two.curE), ["answer", "ask"]);
  assert.deepEqual(keys(two.curN), ["model", "parser"]);
});

test("gaugeState: empty until set, then carries forward until changed", () => {
  const h = loadHelpers();
  const steps = DOC.scenarios[0].steps;
  const label = (j) => plain(h.gaugeState(DOC.gauges, steps, j))["disk-use"];
  assert.deepEqual(label(-1), { value: 0, label: "empty" });
  assert.deepEqual(label(1), { value: 0, label: "empty" });
  assert.deepEqual(label(2), { value: 0.5, label: "2MB" });
  assert.deepEqual(label(4), { value: 0.5, label: "2MB" }, "carried forward");
  assert.deepEqual(label(5), { value: 0, label: "0B · deleted" });
  assert.deepEqual(label(6), { value: 0, label: "0B · deleted" });
  // unknown gauge ids in a step are ignored at runtime
  assert.deepEqual(plain(h.gaugeState([], steps, 6)), {});
  // a scenario's gauge_empty overrides the empty label only
  const over = (j) => plain(h.gaugeState(DOC.gauges, steps, j, { "disk-use": "0B · nothing written" }))["disk-use"];
  assert.deepEqual(over(-1), { value: 0, label: "0B · nothing written" });
  assert.deepEqual(over(2), { value: 0.5, label: "2MB" });
});

test("tokenAt: the distance is split across the step's paths in order", () => {
  const h = loadHelpers();
  assert.deepEqual(plain(h.tokenAt([100, 50], 0)), { i: 0, at: 0 });
  assert.deepEqual(plain(h.tokenAt([100, 50], 100)), { i: 0, at: 100 });
  assert.deepEqual(plain(h.tokenAt([100, 50], 120)), { i: 1, at: 20 });
  assert.deepEqual(plain(h.tokenAt([100, 50], 999)), { i: 1, at: 50 }, "clamped to the end");
  assert.equal(h.easeInOut(0), 0);
  assert.equal(h.easeInOut(1), 1);
  assert.equal(h.easeInOut(0.5), 0.5);
});

test("file names: unsafe characters removed, whitespace dashed, trimmed, capped at 80", () => {
  const h = loadHelpers();
  assert.equal(h.sanitizeFilePart('a<b>c:"d"/e\\f|g?h*i'), "abcdefghi");
  assert.equal(h.sanitizeFilePart("  Upload   pipeline  "), "Upload-pipeline");
  assert.equal(h.sanitizeFilePart("..-x-.."), "x");
  assert.equal(h.sanitizeFilePart("x".repeat(200)).length, 80);
});

test("export scale: 2x, capped by canvas area and side", () => {
  const h = loadHelpers();
  assert.equal(h.exportScale(1000, 1000), 2);
  const area = h.exportScale(4000, 4000);
  assert.ok(Math.abs(4000 * 4000 * area * area - 16000000) < 1, "area cap ~16MP");
  assert.equal(h.exportScale(100, 20000), 16384 / 20000, "side cap");
});

// ---- self-check judging -------------------------------------------------------

const expected = () => ({ curE: { up: true }, curN: { browser: true, gateway: true }, badges: 7, gauges: { "disk-use": "empty" }, markers: 0 });
const goodObs = (o = {}) => ({ curE: { up: true }, curN: { gateway: true, browser: true }, narration: "Send the file", badges: 7, gauges: { "disk-use": "empty" }, markers: 0, overflow: false, ...o });
const judge = (h, obs) => {
  const out = [];
  h.judgeStep("upload", 0, expected(), obs, out);
  return plain(out);
};

test("self-check: a healthy step has no failures", () => {
  assert.deepEqual(judge(loadHelpers(), goodObs()), []);
});

test("self-check: each broken observation becomes a failure tagged with scenario, step and check", () => {
  const h = loadHelpers();
  const checks = (o) => judge(h, goodObs(o)).map((f) => f.check);
  assert.deepEqual(checks({ curE: {} }), ["cur-edges"]);
  assert.deepEqual(checks({ curN: { browser: true } }), ["cur-nodes"]);
  assert.deepEqual(checks({ narration: "  " }), ["narration"]);
  assert.deepEqual(checks({ badges: 6 }), ["badges"]);
  assert.deepEqual(checks({ gauges: { "disk-use": "2MB" } }), ["gauge"]);
  assert.deepEqual(checks({ markers: 1 }), ["markers"]);
  assert.deepEqual(checks({ overflow: true }), ["overflow"]);
  const f = judge(h, goodObs({ curE: {} }))[0];
  assert.equal(f.scenario, "upload");
  assert.equal(f.step, 0);
  assert.ok(f.detail.length > 0);
});

test("self-check: runs only with #iad-selfcheck or window.iadSelfCheck(), and reports into a hidden <pre>", () => {
  assert.ok(HTML.includes('location.hash === "#iad-selfcheck"'));
  assert.ok(HTML.includes("window.iadSelfCheck = selfCheck"));
  assert.ok(/#iad-selfcheck-result\{[^}]*clip-path:inset\(50%\)/.test(HTML), "visually hidden, still in the DOM");
  assert.ok(HTML.includes('console.log("IAD_SELFCHECK " + json)'));
  assert.ok(HTML.includes("for (var j = -1; j < sc.steps.length; j++)"), "walks every step including the overview (-1)");
});

test("reduced motion: the token rests at the middle of the step instead of animating", () => {
  assert.ok(HTML.includes('matchMedia("(prefers-reduced-motion: reduce)")'));
  assert.ok(HTML.includes("if (reduce) { place(at(from + len * 0.5)); return; }"));
  assert.match(HTML, /@media \(prefers-reduced-motion:reduce\)\{\s*\.wt-map\.focus \.edge\.cur path\.ln\{animation:none;\}/);
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

test("keyboard: arrows work with focus on a map box; boxes and badges take Enter/Space; showing a box stops autoplay", () => {
  const handler = HTML.slice(HTML.indexOf('document.addEventListener("keydown"'));
  const guard = handler.slice(0, handler.indexOf("ArrowRight"));
  assert.ok(!guard.includes("closest"), "no early return for targets inside the SVG");
  assert.match(HTML, /b\.addEventListener\("keydown", function \(ev\) \{\s*if \(ev\.key === "Enter" \|\| ev\.key === " "\)/);
  assert.ok(HTML.includes("function showNode(id) { stopPlay();"));
});

test("export: .wt-map rules inside matching @media blocks are copied too", () => {
  assert.ok(HTML.includes("else if (rule.type === 4) { if (window.matchMedia(rule.media.mediaText).matches) collect(rule.cssRules); }"));
});

test("freeSpan: the token's route is trimmed so the chip never covers the source or target box", () => {
  const h = loadHelpers();
  const at = (d) => ({ x: d, y: 50 }); // a horizontal route from x 0 to x 300
  const A = { x: -100, y: 30, w: 100, h: 40 }; // source box ends at x 0
  const B = { x: 300, y: 30, w: 100, h: 40 }; // target box starts at x 300
  const [d0, d1] = plain(h.freeSpan(at, 300, 80, A, B));
  assert.ok(d0 >= 44 && d0 <= 48, `start ${d0}`);
  assert.ok(d1 <= 256 && d1 >= 252, `end ${d1}`);
  // too short for the chip: its middle
  assert.deepEqual(plain(h.freeSpan(at, 60, 80, A, { x: 60, y: 30, w: 100, h: 40 })), [30, 30]);
  // no boxes in the way: the whole route
  assert.deepEqual(plain(h.freeSpan(at, 300, 80, null, null)), [0, 300]);
});

test("scrollTarget: scrolls only when the step is out of view, centered and clamped", () => {
  const h = loadHelpers();
  assert.equal(h.scrollTarget(0, 400, 50, 200, 1000, 24), null, "already visible");
  assert.equal(h.scrollTarget(0, 400, 700, 800, 1000, 24), 550, "centered");
  assert.equal(h.scrollTarget(500, 400, 10, 60, 1000, 24), 0, "clamped at the start");
  assert.equal(h.scrollTarget(0, 400, 1300, 1390, 1000, 24), 1000, "clamped at the end");
  assert.equal(h.scrollTarget(0, 400, 600, 1200, 1000, 24), 576, "wider than the view: its start");
});

test("narrow screens: the map follows the step (smooth unless reduced motion) and fades its clipped edges", () => {
  assert.ok(HTML.includes('<div class="map-wrap" id="mapWrap">\n<div class="diagram" id="diagram">'));
  assert.ok(HTML.includes('behavior: reduce || instant ? "auto" : "smooth"'));
  assert.ok(HTML.includes("if (step >= 0) followStep(f.curE, f.curN);"));
  assert.match(HTML, /\.map-wrap\.fade-l::before,\.map-wrap\.fade-r::after\{opacity:1;\}/);
  assert.ok(HTML.includes('diagramEl.addEventListener("scroll", updateFade, { passive: true });'));
});

test("scroll reset: the full path, a new scenario and the end of the self-check show the start of the map", () => {
  assert.ok(HTML.includes("else scrollMapTo(0); // the full path (and a new scenario) starts at the start of the map"));
  assert.ok(HTML.includes("scrollMapTo(0, true); // leave the map at its start"));
  // pickScenario renders step -1, which takes the reset branch
  const pick = HTML.slice(HTML.indexOf("function pickScenario(i)"), HTML.indexOf("function render()"));
  assert.ok(pick.includes("cur = i; step = -1;") && pick.includes("render();"));
});
