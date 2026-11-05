// Walkthrough (v3) auto layout: scripts/lib/walkthrough-layout.mjs is pure, so it is tested directly.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { layoutWalkthrough, samplePath, pointAtHalf, isValidPath, routeAround, GEOMETRY_WT, textWidthWt, TEXT_WT } from "../skills/interactive-architecture-doc/scripts/lib/walkthrough-layout.mjs";
import { validate } from "../skills/interactive-architecture-doc/scripts/lib/validate.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE = JSON.parse(readFileSync(join(ROOT, "test/fixtures/walkthrough.en.json"), "utf8"));
const clone = (v) => JSON.parse(JSON.stringify(v));
const codes = (doc) => {
  const r = validate(doc);
  return [...r.errors, ...r.warnings].map((i) => i.code);
};

// A minimal document: nodes n0..n(k-1), the given edges, one scenario using every edge.
function mini(nodes, edges, extra = {}) {
  const doc = {
    meta: { title: "T" },
    legend: { nodes: { app: "App", store: "Store", client: "Client", dep: "Dep" } },
    nodes: nodes.map((n) => ({ kind: "app", facts: ["f"], ...(typeof n === "string" ? { id: n, title: n.toUpperCase() } : { title: n.id.toUpperCase(), ...n }) })),
    edges: edges.map(([from, to, kind = "file"], i) => ({ id: `e${i}`, from, to, kind })),
    scenarios: [{ id: "s", title: "S", summary: "s", lead: "l", steps: [{ title: "x", edges: edges.map((_, i) => `e${i}`), token: { text: "t", kind: "file" }, what: "w", where: "w", fail: "f" }] }],
    ...extra,
  };
  return doc;
}

test("layout: byte-identical output for the same input", () => {
  assert.equal(JSON.stringify(layoutWalkthrough(clone(FIXTURE))), JSON.stringify(layoutWalkthrough(clone(FIXTURE))));
});

test("layout: a 5-node chain without lanes takes lanes 0..4, left to right", () => {
  const doc = mini(["a", "b", "c", "d", "e"], [["a", "b"], ["b", "c"], ["c", "d", "text"], ["d", "e"]]);
  const L = layoutWalkthrough(doc);
  assert.deepEqual(["a", "b", "c", "d", "e"].map((id) => L.nodes[id].lane), [0, 1, 2, 3, 4]);
  for (let i = 1; i < 5; i++) assert.ok(L.nodes["abcde"[i]].x > L.nodes["abcde"[i - 1]].x + L.nodes["abcde"[i - 1]].w);
  assert.deepEqual(L.issues, []);
});

test("layout: ctrl edges do not rank, but a node reached only by ctrl stacks under its ctrl source", () => {
  // a -file-> b; b -ctrl-> c (c has no data predecessor) -> c shares b's lane, next row
  const doc = mini(["a", "b", "c", "d"], [["a", "b"], ["b", "c", "ctrl"], ["c", "d"], ["d", "a", "ctrl"]]);
  const L = layoutWalkthrough(doc);
  assert.equal(L.nodes.c.lane, L.nodes.b.lane);
  assert.equal(L.nodes.c.row, 1);
  assert.equal(L.nodes.d.lane, L.nodes.b.lane + 1);
});

test("layout: cycles are broken; when every node has a lane, successors rank after a pinned node", () => {
  const doc = mini(["a", "b", "c"], [["a", "b"], ["b", "c"], ["c", "a"]]);
  assert.deepEqual(["a", "b", "c"].map((id) => layoutWalkthrough(doc).nodes[id].lane), [0, 1, 2]);
  doc.nodes[1].lane = 3;
  assert.equal(layoutWalkthrough(doc).nodes.b.lane, 3, "a single hint keeps its lane");
  doc.nodes[0].lane = 0;
  doc.nodes[2].lane = 4;
  assert.deepEqual(["a", "b", "c"].map((id) => layoutWalkthrough(doc).nodes[id].lane), [0, 3, 4]);
});

test("layout: rows fill the next free cell in nodes[] order; explicit rows are reserved first", () => {
  const doc = mini([{ id: "a", lane: 0 }, { id: "b", lane: 0 }, { id: "c", lane: 0, row: 0 }], [["a", "b", "ctrl"], ["b", "c", "ctrl"]]);
  const L = layoutWalkthrough(doc);
  assert.deepEqual(["a", "b", "c"].map((id) => L.nodes[id].row), [1, 2, 0]);
});

test("layout: an x/y node takes no grid cell and does not move other nodes", () => {
  const base = mini([{ id: "a", lane: 0 }, { id: "b", lane: 0 }, { id: "c", lane: 1 }], [["a", "c"], ["b", "c"]]);
  const before = layoutWalkthrough(base);
  const doc = clone(base);
  doc.nodes.splice(1, 0, { id: "m", kind: "app", title: "M", facts: ["f"], x: 600, y: 400 });
  doc.edges.push({ id: "em", from: "c", to: "m", kind: "ctrl" });
  doc.scenarios[0].steps[0].edges.push("em");
  const after = layoutWalkthrough(doc);
  for (const id of ["a", "b", "c"]) {
    assert.deepEqual([after.nodes[id].x, after.nodes[id].y, after.nodes[id].row], [before.nodes[id].x, before.nodes[id].y, before.nodes[id].row], id);
  }
  assert.deepEqual([after.nodes.m.x, after.nodes.m.y], [600, 400]);
  // the viewBox grows to hold it
  const [vx, vy, vw, vh] = after.viewBox;
  assert.ok(vx + vw >= 600 + after.nodes.m.w && vy + vh >= 400 + after.nodes.m.h);
});

test("layout: span and rows boxes match the cells they cover", () => {
  const doc = mini(
    [{ id: "a", lane: 0, row: 0 }, { id: "b", lane: 1, row: 0 }, { id: "c", lane: 0, row: 1 }, { id: "d", lane: 1, row: 1 }, { id: "wide", lane: 0, row: 2, span: 2 }, { id: "tall", lane: 2, row: 0, rows: 3 }],
    [["a", "b"], ["c", "d"], ["b", "tall"], ["d", "wide", "ctrl"]]
  );
  const L = layoutWalkthrough(doc);
  const N = L.nodes;
  assert.equal(N.wide.x, N.a.x);
  assert.equal(N.wide.x + N.wide.w, N.b.x + N.b.w, "span 2 ends where lane 1 ends");
  assert.equal(N.tall.y, L.rows[0].y);
  assert.equal(N.tall.y + N.tall.h, L.rows[2].y + L.rows[2].h, "rows 3 ends where row 2 ends");
});

test("layout: a bidirectional pair gets two different, parallel paths", () => {
  const doc = mini(["a", "b"], [["a", "b"], ["b", "a", "ctrl"]]);
  const L = layoutWalkthrough(doc);
  assert.notEqual(L.edges.e0.d, L.edges.e1.d);
  assert.match(L.edges.e0.d, /^M[\d.]+ ([\d.]+) H[\d.]+$/);
  const y0 = +L.edges.e0.d.split(" ")[1];
  const y1 = +L.edges.e1.d.split(" ")[1];
  assert.equal(Math.abs(y0 - y1), 2 * GEOMETRY_WT.bidi);
});

test("layout: same lane adjacent rows are a straight V; skipping a row detours around the side", () => {
  const doc = mini([{ id: "a", lane: 0 }, { id: "b", lane: 0 }, { id: "c", lane: 0 }], [["a", "b", "text"], ["a", "c", "text"], ["b", "c", "text"]]);
  const L = layoutWalkthrough(doc);
  assert.match(L.edges.e0.d, / V[\d.]+$/);
  assert.match(L.edges.e1.d, / C/);
  const xs = samplePath(L.edges.e1.d).map((p) => p[0]);
  const side = L.nodes.a.x + L.nodes.a.w;
  assert.ok(Math.max(...xs) > side || Math.min(...xs) < L.nodes.a.x, "bulges out of the lane");
  assert.ok(!L.issues.some((i) => i.code === "W_EDGE_CROSSES_NODE"));
});

test("layout: route via / sides / d are honoured", () => {
  const doc = mini(["a", "b"], [["a", "b"]]);
  doc.edges[0].route = { via: [[300, 20]] };
  assert.match(layoutWalkthrough(doc).edges.e0.d, /Q300 20 /);
  doc.edges[0].route = { from_side: "bottom", to_side: "bottom" };
  const L = layoutWalkthrough(doc);
  assert.ok(L.edges.e0.d.startsWith(`M${L.nodes.a.x + L.nodes.a.w / 2} ${L.nodes.a.y + L.nodes.a.h}`), L.edges.e0.d);
  doc.edges[0].route = { d: "M1 2 L3 4" };
  assert.equal(layoutWalkthrough(doc).edges.e0.d, "M1 2 L3 4");
});

test("layout: an edge whose curve would cross a node is routed around it through the gaps", () => {
  const doc = mini(["a", "b", "c"], [["a", "b"], ["b", "c"], ["a", "c", "ctrl"]]);
  const L = layoutWalkthrough(doc);
  assert.ok(!L.issues.some((i) => i.code === "W_EDGE_CROSSES_NODE"));
  assert.match(L.edges.e2.d, / Q/, "an orthogonal detour with rounded corners");
  const ys = samplePath(L.edges.e2.d).map((p) => p[1]);
  assert.ok(Math.min(...ys) < L.nodes.b.y || Math.max(...ys) > L.nodes.b.y + L.nodes.b.h, "it leaves the row of b");
  // a stack of nodes in one row with an edge from the first to the last
  const ids = "pqrst".split("");
  const row = mini(ids.map((id, i) => ({ id, lane: i, row: 0 })), [...ids.slice(1).map((id, i) => [ids[i], id]), ["p", "t", "ctrl"]]);
  assert.ok(!layoutWalkthrough(row).issues.some((i) => i.code === "W_EDGE_CROSSES_NODE"));
});

test("layout: a manual via through a node still warns, and the warning points at iad layout", () => {
  const doc = mini(["a", "b", "c"], [["a", "b"], ["b", "c"], ["a", "c", "ctrl"]]);
  const L0 = layoutWalkthrough(doc);
  const b = L0.nodes.b;
  doc.edges[2].route = { via: [[b.x + b.w / 2, b.y + b.h / 2]] };
  const w = validate(doc).warnings.find((x) => x.code === "W_EDGE_CROSSES_NODE");
  assert.ok(w);
  assert.match(w.message, /iad layout/);
  assert.match(w.message, /route\.via/);
});

test("routeAround: returns an axis-aligned path between the ports, or null when boxed in", () => {
  const boxes = [{ x: 0, y: 0, w: 100, h: 50 }, { x: 200, y: 0, w: 100, h: 50 }, { x: 400, y: 0, w: 100, h: 50 }];
  const r = routeAround([100, 25], "right", [400, 25], "left", boxes, [150, 350], [-30, 80]);
  assert.ok(r && r.length >= 4);
  for (let i = 1; i < r.length; i++) assert.ok(r[i][0] === r[i - 1][0] || r[i][1] === r[i - 1][1], "orthogonal");
  assert.deepEqual(r[0], [100, 25]);
  assert.deepEqual(r[r.length - 1], [400, 25]);
  const wall = [{ x: 0, y: 0, w: 100, h: 50 }, { x: 110, y: -1000, w: 20, h: 3000 }, { x: 400, y: 0, w: 100, h: 50 }];
  assert.equal(routeAround([100, 25], "right", [400, 25], "left", wall, [], []), null);
});
test("layout: overlapping nodes or groups are E_LAYOUT_OVERLAP", () => {
  const nodes = mini([{ id: "a", x: 0, y: 0 }, { id: "b", x: 50, y: 20 }], [["a", "b"]]);
  assert.ok(validate(nodes).errors.some((e) => e.code === "E_LAYOUT_OVERLAP"));
  const groups = mini([{ id: "a", lane: 0, group: "g1" }, { id: "b", lane: 1, group: "g2" }, { id: "c", lane: 2, group: "g1" }], [["a", "b"], ["b", "c"]], {
    groups: [{ id: "g1", title: "G1" }, { id: "g2", title: "G2" }],
  });
  assert.ok(validate(groups).errors.some((e) => e.code === "E_LAYOUT_OVERLAP" && e.path === "/groups/1"));
});

test("layout: fully automatic documents keep each group in its own block of lanes", () => {
  // the same interleaved graph without explicit lanes: groups are compacted, no overlap
  const doc = mini([{ id: "a", group: "g1" }, { id: "b", group: "g2" }, { id: "c", group: "g1" }], [["a", "b"], ["b", "c"]], {
    groups: [{ id: "g1", title: "G1" }, { id: "g2", title: "G2" }],
  });
  const L = layoutWalkthrough(doc);
  assert.deepEqual(L.issues.filter((i) => i.code.startsWith("E_")), []);
  const [g1, g2] = L.groups;
  assert.ok(g1.x + g1.w <= g2.x || g2.x + g2.w <= g1.x, "group boxes do not overlap");
});

test("layout: badges sit at the first edge's middle; a second badge on the same edge moves to a clear spot", () => {
  const doc = mini(["a", "b"], [["a", "b"]]);
  doc.scenarios[0].steps.push({ ...doc.scenarios[0].steps[0], title: "again" });
  doc.scenarios[0].steps.push({ ...doc.scenarios[0].steps[0], title: "node", edges: [], nodes: ["b"] });
  const L = layoutWalkthrough(doc);
  const [p1, p2, p3] = L.badges.s;
  assert.deepEqual(p1, L.edges.e0.badgeAt);
  assert.ok(Math.hypot(p1.x - p2.x, p1.y - p2.y) >= 2 * GEOMETRY_WT.badgeR + GEOMETRY_WT.badgeGap);
  // a node-only step's badge goes top left, away from the error marker (top right)
  assert.deepEqual(p3, { x: L.nodes.b.x + 4, y: L.nodes.b.y + 4 });
});

test("samplePath / pointAtHalf: lines, curves and the middle point", () => {
  const mid = pointAtHalf(samplePath("M0 0 H100"));
  assert.deepEqual([Math.round(mid.x), Math.round(mid.y), Math.round(mid.length)], [50, 0, 100]);
  const c = pointAtHalf(samplePath("M0 0 C50 0 50 100 100 100"));
  assert.ok(Math.abs(c.x - 50) < 1 && Math.abs(c.y - 50) < 1);
  assert.ok(samplePath("M0 0 L10 0 Q20 0 20 10 V20 Z").length > 5);
});

test("layout: the shared test fixture is warning-free and within its viewBox", () => {
  const L = layoutWalkthrough(clone(FIXTURE));
  assert.deepEqual(L.issues, []);
  const [vx, vy, vw, vh] = L.viewBox;
  for (const b of Object.values(L.nodes)) assert.ok(b.x >= vx && b.y >= vy && b.x + b.w <= vx + vw && b.y + b.h <= vy + vh);
});

test("layout: a fully automatic chain longer than maxAutoLanes folds downward instead of running right", () => {
  const ids = "abcdefghij".split("");
  const doc = mini(ids, ids.slice(1).map((id, i) => [ids[i], id, i % 2 ? "text" : "file"]));
  const L = layoutWalkthrough(doc);
  assert.equal(L.lanes.length, GEOMETRY_WT.maxAutoLanes);
  // flow order is kept: within a lane, a later node never sits above an earlier one
  for (let i = 1; i < ids.length; i++) {
    const p = L.nodes[ids[i - 1]];
    const q = L.nodes[ids[i]];
    assert.ok(q.lane > p.lane || (q.lane === p.lane && q.row > p.row), `${ids[i]} after ${ids[i - 1]}`);
  }
  assert.deepEqual(L.issues.filter((i) => i.code === "W_EDGE_CROSSES_NODE"), []);
  // a chain that fits is not folded
  const five = mini(ids.slice(0, 6), ids.slice(1, 6).map((id, i) => [ids[i], id]));
  assert.deepEqual(ids.slice(0, 6).map((id) => layoutWalkthrough(five).nodes[id].lane), [0, 1, 2, 3, 4, 5]);
});

test("layout: folding only merges lanes of the same group, so group boxes stay apart", () => {
  const ids = "abcdefgh".split("");
  const doc = mini(
    ids.map((id, i) => ({ id, group: i < 4 ? "g1" : "g2" })),
    ids.slice(1).map((id, i) => [ids[i], id]),
    { groups: [{ id: "g1", title: "G1" }, { id: "g2", title: "G2" }] }
  );
  const L = layoutWalkthrough(doc);
  assert.ok(L.lanes.length <= GEOMETRY_WT.maxAutoLanes);
  for (const id of ids) {
    const other = ids.filter((x) => doc.nodes.find((n) => n.id === x).group !== doc.nodes.find((n) => n.id === id).group);
    for (const o of other) assert.notEqual(L.nodes[id].lane, L.nodes[o].lane, `${id} / ${o}`);
  }
  assert.deepEqual(L.issues.filter((i) => i.code.startsWith("E_")), []);
});

test("layout: a node without edges sits with its group instead of pulling it to lane 0", () => {
  const doc = mini(
    [{ id: "a" }, { id: "b" }, { id: "c", group: "g" }, { id: "lonely", group: "g" }],
    [["a", "b"], ["b", "c"]],
    { groups: [{ id: "g", title: "G" }] }
  );
  const L = layoutWalkthrough(doc);
  assert.equal(L.nodes.lonely.lane, L.nodes.c.lane);
  assert.ok(L.nodes.c.lane > L.nodes.b.lane, "the group stays to the right of its callers");
  doc.nodes[0].lane = 0; // explicit-lane mode too
  assert.equal(layoutWalkthrough(doc).nodes.lonely.lane, layoutWalkthrough(doc).nodes.c.lane);
});

test("text width: calibrated to the embedded fonts (Hangul ~0.86em, Latin ~0.5em), still catches real overflow", () => {
  // measured in the browser: "합계 상한 + PII 마스킹" 13px bold = 114px, "외부 파싱 (원본 외부 전송)" 11px = 114px
  const title = textWidthWt("합계 상한 + PII 마스킹", 13, { bold: true });
  const sub = textWidthWt("외부 파싱 (원본 외부 전송)", 11);
  assert.ok(title >= 114 && title <= 114 * 1.15, `title estimate ${title}`);
  assert.ok(sub >= 114 && sub <= 114 * 1.15, `sub estimate ${sub}`);
  assert.ok(textWidthWt("abcdefghij", 10, { mono: true }) >= 60, "mono 0.6em");
  // a lane sized by a text never flags that same text (widths are rounded up, not down)
  const doc = mini([{ id: "a", title: "합계 상한 + PII 마스킹 단계" }, "b"], [["a", "b"]]);
  assert.ok(!codes(doc).includes("W_TEXT_LONG"));
  // text wider than the widest lane is still reported
  doc.nodes[0].title = "아주 긴 제목이 들어가서 가장 넓은 레인보다도 더 넓어지는 경우";
  assert.ok(codes(doc).includes("W_TEXT_LONG"));
  assert.ok(textWidthWt(doc.nodes[0].title, TEXT_WT.title.px, TEXT_WT.title) > GEOMETRY_WT.laneMax);
});

test("layout: parallel edges in the same direction get separate paths", () => {
  const doc = mini(["a", "b"], [["a", "b", "file"], ["a", "b", "ctrl"]]);
  const L = layoutWalkthrough(doc);
  assert.notEqual(L.edges.e0.d, L.edges.e1.d);
  const y = (d) => +d.split(" ")[1];
  assert.equal(Math.abs(y(L.edges.e0.d) - y(L.edges.e1.d)), 2 * GEOMETRY_WT.bidi);
  // three in one slot: evenly spread, both ends of each edge share an offset (straight lines)
  const three = mini(["a", "b"], [["a", "b"], ["b", "a", "ctrl"], ["a", "b", "text"]]);
  const ds = Object.values(layoutWalkthrough(three).edges).map((e) => e.d);
  assert.equal(new Set(ds).size, 3);
  for (const d of ds) assert.match(d, /^M[\d.]+ [\d.]+ H[\d.]+$/);
});

test("layout: fully automatic span reserves its lanes (no overlap, also when folding)", () => {
  const doc = mini([{ id: "a" }, { id: "wide", span: 2 }, { id: "b" }, { id: "c" }], [["a", "wide"], ["a", "b"], ["b", "c"], ["wide", "c", "ctrl"]]);
  const L = layoutWalkthrough(doc);
  assert.deepEqual(L.issues.filter((i) => i.code === "E_LAYOUT_OVERLAP"), []);
  assert.equal(L.nodes.wide.x + L.nodes.wide.w, L.lanes[L.nodes.wide.lane + 1].x + L.lanes[L.nodes.wide.lane + 1].w);
  const ids = "abcdefghij".split("");
  const long = mini(ids.map((id, i) => (i === 3 ? { id, span: 3 } : id)), ids.slice(1).map((id, i) => [ids[i], id]));
  const F = layoutWalkthrough(long);
  assert.deepEqual(F.issues.filter((i) => i.code === "E_LAYOUT_OVERLAP"), []);
  assert.ok(F.nodes.d.lane + 3 <= F.lanes.length, "the span stays inside the map");
});

test("layout: an x/y node with a lane neither switches off automatic layout nor pushes other ranks", () => {
  const ids = "abcdefgh".split("");
  const base = mini(ids, ids.slice(1).map((id, i) => [ids[i], id]));
  const auto = layoutWalkthrough(base);
  const doc = clone(base);
  doc.nodes.push({ id: "m", kind: "app", title: "M", facts: ["f"], x: 2000, y: 600, lane: 9 });
  doc.edges.push({ id: "em", from: "m", to: "a", kind: "file" });
  doc.scenarios[0].steps[0].edges.push("em");
  const L = layoutWalkthrough(doc);
  assert.equal(L.lanes.length, auto.lanes.length, "still folded to maxAutoLanes");
  for (const id of ids) assert.deepEqual([L.nodes[id].lane, L.nodes[id].row], [auto.nodes[id].lane, auto.nodes[id].row], id);
  assert.ok(codes(doc).includes("W_POS_IGNORED"));
});

test("route.d grammar: whole argument groups of finite numbers, M first", () => {
  for (const d of ["M0 0 L5 5", "M0,0 C1 2 3 4 5 6", "M0 0 H5 V5 L1 1 2 2 Z", "M0 0 Q1 1 2 2", "M-1.5 .5 L1e2 -3"]) assert.equal(isValidPath(d), true, d);
  for (const d of ["M", "M0 0 L10", "M0 0 LEE 5 5", "M0 0 L1e400 0", "M0 0 L 5 5 Z 3", "L0 0", "m0 0 l1 1", "M0 0 A5 5 0 0 1 9 9", "M0 0 C1 2 3 4", "M0 0 L200000 0", ""]) {
    assert.equal(isValidPath(d), false, d);
  }
});

test("samplePath: bounded work for huge or broken coordinates", () => {
  const t0 = Date.now();
  assert.ok(samplePath("M0 0 L1e9 0").length <= 513);
  assert.equal(samplePath("M0 0 L1e400 0").length, 1, "non-finite segment skipped");
  assert.ok(Date.now() - t0 < 200);
});

test("layout: an explicit h shorter than the content is reported", () => {
  const doc = mini([{ id: "a", h: 40, sub: ["one", "two", "three"] }, "b"], [["a", "b"]]);
  assert.ok(validate(doc).warnings.some((w) => w.code === "W_TEXT_LONG" && w.path === "/nodes/0/h"));
  doc.gauges = [{ id: "g", node: "b", caption: "now" }];
  doc.nodes[0].h = undefined;
  delete doc.nodes[0].h;
  doc.nodes[1].h = 70;
  doc.scenarios[0].steps[0].gauges = { g: { value: 1, label: "full" } };
  assert.ok(validate(doc).warnings.some((w) => w.code === "W_TEXT_LONG" && w.path === "/nodes/1/h"), "gauge does not fit");
});

// ---- lane hints on an otherwise automatic map ------------------------------------------------
const grouped = () =>
  mini(
    [
      { id: "u", group: "g1" }, { id: "v", group: "g1" },
      { id: "w", group: "g2" }, { id: "x", group: "g2" }, { id: "y", group: "g2" },
      { id: "z", group: "g3" },
    ],
    [["u", "v"], ["v", "w"], ["w", "x"], ["x", "y"], ["y", "z"]],
    { groups: [{ id: "g1", title: "G1" }, { id: "g2", title: "G2" }, { id: "g3", title: "G3" }] }
  );
const groupsApart = (L) => {
  for (let a = 0; a < L.groups.length; a++)
    for (let b = a + 1; b < L.groups.length; b++) {
      const p = L.groups[a];
      const q = L.groups[b];
      assert.ok(p.x + p.w <= q.x || q.x + q.w <= p.x || p.y + p.h <= q.y || q.y + q.h <= p.y, `${p.id} / ${q.id}`);
    }
};

test("lane hints: one hinted node keeps its lane, the rest stays automatic and valid", () => {
  const doc = grouped();
  const auto = layoutWalkthrough(doc);
  doc.nodes[3].lane = 4; // x, inside g2's own block (lanes 2..4)
  const L = layoutWalkthrough(doc);
  assert.equal(L.nodes.x.lane, 4);
  assert.deepEqual(validate(doc).errors, []);
  for (const id of ["u", "v", "z"]) assert.equal(L.nodes[id].lane, auto.nodes[id].lane, id);
  groupsApart(L);
});

test("lane hints: mixed lane and row hints combine; un-hinted nodes are still placed around them", () => {
  const doc = grouped();
  doc.nodes[0].lane = 0;
  doc.nodes[0].row = 2;
  doc.nodes[5].lane = 7; // z beyond the map: g3 grows to reach it
  doc.nodes[4].row = 1;
  const L = layoutWalkthrough(doc);
  assert.deepEqual([L.nodes.u.lane, L.nodes.u.row, L.nodes.z.lane, L.nodes.y.row], [0, 2, 7, 1]);
  assert.deepEqual(validate(doc).errors, []);
  groupsApart(L);
});

test("lane hints: a hint into another group's lane moves the groups instead of overlapping them", () => {
  const doc = grouped();
  doc.nodes[5].lane = 1; // z (g3) into g1's lane 1
  const L = layoutWalkthrough(doc);
  assert.equal(L.nodes.z.lane, 1);
  assert.deepEqual(validate(doc).errors, []);
  groupsApart(L);
  // an ungrouped node hinted into a group's lane gets its own column there
  const d2 = grouped();
  d2.nodes.push({ id: "solo", kind: "app", title: "SOLO", facts: ["f"], lane: 3 });
  d2.edges.push({ id: "es", from: "y", to: "solo", kind: "ctrl" });
  d2.scenarios[0].steps[0].edges.push("es");
  const L2 = layoutWalkthrough(d2);
  assert.equal(L2.nodes.solo.lane, 3);
  assert.deepEqual(validate(d2).errors, []);
  groupsApart(L2);
});

test("lane hints: overlap errors say which node or group collides, and where", () => {
  const doc = mini([{ id: "a", lane: 0, row: 0 }, { id: "b", lane: 0, row: 0 }], [["a", "b"]]);
  const [e] = validate(doc).errors;
  assert.equal(e.code, "E_LAYOUT_OVERLAP");
  assert.match(e.message, /node "b" at lane 0, row 0 \(hinted\) overlaps node "a" at lane 0, row 0/);
  const g = mini([{ id: "a", lane: 0, group: "g1" }, { id: "b", lane: 1, group: "g2" }, { id: "c", lane: 2, group: "g1" }], [["a", "b"], ["b", "c"]], {
    groups: [{ id: "g1", title: "G1" }, { id: "g2", title: "G2" }],
  });
  const msgs = validate(g).errors.map((x) => x.message).join("\n");
  assert.match(msgs, /group "g2" \(lanes 1, rows 0\) overlaps group "g1" \(lanes 0-2, rows 0\)/);
  assert.match(msgs, /node "b" at lane 1, row 0 \(hinted\) lies inside the box of group "g1"/);
});

// ---- iad layout ----------------------------------------------------------------------------
test("CLI layout: prints lanes, gaps, node boxes and edge paths; --json has the same data", async () => {
  const { spawnSync } = await import("node:child_process");
  const CLI = join(ROOT, "skills/interactive-architecture-doc/scripts/iad.mjs");
  const FX = join(ROOT, "test/fixtures/walkthrough.en.json");
  const run = (...a) => spawnSync(process.execPath, [CLI, ...a], { encoding: "utf8" });
  const t = run("layout", FX);
  assert.equal(t.status, 0, t.stderr);
  assert.match(t.stdout, /^lane gaps \(x, free for route\.via\): 210, /m);
  assert.match(t.stdout, /^ {2}browser {2}0 0 {2}40 70 140 64$/m);
  assert.match(t.stdout, /^ {2}up {2}M180 94 H240$/m);
  const j = JSON.parse(run("layout", FX, "--json").stdout);
  const L = layoutWalkthrough(clone(FIXTURE));
  assert.deepEqual(j.nodes.disk, { lane: L.nodes.disk.lane, row: L.nodes.disk.row, x: L.nodes.disk.x, y: L.nodes.disk.y, w: L.nodes.disk.w, h: L.nodes.disk.h });
  assert.equal(j.edges.up.d, L.edges.up.d);
  assert.deepEqual(j.viewBox, L.viewBox);
  // invalid documents exit 1 with their errors; overview documents and bad usage exit 2
  const bad = mini(["a", "b"], [["a", "b"]]);
  bad.edges[0].to = "ghost";
  const { writeFileSync, mkdtempSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const dir = mkdtempSync(join(tmpdir(), "iad-layout-"));
  try {
    writeFileSync(join(dir, "bad.json"), JSON.stringify(bad));
    const r = run("layout", join(dir, "bad.json"));
    assert.equal(r.status, 1);
    assert.match(r.stdout, /E_NODE_UNKNOWN/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  assert.equal(run("layout", join(ROOT, "skills/interactive-architecture-doc/examples/request-router.overview.en.json")).status, 2);
  assert.equal(run("layout").status, 2);
});

test("layout: badges of a bidirectional pair stay apart and clear of node boxes", () => {
  const doc = mini(["a", "b", "c"], [["a", "b"], ["b", "c"], ["b", "a", "ctrl"]]);
  doc.scenarios[0].steps = ["e0", "e1", "e2"].map((id, i) => ({ ...doc.scenarios[0].steps[0], title: `s${i}`, edges: [id] }));
  const L = layoutWalkthrough(doc);
  const [p0, , p2] = L.badges.s;
  const min = 2 * GEOMETRY_WT.badgeR + GEOMETRY_WT.badgeGap;
  assert.ok(Math.hypot(p0.x - p2.x, p0.y - p2.y) >= min, JSON.stringify([p0, p2]));
  for (const p of L.badges.s) {
    for (const b of Object.values(L.nodes)) {
      const inside = p.x > b.x - GEOMETRY_WT.badgeR && p.x < b.x + b.w + GEOMETRY_WT.badgeR && p.y > b.y - GEOMETRY_WT.badgeR && p.y < b.y + b.h + GEOMETRY_WT.badgeR;
      assert.ok(!inside, `badge ${JSON.stringify(p)} on a node`);
    }
  }
});

test("layout: detours sharing a lane or row gap are spread apart instead of stacking", () => {
  const doc = mini(["a", "b", "c"], [["a", "b"], ["b", "c"], ["a", "c", "ctrl"], ["c", "a", "ctrl"], ["a", "c", "text"]]);
  const L = layoutWalkthrough(doc);
  assert.ok(!L.issues.some((i) => i.code === "W_EDGE_CROSSES_NODE"));
  // the long horizontal run of each detour (outside the row of b)
  const run = (d) => {
    const pts = samplePath(d, 1000);
    const ys = new Map();
    for (let i = 1; i < pts.length; i++) if (Math.abs(pts[i][1] - pts[i - 1][1]) < 0.01 && Math.abs(pts[i][0] - pts[i - 1][0]) > 100) ys.set(Math.round(pts[i][1] * 10) / 10, true);
    return [...ys.keys()];
  };
  const lines = ["e2", "e3", "e4"].flatMap((id) => run(L.edges[id].d));
  assert.equal(lines.length, 3, JSON.stringify(lines));
  const sorted = [...lines].sort((p, q) => p - q);
  for (let i = 1; i < sorted.length; i++) assert.ok(sorted[i] - sorted[i - 1] >= 5, `lines ${JSON.stringify(sorted)} stack`);
});
