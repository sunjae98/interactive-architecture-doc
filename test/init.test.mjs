// `iad init`: generated skeletons validate with 0 errors, only placeholder warnings, and the CLI
// refuses to overwrite files or accept bad arguments.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, rmSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { validate } from "../skills/interactive-architecture-doc/scripts/lib/validate.mjs";
import { renderHtml } from "../skills/interactive-architecture-doc/scripts/lib/render.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CLI = join(ROOT, "skills/interactive-architecture-doc/scripts/iad.mjs");
const run = (...args) => spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8" });

function withDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), "iad-init-"));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const COMBOS = [
  [],
  ["--lang", "ko"],
  ["--steps", "1"],
  ["--steps", "2", "--scenarios", "a,b"],
  ["--steps", "20", "--lang", "ko"],
  ["--scenarios", "a,b", "--lanes", "2", "--steps", "2"],
  ["--scenarios", "image,audio,video", "--lanes", "8"],
  ["--scenarios", "fast-path,slow-path", "--lanes", "5", "--steps", "1", "--lang", "ko"],
  ["--scenarios", "a,b,c,d,e,f"],
];

for (const combo of COMBOS) {
  test(`init ${combo.join(" ") || "(defaults)"}: 0 errors, only W_PLACEHOLDER warnings, renders`, () =>
    withDir((dir) => {
      const out = join(dir, "doc.json");
      const r = run("init", out, ...combo);
      assert.equal(r.status, 0, r.stderr);
      const doc = JSON.parse(readFileSync(out, "utf8"));
      const result = validate(doc);
      assert.deepEqual(result.errors, []);
      assert.ok(result.warnings.length > 0, "placeholders must be reported");
      assert.deepEqual([...new Set(result.warnings.map((w) => w.code))], ["W_PLACEHOLDER"]);
      assert.ok(renderHtml(doc).html.length > 0);
      assert.deepEqual(readdirSync(dir), ["doc.json"], "atomic write leaves no temp files");
    }));
}

test("init defaults: en, fully automatic v3 skeleton with a 3-node chain and one scenario of 3 steps", () =>
  withDir((dir) => {
    const out = join(dir, "doc.json");
    assert.equal(run("init", out).status, 0);
    const doc = JSON.parse(readFileSync(out, "utf8"));
    assert.equal(doc.meta.lang, "en");
    assert.ok(!("steps" in doc) && !("board" in doc), "no v2 fields");
    assert.deepEqual(doc.nodes.map((n) => n.kind), ["client", "app", "store"]);
    assert.ok(doc.nodes.every((n) => !("lane" in n) && !("row" in n)), "no layout hints: the map is automatic");
    assert.deepEqual(doc.edges.map((e) => [e.from, e.to]), [["node-1", "node-2"], ["node-2", "node-3"]]);
    assert.deepEqual(doc.scenarios.map((s) => [s.id, s.steps.length]), [["default", 3]]);
    assert.ok(!("gauges" in doc));
  }));

test("init --fork is gone in v3: exit 2 with a removal message, nothing written", () =>
  withDir((dir) => {
    const out = join(dir, "doc.json");
    const r = run("init", out, "--scenarios", "a,b", "--fork");
    assert.equal(r.status, 2);
    assert.match(r.stderr, /--fork was removed in v3/);
    assert.deepEqual(readdirSync(dir), []);
  }));

test("init refuses to overwrite an existing file (exit 2) unless --force", () =>
  withDir((dir) => {
    const out = join(dir, "doc.json");
    writeFileSync(out, "keep me");
    const r = run("init", out);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /already exists/);
    assert.equal(readFileSync(out, "utf8"), "keep me");
    assert.equal(run("init", out, "--force").status, 0);
    assert.equal(validate(JSON.parse(readFileSync(out, "utf8"))).errors.length, 0);
  }));

test("init: bad arguments exit 2 and write nothing", () =>
  withDir((dir) => {
    const out = join(dir, "doc.json");
    const bad = [
      [],
      [out, out.replace("doc", "other")],
      [out, "--steps", "0"],
      [out, "--steps", "21"],
      [out, "--steps", "2.5"],
      [out, "--steps"],
      [out, "--lang", "ja"],
      [out, "--scenarios", "Bad_Id"],
      [out, "--scenarios", "a,,b"],
      [out, "--scenarios", "a,a"],
      [out, "--fork"],
      [out, "--lanes", "1"],
      [out, "--lanes", "9"],
      [out, "--lanes", "x"],
      [out, "--scenarios", "a,b,c,d,e,f,g,h,i"],
      [out, "--bogus"],
      [out, "-o", join(dir, "x.json")],
    ];
    for (const args of bad) {
      const r = run("init", ...args);
      assert.equal(r.status, 2, `init ${args.join(" ")}`);
      assert.match(r.stderr, /Usage:/, `init ${args.join(" ")} prints usage`);
    }
    assert.deepEqual(readdirSync(dir), []);
    // init-only options are rejected by other commands
    assert.equal(run("validate", out, "--lanes", "3").status, 2);
  }));

test("formatJson: round-trips and keeps short values on one line", async () => {
  const { formatJson, scaffold } = await import("../skills/interactive-architecture-doc/scripts/lib/scaffold.mjs");
  const doc = scaffold({ lang: "ko", steps: 4, scenarios: ["a", "b"], lanes: 4 });
  const text = formatJson(doc);
  assert.deepEqual(JSON.parse(text), doc);
  assert.ok(text.includes('"token": {"text":"[데이터]","kind":"file"}'), "short objects stay on one line");
  assert.ok(text.split("\n").every((l) => l.length <= 140), "long values are broken into lines");
  assert.deepEqual(JSON.parse(formatJson({ s: "a\n\"b\"", n: null, e: [], o: {} })), { s: "a\n\"b\"", n: null, e: [], o: {} });
});

test("init skeleton: the automatic chain renders left to right, and an added node is placed automatically", async () => {
  const { scaffold } = await import("../skills/interactive-architecture-doc/scripts/lib/scaffold.mjs");
  const { layoutWalkthrough } = await import("../skills/interactive-architecture-doc/scripts/lib/walkthrough-layout.mjs");
  const doc = scaffold({ lanes: 4 });
  const L = layoutWalkthrough(doc);
  assert.deepEqual(doc.nodes.map((n) => L.nodes[n.id].lane), [0, 1, 2, 3]);
  doc.nodes.push({ id: "extra", kind: "app", title: "[Extra]", facts: ["[x]"] });
  doc.edges.push({ id: "edge-x", from: "node-2", to: "extra", kind: "text" });
  doc.scenarios[0].steps[0].edges.push("edge-x");
  assert.deepEqual(validate(doc).errors, []);
});
