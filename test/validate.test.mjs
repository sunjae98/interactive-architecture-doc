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

// A small, fully valid document used as the base for every failing fixture.
const BASE = {
  meta: { title: "Base", lang: "en", entry_request: 'POST /x\n{ "q": "{{input}}" }' },
  steps: [{ label: "One" }, { label: "Two" }, { label: "Three" }],
  legend: { client: "Client", decision: "Decision", existing: "Existing", new: "New" },
  scenarios: [
    { id: "a", label: "A", input: "in a", steps: { 1: "a1", 2: "a2", 3: "a3" } },
    { id: "b", label: "B", input: "in b", steps: { 1: "b1", 2: "b2", 3: "b3" } },
  ],
  board: [
    { type: "node", kind: "client", step: 1, body: "start", entry: true, code: "POST /x" },
    { type: "arrow", label: "go" },
    {
      type: "internal",
      badge: "inside",
      children: [
        {
          type: "fork",
          children: [
            { type: "node", kind: "decision", step: 2, body: "choose", fan_hub: "hub" },
            {
              type: "columns",
              columns: [
                { title: "A", children: [{ type: "node", kind: "new", step: 2, body: "a", branches: ["a"], fan_target: "hub" }] },
                { title: "B", children: [{ type: "node", kind: "existing", step: 2, body: "b", branches: ["b"], fan_target: "hub" }] },
              ],
            },
          ],
        },
        { type: "external", badge: "outside", systems: [{ name: "Svc", items: [{ text: "GET /y", tag: "read" }] }] },
      ],
    },
    { type: "node", kind: "client", step: 3, body: "end", width: "wide", details: { items: [{ title: "t", body: "b", variant: "alt" }] } },
  ],
  tldr: { headline: "h", points: [{ title: "p", detail: "d" }] },
  callouts: [{ title: "c", body: "b" }],
  considerations: { title: "Decisions", items: [{ decision: "d", why: "because" }] },
  tool_examples: { title: "Tools", lead: "l", tools: [{ name: "fn", code: "{}", note: "n" }] },
};

const fork = (d) => d.board[2].children[0];
const hubNode = (d) => fork(d).children[0];
const colNode = (d, i) => fork(d).children[1].columns[i].children[0];

// One failing fixture per rule code: [code, mutate(doc)].
const FIXTURES = [
  ["E_TYPE", (d) => { d.steps = "seven"; }],
  ["E_TYPE", (d) => { d.board[0].step = 1.5; }],
  ["E_REQUIRED", (d) => { delete d.meta.title; }],
  ["E_REQUIRED", (d) => { delete d.board[1].type; }],
  ["E_EMPTY", (d) => { d.board = []; }],
  ["E_EMPTY", (d) => { d.board[0].body = "   "; }],
  ["E_UNKNOWN_KEY", (d) => { d.board[0].bdoy = "typo"; }],
  ["E_UNKNOWN_KEY", (d) => { d.extra = true; }],
  // Object.prototype names are unknown keys too (no `in` lookups through the prototype chain)
  ["E_UNKNOWN_KEY", (d) => { d.board[0].constructor = "x"; }],
  ["E_UNKNOWN_KEY", (d) => { d.meta.toString = "x"; }],
  ["E_UNKNOWN_KEY", (d) => { d.legend.hasOwnProperty = "x"; }],
  ["E_UNKNOWN_KEY", (d) => { d.board[1] = JSON.parse('{"type":"arrow","__proto__":{"label":"x"}}'); }],
  ["E_UNKNOWN_KEY", (d) => { d.tldr = JSON.parse('{"__proto__":{"headline":"h","points":[]},"headline":"h","points":[{"title":"p","detail":"d"}]}'); }],
  ["E_UNKNOWN_BLOCK", (d) => { d.board.push({ type: "diamond" }); }],
  ["E_UNKNOWN_KIND", (d) => { d.board[0].kind = "server"; }],
  ["E_LANG", (d) => { d.meta.lang = "ja"; }],
  ["E_ENUM", (d) => { d.board[3].width = "huge"; }],
  ["E_ENUM", (d) => { d.board[3].details.items[0].variant = "loud"; }],
  ["E_STEP_RANGE", (d) => { d.board.push({ type: "node", kind: "client", step: 0, body: "z" }); }],
  ["E_STEP_RANGE", (d) => { d.board[3].step = 4; }],
  ["E_STEP_NO_NODE", (d) => { d.steps.push({ label: "Four" }); }],
  ["E_BRANCH_UNKNOWN", (d) => { colNode(d, 0).branches = ["nope"]; }],
  ["E_ID_FORMAT", (d) => { d.scenarios[0].id = "Not_Kebab"; colNode(d, 0).branches = ["Not_Kebab"]; }],
  ["E_ID_FORMAT", (d) => { hubNode(d).fan_hub = "Hub!"; colNode(d, 0).fan_target = "Hub!"; colNode(d, 1).fan_target = "Hub!"; }],
  ["E_ID_DUPLICATE", (d) => { d.scenarios[1].id = "a"; }],
  ["E_ID_DUPLICATE", (d) => { colNode(d, 0).fan_hub = "hub"; }],
  ["E_SCENARIO_STEP_KEY", (d) => { d.scenarios[0].steps["9"] = "x"; }],
  ["E_SCENARIO_STEP_KEY", (d) => { d.scenarios[0].steps.one = "x"; }],
  ["E_FAN_HUB_NO_TARGET", (d) => { delete colNode(d, 0).fan_target; delete colNode(d, 1).fan_target; }],
  ["E_FAN_TARGET_NO_HUB", (d) => { colNode(d, 1).fan_target = "other"; }],
  ["E_FAN_TARGET_NO_HUB", (d) => {
    // hub in one fork, target in a different fork
    d.board.push({ type: "fork", children: [{ type: "node", kind: "new", step: 3, body: "x", fan_target: "hub" }] });
  }],
  // a node cannot satisfy its own fan wiring
  ["E_FAN_TARGET_NO_HUB", (d) => { hubNode(d).fan_target = "hub"; }],
  ["E_FAN_HUB_NO_TARGET", (d) => { delete colNode(d, 0).fan_target; delete colNode(d, 1).fan_target; hubNode(d).fan_target = "hub"; }],
  ["E_FAN_OUTSIDE_FORK", (d) => { d.board[0].fan_hub = "solo"; }],
  ["E_LEGEND_MISSING_KIND", (d) => { delete d.legend.decision; }],
  ["E_WHY_EMPTY", (d) => { d.considerations.items[0].why = " "; }],
  ["E_ENTRY", (d) => { d.board[3].entry = true; }],
  ["E_ENTRY", (d) => { delete d.meta.entry_request; }],
  ["W_SCENARIO_NO_ACTIVE", (d) => { d.board[3].branches = ["a"]; }],
  ["W_SCENARIO_STEP_MISSING", (d) => { delete d.scenarios[1].steps["2"]; }],
  ["W_PLACEHOLDER", (d) => { d.board[0].body = "[client request description]"; }],
  ["W_PLACEHOLDER", (d) => { d.callouts[0].body = "TODO fill in"; }],
  ["W_PLACEHOLDER", (d) => { d.tldr.headline = "see [...]"; }],
  ["W_ENTRY_NO_INPUT", (d) => { d.meta.entry_request = "POST /x"; }],
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
  ov("W_PATH_DISCONNECTED", (d) => { d.paths[0].nodes.push("db"); }),
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
  const rows = [...md.matchAll(/^\|\s*`([EW]_[A-Z_]+)`\s*\|\s*(error|warning)\s*\|/gm)].map((m) => `${m[1]}:${m[2]}`);
  const rules = RULES.map((r) => `${r.code}:${r.level}`);
  assert.deepEqual([...rows].sort(), [...rules].sort());
  assert.equal(new Set(rows).size, rows.length, "a rule is listed in both format files");
});

test("rule codes are prefixed by their level", () => {
  for (const r of RULES) assert.equal(r.code[0], r.level === "error" ? "E" : "W", r.code);
});

test("JSON pointers escape ~ and /", () => {
  const doc = clone(BASE);
  doc.scenarios[0].steps["a/b~c"] = "x";
  const r = validate(doc);
  assert.ok(r.errors.some((e) => e.path === "/scenarios/0/steps/a~1b~0c" && e.code === "E_SCENARIO_STEP_KEY"));
});

test("required keys inherited through __proto__ do not count as present", () => {
  const doc = clone(BASE);
  doc.meta = JSON.parse('{"__proto__":{"title":"T"},"lang":"en","entry_request":"x {{input}}"}');
  const r = validate(doc);
  assert.ok(r.errors.some((e) => e.path === "/meta/title" && e.code === "E_REQUIRED"), JSON.stringify(r.errors));
  assert.ok(r.errors.some((e) => e.path === "/meta/__proto__" && e.code === "E_UNKNOWN_KEY"));
});

test("messages escape control characters in echoed keys and values", () => {
  const ESC = "\u001b[31m";
  const doc = clone(BASE);
  doc.board[0][ESC] = "x";
  doc.board[0].kind = ESC + "red";
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

test("all examples validate with no errors and no warnings", () => {
  const files = readdirSync(EXAMPLES).filter((f) => f.endsWith(".json"));
  assert.ok(files.some((f) => f.endsWith(".en.json")) && files.some((f) => f.endsWith(".ko.json")));
  for (const f of files) {
    const r = validate(JSON.parse(readFileSync(join(EXAMPLES, f), "utf8")));
    assert.deepEqual({ f, errors: r.errors, warnings: r.warnings }, { f, errors: [], warnings: [] });
  }
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
  const r = run("validate", join(EXAMPLES, "minimal.en.json"));
  assert.equal(r.status, 0, r.stderr);
});

test("CLI: errors exit 1 with `pointer CODE message` lines, --json gives {ok, errors, warnings}", () => {
  const dir = mkdtempSync(join(tmpdir(), "iad-"));
  const doc = clone(BASE);
  doc.board[0].kind = "server";
  const file = join(dir, "invalid.json");
  writeFileSync(file, JSON.stringify(doc));
  try {
    const text = run("validate", file);
    assert.equal(text.status, 1);
    assert.match(text.stdout, /^\/board\/0\/kind E_UNKNOWN_KIND /m);
    const json = run("validate", file, "--json");
    assert.equal(json.status, 1);
    const parsed = JSON.parse(json.stdout);
    assert.deepEqual(Object.keys(parsed), ["ok", "errors", "warnings"]);
    assert.equal(parsed.ok, false);
    assert.equal(parsed.errors[0].code, "E_UNKNOWN_KIND");
    // terminal escapes in author keys never reach the terminal raw
    doc.board[0].kind = "client";
    doc.board[0]["\u001b[31m"] = 1;
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
