import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { validate, RULES } from "../skills/interactive-architecture-doc/scripts/lib/validate.mjs";
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

test("base fixture is valid with no warnings", () => {
  const r = validate(clone(BASE));
  assert.deepEqual(r, { ok: true, errors: [], warnings: [] });
});

for (const [code, mutate] of FIXTURES) {
  test(`fixture triggers ${code}: ${mutate.toString().slice(8, 70)}`, () => {
    const doc = clone(BASE);
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
  const covered = new Set(FIXTURES.map(([c]) => c));
  const missing = RULES.map((r) => r.code).filter((c) => !covered.has(c));
  assert.deepEqual(missing, []);
});

test("RULES and the rule table in references/format.md match", () => {
  const md = readFileSync(join(SKILL, "references/format.md"), "utf8");
  const rows = [...md.matchAll(/^\|\s*`([EW]_[A-Z_]+)`\s*\|\s*(error|warning)\s*\|/gm)].map((m) => `${m[1]}:${m[2]}`);
  const rules = RULES.map((r) => `${r.code}:${r.level}`);
  assert.deepEqual([...rows].sort(), [...rules].sort());
  assert.equal(new Set(rows).size, rows.length, "duplicate rows in format.md");
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
