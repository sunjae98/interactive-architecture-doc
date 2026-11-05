// The single source of truth for IR validation.
// references/format.md documents the same rule codes; a test keeps the two in sync.

import { hasPlaceholder } from "./markup.mjs";
import { layoutOverview } from "./layout.mjs";
import { layoutWalkthrough, SIDES, isValidPath, MAX_COORD } from "./walkthrough-layout.mjs";

// Walkthrough (v3) node kinds; their colors follow the reference design (client crimson, infra
// violet, app amber, store green, tool gray, dep blue). What each kind means is set by `legend.nodes`.
export const KINDS = ["client", "infra", "app", "store", "tool", "dep"];
export const EDGE_KINDS = ["file", "text", "ctrl"];
export const TOKEN_KINDS = ["file", "text", "ctrl", "err"];
export const GROUP_TONES = ["default", "muted"];
export const MAX_SCENARIOS = 6;
export const MAX_NODES = 64; // keeps the build-time layout (routing around boxes) well under a second
export const MAX_SUB = 3;
export const MAX_GRID = 64; // lane / row / span / rows; coordinates and sizes stay within MAX_COORD
export const LANGS = ["ko", "en"];
export const STYLES = ["walkthrough", "overview"];
export const TONES = ["default", "outer"];
export const MIN_COLUMNS = 2;
export const MAX_COLUMNS = 4;
// path ids are URL hashes; this one runs the self-check
export const RESERVED_PATH_IDS = ["iad-selfcheck"];

export const RULES = [
  { code: "E_TYPE", level: "error", summary: "Value has the wrong JSON type, or is outside its range (lane/row/span/rows <= 64, coordinates and sizes within ±1e5, list lengths)." },
  { code: "E_REQUIRED", level: "error", summary: "A required field is missing." },
  { code: "E_EMPTY", level: "error", summary: "A required string or array is empty." },
  { code: "E_UNKNOWN_KEY", level: "error", summary: "An object has a key the format does not define (typo guard)." },
  { code: "E_UNKNOWN_KIND", level: "error", summary: "A node (or a `legend.nodes` key) has a kind other than client, infra, app, store, tool, dep." },
  { code: "E_LANG", level: "error", summary: "`meta.lang` is not `ko` or `en`." },
  { code: "E_STYLE", level: "error", summary: "`meta.style` is not `walkthrough` or `overview`." },
  { code: "E_ENUM", level: "error", summary: "A value is not one of the allowed options (edge/token kind, group tone, route side, overview tone)." },
  { code: "E_ID_FORMAT", level: "error", summary: "An id is malformed: scenario, group and path ids are kebab-case; node, edge and gauge ids are lowercase words joined by `-` or `_`." },
  { code: "E_ID_DUPLICATE", level: "error", summary: "An id (scenario, node, edge, group, gauge, path) is used more than once." },
  { code: "E_LEGEND_MISSING_KIND", level: "error", summary: "A node kind used in the document is not described in `legend` (`legend.nodes` for walkthroughs)." },
  { code: "E_WHY_EMPTY", level: "error", summary: "`considerations.items[].why` is empty." },
  { code: "E_V2_WALKTHROUGH", level: "error", summary: "The document is a v2 walkthrough (top-level `steps` or `board`); v3 replaced that format. Rewrite it by hand (references/migration-v2.md)." },
  { code: "E_EDGE_UNKNOWN", level: "error", summary: "A step names an edge id that does not exist." },
  { code: "E_STEP_EMPTY", level: "error", summary: "A step has neither `edges` nor `nodes`, so nothing would be highlighted." },
  { code: "E_SCENARIO_LIMIT", level: "error", summary: "More than 6 scenarios (there are 6 scenario colors)." },
  { code: "E_NODE_LIMIT", level: "error", summary: "More than 64 nodes; split the map into several documents." },
  { code: "E_GAUGE_UNKNOWN", level: "error", summary: "A step (`gauges`) or a scenario (`gauge_empty`) names a gauge id that does not exist." },
  { code: "E_GAUGE_RANGE", level: "error", summary: "A gauge value is outside 0..1." },
  { code: "E_GAUGE_DUP_NODE", level: "error", summary: "Two gauges are drawn on the same node (one gauge per node)." },
  { code: "E_LANE_GROUPS", level: "error", summary: "Lane hints put nodes of different groups (or grouped and ungrouped nodes) in the same lane of a partly automatic map; each lane belongs to one group there." },
  { code: "E_POS_PARTIAL", level: "error", summary: "A node has only one of `x` / `y`; absolute positions need both." },
  { code: "E_LAYOUT_OVERLAP", level: "error", summary: "Two nodes, two groups, or a node and a group it does not belong to overlap on the map." },
  { code: "E_ROUTE_PATH", level: "error", summary: "`route.d` is not an absolute SVG path: it must start with M and use M L H V C Q Z with whole argument groups (M/L 2, H/V 1, C 6, Q 4, Z 0) of finite numbers within ±1e5." },
  { code: "E_EDGE_SELF", level: "error", summary: "An edge starts and ends at the same node (use `step.nodes` to highlight a single node)." },
  { code: "E_TABLE_SHAPE", level: "error", summary: "A table row does not have one cell per column." },
  { code: "W_EDGE_UNUSED", level: "warning", summary: "An edge is not used by any step of any scenario." },
  { code: "W_NODE_ISOLATED", level: "warning", summary: "A node has no edge." },
  { code: "W_EDGE_CROSSES_NODE", level: "warning", summary: "An edge runs through a node it does not connect; set `route` or move a node." },
  { code: "W_FACTS_MISSING", level: "warning", summary: "A node has no `facts`, so clicking it shows an empty panel." },
  { code: "W_POS_IGNORED", level: "warning", summary: "A node has both `x`/`y` and `lane`/`row`; `x`/`y` wins and `lane`/`row` are ignored." },
  { code: "W_GAUGE_UNUSED", level: "warning", summary: "No step sets this gauge, so it always shows its empty state." },
  { code: "W_LANE_EMPTY", level: "warning", summary: "Lane hints leave lanes without any node; they are drawn without width, but a lower hint is usually meant." },
  { code: "W_BADGE_CROWDED", level: "warning", summary: "A step badge found no spot clear of the scenario's other badges and of node boxes (many steps start on one short edge); it overlaps." },
  { code: "E_NODE_UNKNOWN", level: "error", summary: "An edge, step, gauge, marker, skip entry or overview path names a node id that does not exist." },
  { code: "E_PATH_UNKNOWN", level: "error", summary: "Overview: a `label_by_path` key is not a path id." },
  { code: "E_GROUP_UNKNOWN", level: "error", summary: "A node's `group` (walkthrough) or `layers[].group` (overview) is not a group id, or an overview group's layers are not contiguous." },
  { code: "E_LAYOUT", level: "error", summary: "Overview: the grid cannot hold the layer (`meta.columns` outside 2..4, a node outside the grid or on another node, a boundary on the first layer, `rows` with `code` or with `tone: outer`)." },
  { code: "E_EDGE_LAYER", level: "error", summary: "Overview: an edge does not connect two nodes in adjacent layers." },
  { code: "E_PATH_DISCONNECTED", level: "error", summary: "Overview: a path node has no edge to another node of the same path." },
  { code: "E_EDGE_ALIGN", level: "error", summary: "Overview: the two nodes of an edge do not overlap horizontally, so no vertical line fits." },
  { code: "W_PLACEHOLDER", level: "warning", summary: "A string still contains a `[...]` placeholder or `TODO`." },
  { code: "W_TEXT_LONG", level: "warning", summary: "Text is likely wider than its box, or (overview) a label collides with another label, an edge line or the edge of the diagram." },
];

const RULE_LEVEL = Object.fromEntries(RULES.map((r) => [r.code, r.level]));

// ---- type descriptors -------------------------------------------------------
const text = { t: "text" }; // non-empty string
const str = { t: "str" }; // any string
const int = { t: "int" };
const uint = { t: "int", min: 0 };
const pos = { t: "int", min: 1 };
const num = { t: "num" };
const posNum = { t: "num", gt: 0 };
// walkthrough geometry: bounded so layout work stays small whatever the input
const gridIdx = { t: "int", min: 0, max: MAX_GRID };
const gridLen = { t: "int", min: 1, max: MAX_GRID };
const coord = { t: "num", min: -MAX_COORD, max: MAX_COORD };
const size = { t: "num", gt: 0, max: MAX_COORD };
const bool = { t: "bool" };
const arr = (of, min = 1, max = Infinity) => ({ t: "arr", of, min, max });
const obj = (req, opt = {}) => ({ t: "obj", req, opt });
const oneOf = (values, code) => ({ t: "enum", values, code });
const map = (of) => ({ t: "map", of });
const either = (str, obj) => ({ t: "either", str, obj }); // a string, or an object form of it

// Walkthrough (v3): a component map (nodes, edges, groups) plus scenarios whose steps light up
// edges and move a token along them.
const STEP = obj(
  {
    title: text,
    edges: arr(text, 0),
    token: obj({ text: text, kind: oneOf(TOKEN_KINDS, "E_ENUM") }),
    what: text,
    where: text,
    fail: text,
  },
  {
    nodes: arr(text),
    gauges: map(obj({ value: num, label: text })),
    markers: arr(obj({ node: text, label: text })),
  }
);

const DOC = obj(
  {
    meta: obj(
      { title: text },
      {
        intro: text,
        facts: arr(obj({ label: text, value: text }, { mono: bool })),
        source: text,
        style: oneOf(STYLES, "E_STYLE"),
        lang: oneOf(LANGS, "E_LANG"),
      }
    ),
    legend: obj(
      { nodes: map(text) },
      {
        edges: obj({}, { file: text, text: text, ctrl: text }),
        tokens: arr(obj({ kind: oneOf(TOKEN_KINDS, "E_ENUM"), text: text })),
      }
    ),
    nodes: arr(
      obj(
        { id: text, kind: oneOf(KINDS, "E_UNKNOWN_KIND"), title: text },
        {
          mono: text,
          sub: arr(text, 1, MAX_SUB),
          lines: arr(either(str, obj({ text: str }, { muted: bool }))),
          facts: arr(text),
          group: text,
          lane: gridIdx,
          row: gridIdx,
          span: gridLen,
          rows: gridLen,
          x: coord,
          y: coord,
          w: size,
          h: size,
        }
      )
    ),
    edges: arr(
      obj(
        { id: text, from: text, to: text, kind: oneOf(EDGE_KINDS, "E_ENUM") },
        {
          route: obj(
            {},
            { from_side: oneOf(SIDES, "E_ENUM"), to_side: oneOf(SIDES, "E_ENUM"), via: arr(arr(coord, 2, 2)), d: text }
          ),
        }
      )
    ),
    scenarios: arr(
      obj(
        { id: text, title: text, summary: text, lead: text, steps: arr(STEP) },
        {
          tag: text,
          note: obj({ items: arr(text) }, { title: text }),
          skip: arr(obj({ node: text, label: text })),
          gauge_empty: map(text),
        }
      )
    ),
  },
  {
    groups: arr(obj({ id: text, title: text }, { meta: text, tone: oneOf(GROUP_TONES, "E_ENUM") })),
    gauges: arr(obj({ id: text, node: text }, { caption: text, empty: text })),
    tldr: obj({ points: arr(text) }, { title: text }),
    tables: arr(obj({ title: text, columns: arr(text), rows: arr(arr(text)) })),
    callouts: arr(obj({ title: text, body: text })),
    considerations: obj({ title: text, items: arr(obj({ decision: text, why: str })) }),
    tool_examples: obj({ title: text, tools: arr(obj({ name: text, code: text }, { note: text })) }, { lead: text }),
  }
);

// Overview style: layers of nodes on a column grid, vertical edges, optional highlighted paths.
const OVERVIEW_DOC = obj(
  {
    meta: obj({ title: text, style: oneOf(STYLES, "E_STYLE") }, { subtitle: text, lang: oneOf(LANGS, "E_LANG"), columns: int }),
    layers: arr(
      obj(
        { nodes: arr(obj({ id: text, title: text }, { code: text, rows: arr(text), span: int, col: int, tone: oneOf(TONES, "E_ENUM") })) },
        { group: text, boundary: text }
      )
    ),
  },
  {
    groups: arr(obj({ id: text, label: text })),
    edges: arr(obj({ from: text, to: text }, { label: text, label_by_path: map(text) })),
    paths: arr(obj({ id: text, label: text, nodes: arr(text) }, { caption: text })),
    caption: text,
  }
);

export const isOverview = (doc) => isPlainObject(doc) && isPlainObject(doc.meta) && doc.meta.style === "overview";

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
      else if (d.min !== undefined && v < d.min) report(out, path, "E_TYPE", `expected integer >= ${d.min}, got ${v}`);
      else if (d.max !== undefined && v > d.max) report(out, path, "E_TYPE", `expected integer <= ${d.max}, got ${v}`);
      return;
    case "num":
      if (typeof v !== "number" || !Number.isFinite(v)) report(out, path, "E_TYPE", `expected number, got ${typeName(v)}`);
      else if (d.gt !== undefined && !(v > d.gt)) report(out, path, "E_TYPE", `expected number > ${d.gt}, got ${v}`);
      else if (d.min !== undefined && v < d.min) report(out, path, "E_TYPE", `expected number >= ${d.min}, got ${v}`);
      else if (d.max !== undefined && v > d.max) report(out, path, "E_TYPE", `expected number <= ${d.max}, got ${v}`);
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
      if (v.length > d.max) report(out, path, "E_TYPE", `takes at most ${d.max} item(s), got ${v.length}`);
      v.forEach((item, i) => check(item, d.of, ptr(path, i), out));
      return;
    case "map":
      if (!isPlainObject(v)) return report(out, path, "E_TYPE", `expected object, got ${typeName(v)}`);
      for (const [key, item] of Object.entries(v)) check(item, d.of, ptr(path, key), out);
      return;
    case "obj":
      return checkObject(v, d, path, out);
    case "either":
      return typeof v === "string" ? check(v, d.str, path, out) : check(v, d.obj, path, out);
    default:
      throw new Error(`internal: unknown descriptor ${d.t}`);
  }
}

// Node, edge and gauge ids: lowercase words joined by "-" or "_" (snake_case reads well in edge ids
// such as "mw_lease"). Scenario and group ids stay kebab-case.
export const ID = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/;
// route.d: absolute commands only, so the build can measure the path (badges, crossing check)

function walkStrings(v, path, fn) {
  if (typeof v === "string") fn(v, path);
  else if (Array.isArray(v)) v.forEach((x, i) => walkStrings(x, ptr(path, i), fn));
  else if (isPlainObject(v)) for (const [k, x] of Object.entries(v)) walkStrings(x, ptr(path, k), fn);
}

// Walkthrough fields rendered as plain text (no markup): backticks there are literal characters.
const PLAIN_TEXT_PATH = new RegExp(
  "^/(?:meta/title" +
    "|nodes/\\d+/(?:id|title|mono|sub/\\d+|lines/\\d+(?:/text)?)" +
    "|groups/\\d+/(?:title|meta)|gauges/\\d+/(?:caption|empty)|legend/tokens/\\d+/text" +
    "|scenarios/\\d+/(?:skip/\\d+/label|gauge_empty/[^/]+" +
    "|steps/\\d+/(?:token/text|markers/\\d+/label|gauges/[^/]+/label))" +
    "|tool_examples/tools/\\d+/(?:name|code))$"
);

export const isV2Walkthrough = (doc) => isPlainObject(doc) && !isOverview(doc) && (Object.hasOwn(doc, "steps") || Object.hasOwn(doc, "board"));

function checkSemantics(doc, out) {
  const ids = (list, path, what, re, reName) => {
    const seen = new Set();
    (list || []).forEach((item, i) => {
      const p = `${path}/${i}/id`;
      if (!re.test(item.id)) report(out, p, "E_ID_FORMAT", `${what} id ${q(item.id)} must be ${reName}`);
      if (seen.has(item.id)) report(out, p, "E_ID_DUPLICATE", `${what} id ${q(item.id)} is already used`);
      seen.add(item.id);
    });
    return seen;
  };
  const nodeIds = ids(doc.nodes, "/nodes", "node", ID, "lowercase words joined by - or _");
  const edgeIds = ids(doc.edges, "/edges", "edge", ID, "lowercase words joined by - or _");
  const groupIds = ids(doc.groups, "/groups", "group", KEBAB, "kebab-case");
  const gaugeIds = ids(doc.gauges, "/gauges", "gauge", ID, "lowercase words joined by - or _");
  ids(doc.scenarios, "/scenarios", "scenario", KEBAB, "kebab-case");
  const nodeRef = (id, path) => {
    if (!nodeIds.has(id)) report(out, path, "E_NODE_UNKNOWN", `${q(id)} is not a node id`);
  };

  // nodes: group, kinds, position
  const usedKinds = new Set();
  doc.nodes.forEach((n, i) => {
    const p = `/nodes/${i}`;
    usedKinds.add(n.kind);
    if (n.group !== undefined && !groupIds.has(n.group)) report(out, p + "/group", "E_GROUP_UNKNOWN", `${q(n.group)} is not a group id`);
    const hasX = n.x !== undefined;
    const hasY = n.y !== undefined;
    if (hasX !== hasY) report(out, p + (hasX ? "/x" : "/y"), "E_POS_PARTIAL", `${hasX ? "x" : "y"} needs ${hasX ? "y" : "x"} as well (absolute position)`);
    if (hasX && hasY && (n.lane !== undefined || n.row !== undefined)) report(out, p, "W_POS_IGNORED", "x/y is set, so lane/row are ignored");
    if (!n.facts) report(out, p, "W_FACTS_MISSING", `node ${q(n.id)} has no facts (shown when the box is clicked)`);
  });

  // lane hints on a partly automatic map: a lane belongs to one group (or to ungrouped nodes)
  const onGrid = doc.nodes.filter((n) => !(n.x !== undefined && n.y !== undefined));
  if (onGrid.some((n) => !Number.isInteger(n.lane))) {
    const laneOwner = new Map();
    doc.nodes.forEach((n, i) => {
      if (!onGrid.includes(n) || !Number.isInteger(n.lane)) return;
      const g = n.group || "";
      const prev = laneOwner.get(n.lane);
      if (!prev) laneOwner.set(n.lane, { g, id: n.id });
      else if (prev.g !== g) {
        const name = (x) => (x ? `group ${q(x)}` : "ungrouped nodes");
        report(out, `/nodes/${i}/lane`, "E_LANE_GROUPS", `lane ${n.lane} is hinted by ${name(prev.g)} (node ${q(prev.id)}) and ${name(g)} (node ${q(n.id)}); in a partly automatic map each lane belongs to one group, so give these nodes different lanes (or give every node a lane)`);
      }
    });
  }

  // legend
  for (const key of Object.keys(doc.legend.nodes)) {
    if (!KINDS.includes(key)) report(out, ptr("/legend/nodes", key), "E_UNKNOWN_KIND", `${q(key)} is not a node kind (${KINDS.join(", ")})`);
  }
  const missingKinds = KINDS.filter((k) => usedKinds.has(k) && !Object.hasOwn(doc.legend.nodes, k));
  if (missingKinds.length) report(out, "/legend/nodes", "E_LEGEND_MISSING_KIND", `legend.nodes is missing kind(s) used by nodes: ${missingKinds.join(", ")}`);

  // edges
  const linked = new Set();
  doc.edges.forEach((e, i) => {
    nodeRef(e.from, `/edges/${i}/from`);
    nodeRef(e.to, `/edges/${i}/to`);
    if (e.from === e.to) report(out, `/edges/${i}`, "E_EDGE_SELF", `edge ${q(e.id)} starts and ends at ${q(e.from)}; a step on one node uses step.nodes instead`);
    linked.add(e.from).add(e.to);
    if (e.route && e.route.d !== undefined) {
      if (!isValidPath(e.route.d)) {
        report(out, `/edges/${i}/route/d`, "E_ROUTE_PATH", `route.d must start with M and use absolute M L H V C Q Z with whole argument groups (M/L 2, H/V 1, C 6, Q 4, Z 0) of finite numbers within ±${MAX_COORD}`);
      }
    }
  });
  doc.nodes.forEach((n, i) => {
    if (!linked.has(n.id)) report(out, `/nodes/${i}`, "W_NODE_ISOLATED", `node ${q(n.id)} has no edge`);
  });

  // gauges
  const gaugeNodes = new Map();
  (doc.gauges || []).forEach((g, i) => {
    nodeRef(g.node, `/gauges/${i}/node`);
    if (gaugeNodes.has(g.node)) report(out, `/gauges/${i}/node`, "E_GAUGE_DUP_NODE", `node ${q(g.node)} already has gauge ${q(gaugeNodes.get(g.node))}`);
    else gaugeNodes.set(g.node, g.id);
  });

  if (doc.nodes.length > MAX_NODES) report(out, "/nodes", "E_NODE_LIMIT", `at most ${MAX_NODES} nodes, got ${doc.nodes.length}; split the map into several documents`);

  // scenarios and steps
  if (doc.scenarios.length > MAX_SCENARIOS) report(out, "/scenarios", "E_SCENARIO_LIMIT", `at most ${MAX_SCENARIOS} scenarios, got ${doc.scenarios.length}`);
  const usedEdges = new Set();
  const usedGauges = new Set();
  doc.scenarios.forEach((sc, si) => {
    const sp = `/scenarios/${si}`;
    (sc.skip || []).forEach((k, j) => nodeRef(k.node, `${sp}/skip/${j}/node`));
    for (const gid of Object.keys(sc.gauge_empty || {})) {
      if (!gaugeIds.has(gid)) report(out, ptr(`${sp}/gauge_empty`, gid), "E_GAUGE_UNKNOWN", `${q(gid)} is not a gauge id`);
    }
    sc.steps.forEach((st, ti) => {
      const p = `${sp}/steps/${ti}`;
      st.edges.forEach((id, j) => {
        if (!edgeIds.has(id)) report(out, `${p}/edges/${j}`, "E_EDGE_UNKNOWN", `${q(id)} is not an edge id`);
        usedEdges.add(id);
      });
      (st.nodes || []).forEach((id, j) => nodeRef(id, `${p}/nodes/${j}`));
      if (!st.edges.length && !(st.nodes && st.nodes.length)) report(out, p, "E_STEP_EMPTY", "a step needs edges or nodes to highlight");
      for (const [gid, g] of Object.entries(st.gauges || {})) {
        if (!gaugeIds.has(gid)) report(out, ptr(`${p}/gauges`, gid), "E_GAUGE_UNKNOWN", `${q(gid)} is not a gauge id`);
        usedGauges.add(gid);
        if (!(g.value >= 0 && g.value <= 1)) report(out, ptr(`${p}/gauges`, gid) + "/value", "E_GAUGE_RANGE", `gauge value must be in 0..1, got ${g.value}`);
      }
      (st.markers || []).forEach((m, j) => nodeRef(m.node, `${p}/markers/${j}/node`));
    });
  });
  doc.edges.forEach((e, i) => {
    if (!usedEdges.has(e.id)) report(out, `/edges/${i}`, "W_EDGE_UNUSED", `edge ${q(e.id)} is not used by any step`);
  });
  (doc.gauges || []).forEach((g, i) => {
    if (!usedGauges.has(g.id)) report(out, `/gauges/${i}`, "W_GAUGE_UNUSED", `no step sets gauge ${q(g.id)}`);
  });

  // tables, considerations
  (doc.tables || []).forEach((t, i) => {
    t.rows.forEach((r, j) => {
      if (r.length !== t.columns.length) report(out, `/tables/${i}/rows/${j}`, "E_TABLE_SHAPE", `row has ${r.length} cell(s), the table has ${t.columns.length} column(s)`);
    });
  });
  if (doc.considerations) {
    doc.considerations.items.forEach((item, i) => {
      if (!item.why.trim()) report(out, `/considerations/items/${i}/why`, "E_WHY_EMPTY", "every decision needs a reason (why)");
    });
  }

  walkStrings(doc, "", (value, path) => {
    const codeSpans = !PLAIN_TEXT_PATH.test(path);
    if (hasPlaceholder(value, { constants: true, codeSpans })) report(out, path, "W_PLACEHOLDER", "looks like an unfilled placeholder ([...] or TODO)");
  });

  // geometry only on a document whose references are sound
  if (!out.errors.length) {
    for (const issue of layoutWalkthrough(doc).issues) report(out, issue.path, issue.code, issue.message);
  }
}

function checkOverviewSemantics(doc, out) {
  const columns = doc.meta.columns ?? 3;
  // a bad column count is reported once; node placement is only checked against a valid grid
  const gridOk = columns >= MIN_COLUMNS && columns <= MAX_COLUMNS;
  if (!gridOk) report(out, "/meta/columns", "E_LAYOUT", `columns must be ${MIN_COLUMNS}..${MAX_COLUMNS}, got ${columns}`);

  const ids = (list, path, what) => {
    const seen = new Set();
    list.forEach((item, i) => {
      const p = `${path}/${i}/id`;
      if (!KEBAB.test(item.id)) report(out, p, "E_ID_FORMAT", `${what} id ${q(item.id)} must be kebab-case`);
      if (seen.has(item.id)) report(out, p, "E_ID_DUPLICATE", `${what} id ${q(item.id)} is already used`);
      seen.add(item.id);
    });
    return seen;
  };
  const groupIds = ids(doc.groups || [], "/groups", "group");
  const pathIds = ids(doc.paths || [], "/paths", "path");
  (doc.paths || []).forEach((p, i) => {
    if (RESERVED_PATH_IDS.includes(p.id)) report(out, `/paths/${i}/id`, "E_ID_FORMAT", `path id ${q(p.id)} is reserved (it is the self-check URL hash)`);
  });

  // nodes: ids, grid cells, shape
  const nodeLayer = new Map();
  const nodeSeen = new Set();
  doc.layers.forEach((layer, li) => {
    const lp = `/layers/${li}`;
    if (li === 0 && layer.boundary !== undefined) report(out, lp + "/boundary", "E_LAYOUT", "the first layer cannot have a boundary (there is nothing above it)");
    const taken = new Set();
    let cursor = 1;
    layer.nodes.forEach((n, ni) => {
      const p = `${lp}/nodes/${ni}`;
      if (!KEBAB.test(n.id)) report(out, p + "/id", "E_ID_FORMAT", `node id ${q(n.id)} must be kebab-case`);
      if (nodeSeen.has(n.id)) report(out, p + "/id", "E_ID_DUPLICATE", `node id ${q(n.id)} is already used`);
      nodeSeen.add(n.id);
      nodeLayer.set(n.id, li);
      if (n.rows && n.code !== undefined) report(out, p, "E_LAYOUT", "a node has either code (a box) or rows (a card), not both");
      if (n.rows && n.tone === "outer") report(out, p, "E_LAYOUT", "a card (rows) cannot have tone \"outer\"");
      const span = n.span ?? 1;
      const col = n.col ?? cursor;
      if (!gridOk) {
        // skipped: see /meta/columns
      } else if (span < 1 || col < 1 || col + span - 1 > columns) {
        report(out, p, "E_LAYOUT", `node spans columns ${col}..${col + span - 1}, outside 1..${columns}`);
      } else {
        for (let c = col; c < col + span; c++) {
          if (taken.has(c)) report(out, p, "E_LAYOUT", `column ${c} is already used by another node in this layer`);
          taken.add(c);
        }
      }
      cursor = col + span;
    });
  });

  // groups: known ids, one contiguous run of layers each
  const finished = new Set();
  let current = null;
  doc.layers.forEach((layer, li) => {
    const g = layer.group ?? null;
    if (g !== current) {
      if (current !== null) finished.add(current);
      if (g !== null && finished.has(g)) report(out, `/layers/${li}/group`, "E_GROUP_UNKNOWN", `group ${q(g)} is split; its layers must be next to each other`);
      current = g;
    }
    if (g !== null && !groupIds.has(g)) report(out, `/layers/${li}/group`, "E_GROUP_UNKNOWN", `${q(g)} is not a group id`);
  });

  // edges: known nodes in adjacent layers, known path ids
  const adjacency = new Map();
  (doc.edges || []).forEach((e, i) => {
    const p = `/edges/${i}`;
    let known = true;
    for (const key of ["from", "to"]) {
      if (!nodeLayer.has(e[key])) {
        report(out, `${p}/${key}`, "E_NODE_UNKNOWN", `${q(e[key])} is not a node id`);
        known = false;
      }
    }
    if (known && Math.abs(nodeLayer.get(e.from) - nodeLayer.get(e.to)) !== 1) {
      report(out, p, "E_EDGE_LAYER", `${q(e.from)} and ${q(e.to)} are not in adjacent layers`);
    }
    if (e.label_by_path !== undefined && e.label === undefined) {
      report(out, `${p}/label`, "E_REQUIRED", "label_by_path needs a default label (shown on the overview and on other paths)");
    }
    for (const key of Object.keys(e.label_by_path || {})) {
      if (!pathIds.has(key)) report(out, ptr(`${p}/label_by_path`, key), "E_PATH_UNKNOWN", `${q(key)} is not a path id`);
    }
    for (const [a, b] of [[e.from, e.to], [e.to, e.from]]) {
      if (!adjacency.has(a)) adjacency.set(a, new Set());
      adjacency.get(a).add(b);
    }
  });

  // paths: known nodes, each connected to another node of the path
  (doc.paths || []).forEach((path, i) => {
    const members = new Set(path.nodes);
    path.nodes.forEach((id, j) => {
      if (!nodeLayer.has(id)) return report(out, `/paths/${i}/nodes/${j}`, "E_NODE_UNKNOWN", `${q(id)} is not a node id`);
      const linked = [...(adjacency.get(id) || [])].some((other) => other !== id && members.has(other));
      if (members.size > 1 && !linked) {
        report(out, `/paths/${i}/nodes/${j}`, "E_PATH_DISCONNECTED", `${q(id)} has no edge to another node of path ${q(path.id)}`);
      }
    });
  });

  walkStrings(doc, "", (value, path) => {
    if (hasPlaceholder(value)) report(out, path, "W_PLACEHOLDER", "looks like an unfilled placeholder ([...] or TODO)");
  });

  // geometry only on a document whose references and grid are sound
  if (!out.errors.length) {
    for (const issue of layoutOverview(doc).issues) report(out, issue.path, issue.code, issue.message);
  }
}

// Validate an already-parsed IR document. Structural checks run first; cross-reference
// checks only run on a structurally valid document so they can trust the shape.
// `meta.style: "overview"` selects the overview format; anything else is a walkthrough document.
// A v2 walkthrough (top-level steps/board) gets exactly one E_V2_WALKTHROUGH and nothing else.
export function validate(doc) {
  const out = { errors: [], warnings: [] };
  const overview = isOverview(doc);
  if (isV2Walkthrough(doc)) {
    report(out, Object.hasOwn(doc, "steps") ? "/steps" : "/board", "E_V2_WALKTHROUGH", "this is a v2 walkthrough (top-level steps/board); v3 uses nodes, edges and per-scenario steps. Rewrite it by hand: see references/migration-v2.md");
    return { ok: false, errors: out.errors, warnings: out.warnings };
  }
  check(doc, overview ? OVERVIEW_DOC : DOC, "", out);
  if (!out.errors.length) (overview ? checkOverviewSemantics : checkSemantics)(doc, out);
  return { ok: out.errors.length === 0, errors: out.errors, warnings: out.warnings };
}

export function formatIssue(issue) {
  return escapeControls(`${issue.path || "(root)"} ${issue.code} ${issue.message}`);
}
