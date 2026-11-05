import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { validate, RULES, formatIssue } from "../skills/interactive-architecture-doc/scripts/lib/validate.mjs";
import { inline, escapeHtml, embedJson, hasPlaceholder } from "../skills/interactive-architecture-doc/scripts/lib/markup.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SKILL = join(ROOT, "skills/interactive-architecture-doc");
const EXAMPLES = join(SKILL, "examples");
const CLI = join(SKILL, "scripts/iad.mjs");

const clone = (v) => JSON.parse(JSON.stringify(v));

const FIXTURE = join(ROOT, "test/fixtures/walkthrough.en.json");
// A small, fully valid v3 walkthrough used as the base for every failing fixture.
const BASE = JSON.parse(readFileSync(FIXTURE, "utf8"));
const step = (d, s, i) => d.scenarios[s].steps[i];

// One failing fixture per rule code: [code, mutate(doc)].
const FIXTURES = [
  ["E_TYPE", (d) => { d.nodes = "seven"; }],
  ["E_TYPE", (d) => { d.nodes[0].lane = 1.5; }],
  ["E_TYPE", (d) => { d.nodes[0].row = -1; }],
  ["E_TYPE", (d) => { d.nodes[0].span = 0; }],
  ["E_TYPE", (d) => { d.nodes[0].sub = ["a", "b", "c", "d"]; }],
  ["E_TYPE", (d) => { d.nodes[0].w = 0; }],
  ["E_REQUIRED", (d) => { delete d.meta.title; }],
  ["E_REQUIRED", (d) => { delete step(d, 0, 0).token; }],
  ["E_EMPTY", (d) => { d.nodes = []; }],
  ["E_EMPTY", (d) => { step(d, 0, 0).what = "   "; }],
  ["E_UNKNOWN_KEY", (d) => { d.nodes[0].titel = "typo"; }],
  ["E_UNKNOWN_KEY", (d) => { d.extra = true; }],
  ["E_UNKNOWN_KEY", (d) => { d.meta.subtitle = "v2 field"; }],
  // Object.prototype names are unknown keys too (no `in` lookups through the prototype chain)
  ["E_UNKNOWN_KEY", (d) => { d.nodes[0].constructor = "x"; }],
  ["E_UNKNOWN_KEY", (d) => { d.meta.toString = "x"; }],
  ["E_UNKNOWN_KEY", (d) => { d.tldr = JSON.parse('{"__proto__":{"points":[]},"points":["p"]}'); }],
  ["E_UNKNOWN_KIND", (d) => { d.nodes[0].kind = "decision"; }],
  ["E_UNKNOWN_KIND", (d) => { d.legend.nodes.new = "v2 kind"; }],
  ["E_LANG", (d) => { d.meta.lang = "ja"; }],
  ["E_ENUM", (d) => { d.edges[0].kind = "bytes"; }],
  ["E_ENUM", (d) => { step(d, 0, 0).token.kind = "warn"; }],
  ["E_ENUM", (d) => { d.groups[1].tone = "loud"; }],
  ["E_ENUM", (d) => { d.edges[0].route = { from_side: "north" }; }],
  ["E_ID_FORMAT", (d) => { d.scenarios[0].id = "Not_Kebab"; }],
  ["E_ID_FORMAT", (d) => { d.nodes[5].id = "Model API"; d.edges[6].to = "Model API"; d.edges[7].from = "Model API"; }],
  ["E_ID_DUPLICATE", (d) => { d.scenarios[1].id = "upload"; }],
  ["E_ID_DUPLICATE", (d) => { d.edges[1].id = "up"; }],
  ["E_LEGEND_MISSING_KIND", (d) => { delete d.legend.nodes.dep; }],
  ["E_WHY_EMPTY", (d) => { d.considerations.items[0].why = " "; }],
  ["E_V2_WALKTHROUGH", (d) => { d.steps = [{ label: "One" }]; }],
  ["E_V2_WALKTHROUGH", (d) => { d.board = []; }],
  ["E_EDGE_UNKNOWN", (d) => { step(d, 0, 0).edges = ["nope"]; }],
  ["E_STEP_EMPTY", (d) => { delete step(d, 1, 1).nodes; }],
  ["E_SCENARIO_LIMIT", (d) => { for (let i = 0; i < 5; i++) d.scenarios.push({ ...clone(d.scenarios[1]), id: `extra-${i}` }); }],
  ["E_GAUGE_UNKNOWN", (d) => { step(d, 0, 2).gauges = { nope: { value: 0.5, label: "x" } }; }],
  ["E_GAUGE_UNKNOWN", (d) => { d.scenarios[1].gauge_empty = { nope: "x" }; }],
  ["E_TYPE", (d) => { d.nodes[3].lines = [1]; }],
  ["E_UNKNOWN_KEY", (d) => { d.nodes[3].lines = [{ text: "x", dim: true }]; }],
  ["E_GAUGE_RANGE", (d) => { step(d, 0, 2).gauges["disk-use"].value = 1.5; }],
  ["E_GAUGE_RANGE", (d) => { step(d, 0, 2).gauges["disk-use"].value = -0.1; }],
  ["E_GAUGE_DUP_NODE", (d) => { d.gauges.push({ id: "disk-two", node: "disk" }); step(d, 0, 3).gauges = { "disk-two": { value: 1, label: "x" } }; }],
  ["E_POS_PARTIAL", (d) => { d.nodes[0].x = 10; }],
  ["E_POS_PARTIAL", (d) => { d.nodes[0].y = 10; }],
  ["E_LAYOUT_OVERLAP", (d) => { d.nodes[1].x = 50; d.nodes[1].y = 80; }],
  ["E_LAYOUT_OVERLAP", (d) => { d.nodes[1].lane = 0; d.nodes[1].row = 0; d.nodes[0].lane = 0; d.nodes[0].row = 0; }],
  ["E_LAYOUT_OVERLAP", (d) => { d.nodes.forEach((n, i) => { n.lane = i; }); d.nodes[1].group = "external"; }],
  ["E_ROUTE_PATH", (d) => { d.edges[0].route = { d: "m10 10 l20 20" }; }],
  ["E_ROUTE_PATH", (d) => { d.edges[0].route = { d: "M10 10 A5 5 0 0 1 20 20" }; }],
  ["E_ROUTE_PATH", (d) => { d.edges[0].route = { d: "M" }; }],
  ["E_ROUTE_PATH", (d) => { d.edges[0].route = { d: "M0 0 L10" }; }],
  ["E_ROUTE_PATH", (d) => { d.edges[0].route = { d: "M0 0 LEE 5 5" }; }],
  ["E_ROUTE_PATH", (d) => { d.edges[0].route = { d: "M0 0 L1e400 0" }; }],
  ["E_EDGE_SELF", (d) => { d.edges[0].to = "browser"; }],
  ["E_TYPE", (d) => { d.nodes[0].lane = 4294967296; }],
  ["E_TYPE", (d) => { d.nodes[0].rows = 65; }],
  ["E_TYPE", (d) => { d.nodes[0].x = 1e7; d.nodes[0].y = 0; }],
  ["E_TYPE", (d) => { d.nodes[0].w = 1e6; }],
  ["E_TYPE", (d) => { d.edges[0].route = { via: [[0, -1e9]] }; }],
  ["E_TABLE_SHAPE", (d) => { d.tables[0].rows[0].push("extra"); }],
  ["E_NODE_UNKNOWN", (d) => { d.edges[0].to = "ghost"; }],
  ["E_NODE_UNKNOWN", (d) => { step(d, 1, 1).markers[0].node = "ghost"; }],
  ["E_NODE_UNKNOWN", (d) => { d.scenarios[1].skip[0].node = "ghost"; }],
  ["E_NODE_UNKNOWN", (d) => { d.gauges[0].node = "ghost"; }],
  ["E_GROUP_UNKNOWN", (d) => { d.nodes[0].group = "nope"; }],
  ["W_EDGE_UNUSED", (d) => { d.edges.push({ id: "spare", from: "browser", to: "receiver", kind: "ctrl", route: { via: [[200, 40], [530, 40]] } }); }],
  ["W_NODE_ISOLATED", (d) => { d.nodes.push({ id: "lonely", kind: "tool", title: "Lonely", facts: ["x"], x: 40, y: 260 }); d.legend.nodes.tool = "Tool"; }],
  ["W_EDGE_CROSSES_NODE", (d) => { d.edges.push({ id: "skip", from: "browser", to: "receiver", kind: "ctrl", route: { via: [[310, 102]] } }); step(d, 0, 0).edges.push("skip"); }],
  ["W_FACTS_MISSING", (d) => { delete d.nodes[0].facts; }],
  ["W_POS_IGNORED", (d) => { Object.assign(d.nodes[0], { x: 40, y: 400, lane: 0 }); }],
  ["W_GAUGE_UNUSED", (d) => { delete step(d, 0, 2).gauges; delete step(d, 0, 5).gauges; }],
  ["W_BADGE_CROWDED", (d) => { d.scenarios[0].steps = Array.from({ length: 20 }, (_, i) => ({ ...step(d, 0, 1), title: `s${i}` })); delete d.gauges; }],
  ["W_PLACEHOLDER", (d) => { step(d, 0, 0).what = "[what moves here]"; }],
  ["W_PLACEHOLDER", (d) => { d.tldr.points[0] = "TODO fill in"; }],
  ["W_TEXT_LONG", (d) => { d.nodes[0].title = "A component title that is far too long for any lane"; }],
];

// Overview style (`meta.style: "overview"`): a small valid document and its own fixtures.
const OVERVIEW_BASE = {
  meta: { style: "overview", title: "Base", lang: "en" },
  layers: [
    { nodes: [{ id: "client", title: "CLIENT", code: "app", span: 3, tone: "outer" }] },
    { group: "sys", nodes: [{ id: "api", title: "API", code: "POST /x", span: 3 }] },
    { group: "sys", nodes: [{ id: "a", title: "A", rows: ["a()"] }, { id: "b", title: "B", rows: ["b()"] }] },
    { boundary: "EXTERNAL", nodes: [{ id: "db", col: 2, title: "DB", code: "sql", tone: "outer" }] },
  ],
  groups: [{ id: "sys", label: "SYSTEM" }],
  edges: [
    { from: "client", to: "api", label: "req" },
    { from: "api", to: "client", label: "res", label_by_path: { pa: "200" } },
    { from: "api", to: "a", label: "a" },
    { from: "api", to: "b", label: "b" },
    { from: "b", to: "db", label: "read" },
  ],
  paths: [
    { id: "pa", label: "Path A", nodes: ["client", "api", "a"], caption: "**A** path" },
    { id: "pb", label: "Path B", nodes: ["client", "api", "b", "db"] },
  ],
  caption: "Overview of `Base`.",
};
const ov = (code, mutate) => [code, mutate, OVERVIEW_BASE];

const OVERVIEW_FIXTURES = [
  ov("E_STYLE", (d) => { d.meta.style = "poster"; }),
  ov("E_REQUIRED", (d) => { delete d.layers; }),
  ov("E_UNKNOWN_KEY", (d) => { d.layers[0].nodes[0].kind = "client"; }),
  ov("E_UNKNOWN_KEY", (d) => { d.board = []; }),
  ov("E_ENUM", (d) => { d.layers[1].nodes[0].tone = "loud"; }),
  ov("E_LANG", (d) => { d.meta.lang = "ja"; }),
  ov("E_ID_FORMAT", (d) => { d.layers[1].nodes[0].id = "Api"; }),
  ov("E_ID_FORMAT", (d) => { d.paths[0].id = "Path A"; delete d.edges[1].label_by_path; }),
  ov("E_ID_DUPLICATE", (d) => { d.layers[2].nodes[1].id = "a"; }),
  ov("E_ID_DUPLICATE", (d) => { d.groups.push({ id: "sys", label: "again" }); }),
  ov("E_NODE_UNKNOWN", (d) => { d.edges[0].to = "nope"; }),
  ov("E_NODE_UNKNOWN", (d) => { d.paths[0].nodes.push("ghost"); }),
  ov("E_PATH_UNKNOWN", (d) => { d.edges[1].label_by_path.pz = "x"; }),
  ov("E_GROUP_UNKNOWN", (d) => { d.layers[1].group = "other"; }),
  ov("E_GROUP_UNKNOWN", (d) => { delete d.layers[2].group; d.layers[3].group = "sys"; }),
  ov("E_LAYOUT", (d) => { d.meta.columns = 5; }),
  ov("E_LAYOUT", (d) => { d.layers[2].nodes[1].col = 1; }),
  ov("E_LAYOUT", (d) => { d.layers[1].nodes[0].span = 4; }),
  ov("E_LAYOUT", (d) => { d.layers[0].boundary = "TOP"; }),
  ov("E_LAYOUT", (d) => { d.layers[2].nodes[0].code = "x"; }),
  ov("E_LAYOUT", (d) => { d.layers[2].nodes[0].tone = "outer"; }),
  ov("E_EDGE_LAYER", (d) => { d.edges.push({ from: "client", to: "a" }); }),
  ov("E_EDGE_LAYER", (d) => { d.edges.push({ from: "a", to: "b" }); }),
  ov("E_EDGE_ALIGN", (d) => { d.edges.push({ from: "a", to: "db" }); }),
  ov("W_TEXT_LONG", (d) => { d.layers[2].nodes[0].title = "A component name that is far too long for one column"; }),
  ov("W_TEXT_LONG", (d) => { d.layers[2].nodes[0].rows = ["a_really_long_function_name_for_this_card()"]; }),
  ov("W_TEXT_LONG", (d) => { d.edges[0].label = "a very long request label that runs into the response"; }),
  ov("E_PATH_DISCONNECTED", (d) => { d.paths[0].nodes.push("db"); }),
  ov("E_REQUIRED", (d) => { delete d.edges[1].label; }),
  ov("E_ID_FORMAT", (d) => { d.paths[1].id = "iad-selfcheck"; }),
  ov("W_TEXT_LONG", (d) => { d.edges[2].label = "a label far too wide for the first column"; d.meta.columns = 4; d.layers[0].nodes[0].span = 4; d.layers[1].nodes[0].span = 4; }),
  ov("W_PLACEHOLDER", (d) => { d.caption = "[What the diagram shows]"; }),
];

test("base fixture is valid with no warnings", () => {
  const r = validate(clone(BASE));
  assert.deepEqual(r, { ok: true, errors: [], warnings: [] });
});

test("overview base fixture is valid with no warnings", () => {
  const r = validate(clone(OVERVIEW_BASE));
  assert.deepEqual(r, { ok: true, errors: [], warnings: [] });
});

test("overview: a huge meta.columns is one E_LAYOUT error, quickly, without throwing", () => {
  const d = clone(OVERVIEW_BASE);
  d.meta.columns = 2147483648;
  d.layers[1].nodes[0].span = 20000000;
  const started = Date.now();
  const r = validate(d);
  assert.ok(Date.now() - started < 500, "bounded work");
  assert.deepEqual(r.errors.map((e) => e.code), ["E_LAYOUT"]);
});

test("meta.style walkthrough is the default; an unknown style is E_STYLE for both formats", () => {
  const d = clone(BASE);
  d.meta.style = "walkthrough";
  assert.deepEqual(validate(d), { ok: true, errors: [], warnings: [] });
  d.meta.style = "poster";
  assert.deepEqual(validate(d).errors.map((e) => e.code), ["E_STYLE"]);
});

for (const [code, mutate, base = BASE] of [...FIXTURES, ...OVERVIEW_FIXTURES]) {
  test(`fixture triggers ${code}: ${mutate.toString().slice(8, 70)}`, () => {
    const doc = clone(base);
    mutate(doc);
    const r = validate(doc);
    const list = code.startsWith("E_") ? r.errors : r.warnings;
    assert.ok(
      list.some((i) => i.code === code),
      `expected ${code}, got ${JSON.stringify([...r.errors, ...r.warnings])}`
    );
    assert.equal(r.ok, !code.startsWith("E_"));
    for (const i of [...r.errors, ...r.warnings]) assert.match(i.path, /^(\/.*)?$/);
  });
}

test("every rule code has at least one failing fixture", () => {
  const covered = new Set([...FIXTURES, ...OVERVIEW_FIXTURES].map(([c]) => c));
  const missing = RULES.map((r) => r.code).filter((c) => !covered.has(c));
  assert.deepEqual(missing, []);
});

test("RULES and the rule tables in references/format.md + format-overview.md match", () => {
  const md = ["format.md", "format-overview.md"].map((f) => readFileSync(join(SKILL, "references", f), "utf8")).join("\n");
  const rows = [...md.matchAll(/^\|\s*`([EW]_[A-Z0-9_]+)`\s*\|\s*(error|warning)\s*\|/gm)].map((m) => `${m[1]}:${m[2]}`);
  const rules = RULES.map((r) => `${r.code}:${r.level}`);
  assert.deepEqual([...rows].sort(), [...rules].sort());
  assert.equal(new Set(rows).size, rows.length, "a rule is listed in both format files");
});

test("rule codes are prefixed by their level", () => {
  for (const r of RULES) assert.equal(r.code[0], r.level === "error" ? "E" : "W", r.code);
});

test("JSON pointers escape ~ and /", () => {
  const doc = clone(BASE);
  doc.legend.nodes["a/b~c"] = "x";
  const r = validate(doc);
  assert.ok(r.errors.some((e) => e.path === "/legend/nodes/a~1b~0c" && e.code === "E_UNKNOWN_KIND"), JSON.stringify(r.errors));
});

test("required keys inherited through __proto__ do not count as present", () => {
  const doc = clone(BASE);
  doc.meta = JSON.parse('{"__proto__":{"title":"T"},"lang":"en"}');
  const r = validate(doc);
  assert.ok(r.errors.some((e) => e.path === "/meta/title" && e.code === "E_REQUIRED"), JSON.stringify(r.errors));
  assert.ok(r.errors.some((e) => e.path === "/meta/__proto__" && e.code === "E_UNKNOWN_KEY"));
});

test("messages escape control characters in echoed keys and values", () => {
  const ESC = "\u001b[31m";
  const doc = clone(BASE);
  doc.nodes[0][ESC] = "x";
  doc.nodes[0].kind = ESC + "red";
  const r = validate(doc);
  assert.equal(r.ok, false);
  const lines = r.errors.map(formatIssue);
  assert.ok(lines.length >= 2);
  for (const issue of r.errors) assert.ok(!issue.message.includes("\u001b"), issue.message);
  for (const line of lines) assert.ok(!/[\u0000-\u001f\u007f]/.test(line), JSON.stringify(line));
  assert.ok(lines.some((l) => l.includes("E_UNKNOWN_KEY") && l.includes("\\u001b[31m")), lines.join("\n"));
});

test("placeholder detection is linear on long adversarial input", () => {
  const inputs = [
    "[" + "a".repeat(50000),
    "[" + "a ".repeat(25000),
    "x[".repeat(25000),
    "[ ".repeat(25000),
    "[" + " ".repeat(50000) + "...",
    ("[" + "a".repeat(199)).repeat(250),
  ];
  for (const s of inputs) {
    const t0 = process.hrtime.bigint();
    hasPlaceholder(s);
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    assert.ok(ms < 200, `${ms.toFixed(1)}ms for ${JSON.stringify(s.slice(0, 12))}... (${s.length} chars)`);
  }
});

test("non-object root is a type error", () => {
  const r = validate([]);
  assert.equal(r.ok, false);
  assert.equal(r.errors[0].code, "E_TYPE");
  assert.equal(r.errors[0].path, "");
});

test("all examples validate with no errors and no warnings; walkthrough examples are v3", () => {
  const files = readdirSync(EXAMPLES).filter((f) => f.endsWith(".json"));
  assert.ok(files.some((f) => f.endsWith(".en.json")) && files.some((f) => f.endsWith(".ko.json")));
  for (const f of files) {
    const doc = JSON.parse(readFileSync(join(EXAMPLES, f), "utf8"));
    assert.ok(!("steps" in doc) && !("board" in doc), `${f} is a v2 document`);
    const r = validate(doc);
    assert.deepEqual({ f, errors: r.errors, warnings: r.warnings }, { f, errors: [], warnings: [] });
  }
  // every example comes in an en/ko pair
  const stems = new Set(files.map((f) => f.replace(/\.(en|ko)\.json$/, "")));
  for (const s of stems) assert.ok(files.includes(`${s}.en.json`) && files.includes(`${s}.ko.json`), s);
});

test("v2 walkthrough IR: one E_V2_WALKTHROUGH, nothing else, pointing at the migration note", () => {
  const r = validate(JSON.parse(readFileSync(join(ROOT, "test/fixtures/v2-walkthrough.en.json"), "utf8")));
  assert.equal(r.ok, false);
  assert.deepEqual(r.errors.map((e) => [e.code, e.path]), [["E_V2_WALKTHROUGH", "/steps"]]);
  assert.match(r.errors[0].message, /migration-v2\.md/);
  assert.deepEqual(r.warnings, []);
  // even with other problems on top
  assert.deepEqual(validate({ meta: {}, board: [], bogus: 1 }).errors.map((e) => e.code), ["E_V2_WALKTHROUGH"]);
});

test("v3: removed v2 kinds and fields are rejected", () => {
  for (const kind of ["decision", "existing", "new"]) {
    const d = clone(BASE);
    d.nodes[0].kind = kind;
    assert.ok(validate(d).errors.some((e) => e.code === "E_UNKNOWN_KIND" && e.path === "/nodes/0/kind"), kind);
  }
  const d = clone(BASE);
  d.meta.entry_request = "x";
  assert.deepEqual(validate(d).errors.map((e) => e.code), ["E_UNKNOWN_KEY"]);
});

test("walkthrough: lines may be {text, muted}; scenarios may override the gauge's empty label", () => {
  const d = clone(BASE);
  d.nodes[3].lines = ["/tmp/uploads/", { text: "0600", muted: true }, { text: "plain" }];
  d.scenarios[1].gauge_empty = { "disk-use": "0B · nothing written" };
  assert.deepEqual(validate(d), { ok: true, errors: [], warnings: [] });
});

test("placeholders: walkthroughs treat [CONSTANT] tokens (and `code` in markup fields) as content; overview keeps the strict check", () => {
  const d = clone(BASE);
  d.nodes[2].sub = ["masks to [PHONE_1]"];
  d.nodes[2].mono = "delta → [DONE]";
  step(d, 0, 0).what = "sends `[some words]` literally";
  assert.deepEqual(validate(d).warnings, []);
  // plain-text fields show backticks as typed, so a placeholder inside them still counts
  d.nodes[2].title = "see `[some words]`";
  assert.deepEqual(validate(d).warnings.map((w) => w.path), ["/nodes/2/title"]);
  d.nodes[2].title = "Receiver";
  step(d, 0, 0).what = "[what moves here]";
  assert.deepEqual(validate(d).warnings.map((w) => w.code), ["W_PLACEHOLDER"]);
  d.nodes[2].sub = ["[Component 3]"];
  d.nodes[2].title = "Receiver";
  assert.ok(validate(d).warnings.some((w) => w.path === "/nodes/2/sub/0"));
  // default (overview) call: unchanged
  for (const s of ["[CLIENT]", "[PHONE_1]", "`[x y]`"]) assert.equal(hasPlaceholder(s), true, s);
  for (const s of ["[PHONE_1]", "[DONE]"]) assert.equal(hasPlaceholder(s, { constants: true }), false, s);
  assert.equal(hasPlaceholder("`[x y]`", { constants: true }), true, "code spans count unless codeSpans");
  assert.equal(hasPlaceholder("`[x y]`", { constants: true, codeSpans: true }), false);
  for (const s of ["[Document title]", "[문서 제목]", "a [...] b", "TODO", "[CLIENT name]"]) assert.equal(hasPlaceholder(s, { constants: true, codeSpans: true }), true, s);
});

test("placeholder detection ignores code-like brackets", () => {
  for (const s of ['["a", "b"]', "[1, 2]", "items[i]", "hits[:10]", '"links": []', "x[0]"]) assert.equal(hasPlaceholder(s), false, s);
  for (const s of ["[문서 제목]", "[endpoint]", "a [...] b", "TODO", "POST /v1/[endpoint]"]) assert.equal(hasPlaceholder(s), true, s);
});

// ---- markup ----

test("inline: escapes everything, converts only **bold** and `code`", () => {
  assert.equal(inline("a <b> & \"q\" 'x'"), "a &lt;b&gt; &amp; &quot;q&quot; &#39;x&#39;");
  assert.equal(inline("**bold** and `x < y`"), '<b>bold</b> and <code class="ic">x &lt; y</code>');
  assert.equal(inline("`**not bold**`"), '<code class="ic">**not bold**</code>');
  assert.equal(inline("<script>alert(1)</script>"), "&lt;script&gt;alert(1)&lt;/script&gt;");
  assert.equal(inline("*one* _two_ [link](x)"), "*one* _two_ [link](x)");
});

test("escapeHtml leaves no markup", () => {
  assert.equal(escapeHtml("**b** `c` <i>"), "**b** `c` &lt;i&gt;");
});

test("embedJson escapes <, U+2028 and U+2029 and round-trips", () => {
  const ls = String.fromCharCode(0x2028);
  const ps = String.fromCharCode(0x2029);
  const v = { s: "</script><script>x" + ls + ps };
  const out = embedJson(v);
  assert.ok(!out.includes("<"));
  assert.ok(!out.includes(ls) && !out.includes(ps));
  assert.deepEqual(JSON.parse(out), v);
});

// ---- CLI ----

const run = (...args) => spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8" });

test("CLI: valid file exits 0", () => {
  const r = run("validate", FIXTURE);
  assert.equal(r.status, 0, r.stderr);
});

test("CLI: errors exit 1 with `pointer CODE message` lines, --json gives {ok, errors, warnings}", () => {
  const dir = mkdtempSync(join(tmpdir(), "iad-"));
  const doc = clone(BASE);
  doc.nodes[0].kind = "server";
  const file = join(dir, "invalid.json");
  writeFileSync(file, JSON.stringify(doc));
  try {
    const text = run("validate", file);
    assert.equal(text.status, 1);
    assert.match(text.stdout, /^\/nodes\/0\/kind E_UNKNOWN_KIND /m);
    const json = run("validate", file, "--json");
    assert.equal(json.status, 1);
    const parsed = JSON.parse(json.stdout);
    assert.deepEqual(Object.keys(parsed), ["ok", "errors", "warnings"]);
    assert.equal(parsed.ok, false);
    assert.equal(parsed.errors[0].code, "E_UNKNOWN_KIND");
    // terminal escapes in author keys never reach the terminal raw
    doc.nodes[0].kind = "client";
    doc.nodes[0]["\u001b[31m"] = 1;
    writeFileSync(file, JSON.stringify(doc));
    const esc = run("validate", file);
    assert.equal(esc.status, 1);
    assert.ok(!esc.stdout.includes("\u001b") && !esc.stderr.includes("\u001b"), esc.stdout);
    assert.match(esc.stdout, /E_UNKNOWN_KEY unknown key "\\u001b\[31m"/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("CLI: usage and parse errors exit 2", () => {
  assert.equal(run().status, 2);
  assert.equal(run("validate").status, 2);
  assert.equal(run("frobnicate", "x.json").status, 2);
  assert.equal(run("validate", join(ROOT, "does-not-exist.json")).status, 2);
  assert.equal(run("validate", join(ROOT, "package.json"), "--bogus").status, 2);
  assert.equal(run("validate", join(ROOT, "README.md")).status, 2);
});
