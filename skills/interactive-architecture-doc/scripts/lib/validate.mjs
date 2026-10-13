// The single source of truth for IR validation.
// references/format.md documents the same rule codes; a test keeps the two in sync.

import { hasPlaceholder } from "./markup.mjs";

export const KINDS = ["client", "decision", "existing", "new"];
export const LANGS = ["ko", "en"];
export const WIDTHS = ["narrow", "wide", "full"];
export const VARIANTS = ["default", "alt"];

export const RULES = [
  { code: "E_TYPE", level: "error", summary: "Value has the wrong JSON type." },
  { code: "E_REQUIRED", level: "error", summary: "A required field is missing." },
  { code: "E_EMPTY", level: "error", summary: "A required string or array is empty." },
  { code: "E_UNKNOWN_KEY", level: "error", summary: "An object has a key the format does not define (typo guard)." },
  { code: "E_UNKNOWN_BLOCK", level: "error", summary: "A board block has an unknown `type`." },
  { code: "E_UNKNOWN_KIND", level: "error", summary: "A node has an unknown `kind`." },
  { code: "E_LANG", level: "error", summary: "`meta.lang` is not `ko` or `en`." },
  { code: "E_ENUM", level: "error", summary: "A value is not one of the allowed options (`width`, `variant`)." },
  { code: "E_STEP_RANGE", level: "error", summary: "`node.step` is outside 1..N (N = number of steps)." },
  { code: "E_STEP_NO_NODE", level: "error", summary: "A step has no node on the board." },
  { code: "E_BRANCH_UNKNOWN", level: "error", summary: "`node.branches` references a scenario id that does not exist." },
  { code: "E_ID_FORMAT", level: "error", summary: "A scenario id or fan id is not kebab-case." },
  { code: "E_ID_DUPLICATE", level: "error", summary: "A scenario id or `fan_hub` id is used more than once." },
  { code: "E_SCENARIO_STEP_KEY", level: "error", summary: "A `scenario.steps` key is not a step number in 1..N." },
  { code: "E_FAN_HUB_NO_TARGET", level: "error", summary: "A `fan_hub` has no `fan_target` in the same fork block." },
  { code: "E_FAN_TARGET_NO_HUB", level: "error", summary: "A `fan_target` has no matching `fan_hub` in the same fork block." },
  { code: "E_FAN_OUTSIDE_FORK", level: "error", summary: "`fan_hub` / `fan_target` is used on a node that is not inside a fork block." },
  { code: "E_LEGEND_MISSING_KIND", level: "error", summary: "A node kind used on the board is not described in `legend`." },
  { code: "E_WHY_EMPTY", level: "error", summary: "`considerations.items[].why` is empty." },
  { code: "E_ENTRY", level: "error", summary: "More than one `entry` node, or an `entry` node without `meta.entry_request`." },
  { code: "W_SCENARIO_NO_ACTIVE", level: "warning", summary: "A scenario has no active node at some step." },
  { code: "W_SCENARIO_STEP_MISSING", level: "warning", summary: "A scenario has no `steps` text for some step." },
  { code: "W_PLACEHOLDER", level: "warning", summary: "A string still contains a `[...]` placeholder or `TODO`." },
  { code: "W_ENTRY_NO_INPUT", level: "warning", summary: "`meta.entry_request` does not contain `{{input}}`." },
];

const RULE_LEVEL = Object.fromEntries(RULES.map((r) => [r.code, r.level]));

// ---- type descriptors -------------------------------------------------------
const text = { t: "text" }; // non-empty string
const str = { t: "str" }; // any string
const int = { t: "int" };
const bool = { t: "bool" };
const block = { t: "block" };
const arr = (of, min = 1) => ({ t: "arr", of, min });
const obj = (req, opt = {}) => ({ t: "obj", req, opt });
const oneOf = (values, code) => ({ t: "enum", values, code });
const map = (of) => ({ t: "map", of });

const DOC = obj(
  {
    meta: obj({ title: text }, { subtitle: text, lang: oneOf(LANGS, "E_LANG"), entry_request: text }),
    steps: arr(obj({ label: text })),
    legend: obj({}, { client: text, decision: text, existing: text, new: text }),
    scenarios: arr(obj({ id: text, label: text, steps: map(str) }, { icon: text, input: str })),
    board: arr(block),
  },
  {
    tldr: obj({ headline: text, points: arr(obj({ title: text, detail: text })) }),
    callouts: arr(obj({ title: text, body: text })),
    considerations: obj({ title: text, items: arr(obj({ decision: text, why: str })) }),
    tool_examples: obj({ title: text, tools: arr(obj({ name: text, code: text }, { note: text })) }, { lead: text }),
  }
);

const BLOCKS = {
  node: obj(
    { type: text, kind: oneOf(KINDS, "E_UNKNOWN_KIND"), step: int, body: text },
    {
      branches: arr(text),
      tag: text,
      code: text,
      note: text,
      width: oneOf(WIDTHS, "E_ENUM"),
      details: obj({ items: arr(obj({ title: text, body: text }, { variant: oneOf(VARIANTS, "E_ENUM") })) }, { code: text }),
      fan_hub: text,
      fan_target: text,
      entry: bool,
    }
  ),
  arrow: obj({ type: text }, { label: text }),
  internal: obj({ type: text, badge: text, children: arr(block) }),
  external: obj({ type: text, badge: text, systems: arr(obj({ name: text, items: arr(obj({ text: text }, { tag: text })) })) }),
  fork: obj({ type: text, children: arr(block) }),
  columns: obj({ type: text, columns: arr(obj({ children: arr(block) }, { title: text })) }),
};

export const BLOCK_TYPES = Object.keys(BLOCKS);

// ---- helpers ----------------------------------------------------------------
const ptr = (path, key) => path + "/" + String(key).replace(/~/g, "~0").replace(/\//g, "~1");
const isPlainObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const typeName = (v) => (v === null ? "null" : Array.isArray(v) ? "array" : typeof v);
export const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
// Quote author-supplied keys/values in messages; JSON escaping keeps control characters
// (e.g. terminal escape sequences) out of CLI output.
const q = (v) => JSON.stringify(String(v));
// Control characters in a JSON pointer (keys are author data) are shown as \uXXXX.
const escapeControls = (s) => s.replace(/[\u0000-\u001f\u007f-\u009f]/g, (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"));

function report(out, path, code, message) {
  const list = RULE_LEVEL[code] === "warning" ? out.warnings : out.errors;
  list.push({ path, code, message });
}

function checkObject(v, d, path, out) {
  if (!isPlainObject(v)) return report(out, path, "E_TYPE", `expected object, got ${typeName(v)}`);
  for (const key of Object.keys(v)) {
    if (!Object.hasOwn(d.req, key) && !Object.hasOwn(d.opt, key)) report(out, ptr(path, key), "E_UNKNOWN_KEY", `unknown key ${q(key)}`);
  }
  for (const [key, sub] of Object.entries(d.req)) {
    if (!Object.hasOwn(v, key)) report(out, ptr(path, key), "E_REQUIRED", `missing required field "${key}"`);
    else check(v[key], sub, ptr(path, key), out);
  }
  for (const [key, sub] of Object.entries(d.opt)) {
    if (Object.hasOwn(v, key)) check(v[key], sub, ptr(path, key), out);
  }
}

function check(v, d, path, out) {
  switch (d.t) {
    case "text":
      if (typeof v !== "string") return report(out, path, "E_TYPE", `expected string, got ${typeName(v)}`);
      if (!v.trim()) report(out, path, "E_EMPTY", "must not be empty");
      return;
    case "str":
      if (typeof v !== "string") report(out, path, "E_TYPE", `expected string, got ${typeName(v)}`);
      return;
    case "int":
      if (!Number.isInteger(v)) report(out, path, "E_TYPE", `expected integer, got ${typeName(v)}`);
      return;
    case "bool":
      if (typeof v !== "boolean") report(out, path, "E_TYPE", `expected boolean, got ${typeName(v)}`);
      return;
    case "enum":
      if (typeof v !== "string") return report(out, path, "E_TYPE", `expected string, got ${typeName(v)}`);
      if (!d.values.includes(v)) report(out, path, d.code, `${q(v)} is not one of: ${d.values.join(", ")}`);
      return;
    case "arr":
      if (!Array.isArray(v)) return report(out, path, "E_TYPE", `expected array, got ${typeName(v)}`);
      if (v.length < d.min) report(out, path, "E_EMPTY", `needs at least ${d.min} item(s)`);
      v.forEach((item, i) => check(item, d.of, ptr(path, i), out));
      return;
    case "map":
      if (!isPlainObject(v)) return report(out, path, "E_TYPE", `expected object, got ${typeName(v)}`);
      for (const [key, item] of Object.entries(v)) check(item, d.of, ptr(path, key), out);
      return;
    case "obj":
      return checkObject(v, d, path, out);
    case "block": {
      if (!isPlainObject(v)) return report(out, path, "E_TYPE", `expected block object, got ${typeName(v)}`);
      if (!Object.hasOwn(v, "type")) return report(out, ptr(path, "type"), "E_REQUIRED", 'missing required field "type"');
      if (typeof v.type !== "string") return report(out, ptr(path, "type"), "E_TYPE", `expected string, got ${typeName(v.type)}`);
      if (!Object.hasOwn(BLOCKS, v.type)) {
        return report(out, ptr(path, "type"), "E_UNKNOWN_BLOCK", `unknown block type ${q(v.type)} (expected one of: ${BLOCK_TYPES.join(", ")})`);
      }
      return checkObject(v, BLOCKS[v.type], path, out);
    }
    default:
      throw new Error(`internal: unknown descriptor ${d.t}`);
  }
}

// Collect every node with its path and the nearest enclosing fork (or null).
export function collectNodes(board) {
  const nodes = [];
  let forkSeq = 0;
  const walk = (blocks, path, fork) => {
    blocks.forEach((b, i) => {
      const p = ptr(path, i);
      if (b.type === "node") nodes.push({ node: b, path: p, fork });
      else if (b.type === "internal") walk(b.children, ptr(p, "children"), fork);
      else if (b.type === "fork") walk(b.children, ptr(p, "children"), ++forkSeq);
      else if (b.type === "columns") b.columns.forEach((c, j) => walk(c.children, ptr(ptr(ptr(p, "columns"), j), "children"), fork));
    });
  };
  walk(board, "/board", null);
  return nodes;
}

function walkStrings(v, path, fn) {
  if (typeof v === "string") fn(v, path);
  else if (Array.isArray(v)) v.forEach((x, i) => walkStrings(x, ptr(path, i), fn));
  else if (isPlainObject(v)) for (const [k, x] of Object.entries(v)) walkStrings(x, ptr(path, k), fn);
}

function checkSemantics(doc, out) {
  const N = doc.steps.length;
  const nodes = collectNodes(doc.board);

  // scenario ids
  const scenarioIds = new Set();
  doc.scenarios.forEach((s, i) => {
    const p = `/scenarios/${i}/id`;
    if (!KEBAB.test(s.id)) report(out, p, "E_ID_FORMAT", `scenario id ${q(s.id)} must be kebab-case`);
    if (scenarioIds.has(s.id)) report(out, p, "E_ID_DUPLICATE", `scenario id ${q(s.id)} is already used`);
    scenarioIds.add(s.id);
  });

  // nodes: steps, branches, fan ids, kinds, entry
  const covered = new Set();
  const usedKinds = new Set();
  const hubIds = new Set();
  const entries = [];
  for (const { node, path } of nodes) {
    usedKinds.add(node.kind);
    if (node.step < 1 || node.step > N) report(out, path + "/step", "E_STEP_RANGE", `step ${node.step} is outside 1..${N}`);
    else covered.add(node.step);
    (node.branches || []).forEach((b, j) => {
      if (!scenarioIds.has(b)) report(out, `${path}/branches/${j}`, "E_BRANCH_UNKNOWN", `${q(b)} is not a scenario id`);
    });
    for (const key of ["fan_hub", "fan_target"]) {
      if (key in node && !KEBAB.test(node[key])) report(out, `${path}/${key}`, "E_ID_FORMAT", `${key} ${q(node[key])} must be kebab-case`);
    }
    if ("fan_hub" in node) {
      if (hubIds.has(node.fan_hub)) report(out, path + "/fan_hub", "E_ID_DUPLICATE", `fan_hub ${q(node.fan_hub)} is already used`);
      hubIds.add(node.fan_hub);
    }
    if (node.entry === true) entries.push(path);
  }
  for (let s = 1; s <= N; s++) {
    if (!covered.has(s)) report(out, `/steps/${s - 1}`, "E_STEP_NO_NODE", `step ${s} has no node on the board`);
  }

  // fan wiring, scoped to the nearest fork block
  for (const { node, path, fork } of nodes) {
    if (!("fan_hub" in node) && !("fan_target" in node)) continue;
    if (fork === null) {
      const key = "fan_hub" in node ? "fan_hub" : "fan_target";
      report(out, `${path}/${key}`, "E_FAN_OUTSIDE_FORK", `${key} is only allowed on nodes inside a fork block`);
      continue;
    }
    // a node never satisfies its own hub/target
    const others = nodes.filter((n) => n.fork === fork && n.node !== node);
    if ("fan_hub" in node && !others.some((n) => n.node.fan_target === node.fan_hub)) {
      report(out, path + "/fan_hub", "E_FAN_HUB_NO_TARGET", `fan_hub ${q(node.fan_hub)} has no fan_target on another node in the same fork`);
    }
    if ("fan_target" in node && !others.some((n) => n.node.fan_hub === node.fan_target)) {
      report(out, path + "/fan_target", "E_FAN_TARGET_NO_HUB", `fan_target ${q(node.fan_target)} has no fan_hub on another node in the same fork`);
    }
  }

  // legend covers every used kind
  const missingKinds = KINDS.filter((k) => usedKinds.has(k) && !(k in doc.legend));
  if (missingKinds.length) {
    report(out, "/legend", "E_LEGEND_MISSING_KIND", `legend is missing kind(s) used on the board: ${missingKinds.join(", ")}`);
  }

  // entry node
  if (entries.length > 1) {
    entries.slice(1).forEach((p) => report(out, p + "/entry", "E_ENTRY", "only one node may have entry: true"));
  }
  if (entries.length && !doc.meta.entry_request) {
    report(out, entries[0] + "/entry", "E_ENTRY", "entry: true requires meta.entry_request");
  }
  if (doc.meta.entry_request && !doc.meta.entry_request.includes("{{input}}")) {
    report(out, "/meta/entry_request", "W_ENTRY_NO_INPUT", "entry_request does not contain {{input}}");
  }

  // considerations
  if (doc.considerations) {
    doc.considerations.items.forEach((item, i) => {
      if (!item.why.trim()) report(out, `/considerations/items/${i}/why`, "E_WHY_EMPTY", "every decision needs a reason (why)");
    });
  }

  // scenarios: step keys, missing text, active nodes
  doc.scenarios.forEach((s, i) => {
    const missing = [];
    for (const key of Object.keys(s.steps)) {
      const n = /^[1-9][0-9]*$/.test(key) ? Number(key) : NaN;
      if (!(n >= 1 && n <= N)) report(out, ptr(`/scenarios/${i}/steps`, key), "E_SCENARIO_STEP_KEY", `${q(key)} is not a step number in 1..${N}`);
    }
    for (let st = 1; st <= N; st++) {
      if (!Object.hasOwn(s.steps, String(st))) missing.push(st);
      const active = nodes.some(({ node }) => node.step === st && (!node.branches || node.branches.includes(s.id)));
      if (!active) report(out, `/scenarios/${i}`, "W_SCENARIO_NO_ACTIVE", `scenario ${q(s.id)} has no active node at step ${st}`);
    }
    if (missing.length) {
      report(out, `/scenarios/${i}/steps`, "W_SCENARIO_STEP_MISSING", `scenario ${q(s.id)} has no text for step(s) ${missing.join(", ")}`);
    }
  });

  // leftover placeholders anywhere
  walkStrings(doc, "", (value, path) => {
    if (hasPlaceholder(value)) report(out, path, "W_PLACEHOLDER", "looks like an unfilled placeholder ([...] or TODO)");
  });
}

// Validate an already-parsed IR document. Structural checks run first; cross-reference
// checks only run on a structurally valid document so they can trust the shape.
export function validate(doc) {
  const out = { errors: [], warnings: [] };
  check(doc, DOC, "", out);
  if (!out.errors.length) checkSemantics(doc, out);
  return { ok: out.errors.length === 0, errors: out.errors, warnings: out.warnings };
}

export function formatIssue(issue) {
  return escapeControls(`${issue.path || "(root)"} ${issue.code} ${issue.message}`);
}
