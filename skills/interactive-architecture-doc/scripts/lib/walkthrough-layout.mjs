// Walkthrough style: deterministic geometry for the component map.
// Pure (no I/O). The validator uses it for overlap / crossing / fit checks, walkthrough-svg.mjs for
// the static SVG. Nodes sit on a lane (column) x row grid unless they carry absolute x/y; edges are
// routed between side ports; step badges sit at the middle of each step's first edge.


// Spacing derived from the hand-made reference map (lanes 140..240 wide, rows 64 high with a 36 gap).
export const GEOMETRY_WT = {
  pad: 24, // viewBox padding around everything
  laneMin: 140,
  laneMax: 240,
  textPad: 24, // node text inset, left + right
  laneGap: 60,
  groupGap: 20, // extra lane gap where the set of groups changes
  rowGap: 36,
  nodeH: 64,
  titleY: 22, // baselines, relative to the node top
  monoStep: 17,
  subStep: 16,
  lineStep: 16,
  lineFirst: 20,
  textBottom: 9,
  gaugeGap: 14,
  gaugeMinH: 48,
  gaugeSide: 20,
  gaugeCaption: 28, // caption line under the gauge, including bottom padding
  gaugeBottom: 12,
  groupTop: 36, // group box inset above its members: title only
  groupTopMeta: 46, // title + meta line
  groupSide: 16,
  groupBottom: 16,
  detour: 36, // how far a same-side detour bulges out
  bidi: 8, // offset of each edge of a bidirectional pair
  portGap: 20, // minimum distance between port slots on one side
  radius: 8, // corner radius of `via` polylines
  badgeNudge: 20,
  badgeR: 9.5,
  badgeGap: 3, // minimum clear space between two badges, and between a badge and a node box
  badgeOff: 14, // sideways offset from the path when the path itself has no room
  maxAutoLanes: 6, // fully automatic maps fold into at most this many lanes (about the stage's aspect)
};

// Text styles shared with the template CSS (.wt-map .node .nt / .nm / .ns / .nl, .grp .gt / .gm).
export const TEXT_WT = {
  title: { px: 13, bold: true },
  mono: { px: 10.5, mono: true },
  sub: { px: 11 },
  line: { px: 10.5, mono: true },
  groupTitle: { px: 12.5, bold: true },
  groupMeta: { px: 10.5, mono: true },
};
// Advance widths in em, measured from the embedded fonts (IAD Sans, Geist Mono) and rounded up a
// little so real overflow is still caught: Hangul/CJK 0.864 measured, Latin lowercase 0.47-0.49,
// uppercase 0.61, digits 0.58, mono 0.60. The overview keeps its own, more conservative textWidth.
const WIDE_RE = /[\u1100-\u115f\u2e80-\u303e\u3041-\u33ff\u3400-\u4dbf\u4e00-\u9fff\ua960-\ua97f\uac00-\ud7a3\uf900-\ufaff\ufe30-\ufe4f\uff00-\uff60\uffe0-\uffe6]/;
export function textWidthWt(s, px, { mono = false, bold = false } = {}) {
  let em = 0;
  for (const ch of String(s)) {
    if (WIDE_RE.test(ch)) em += 0.9;
    else if (mono) em += 0.61;
    else if (ch === " ") em += 0.28;
    else if (/[A-Z]/.test(ch)) em += bold ? 0.66 : 0.63;
    else if (/[0-9]/.test(ch)) em += 0.6;
    else if (/[.,:;'`·|!()[\]{}]/.test(ch)) em += 0.36;
    else em += bold ? 0.55 : 0.52;
  }
  return em * px;
}
const measure = (s, style) => textWidthWt(s, style.px, style);
export const lineText = (l) => (typeof l === "string" ? l : l.text);

export const SIDES = ["top", "right", "bottom", "left"];
const NORMAL = { top: [0, -1], right: [1, 0], bottom: [0, 1], left: [-1, 0] };
const OPPOSITE = { top: "bottom", bottom: "top", left: "right", right: "left" };
const isHorizontal = (side) => side === "left" || side === "right";

const round = (n) => Math.round(n * 10) / 10;
const fmt = (n) => String(round(n));

// ---- node content -----------------------------------------------------------
// Baselines of every text line plus the gauge box, relative to the node top. Shared with the SVG
// writer so both agree on where things are.
export function nodeContent(n, hasGauge, h) {
  const G = GEOMETRY_WT;
  let cursor = G.titleY;
  const out = { title: cursor, mono: null, sub: [], lines: [], gauge: null };
  if (n.mono !== undefined) out.mono = cursor += G.monoStep;
  (n.sub || []).forEach(() => out.sub.push((cursor += G.subStep)));
  (n.lines || []).forEach((_, i) => out.lines.push((cursor += i === 0 ? G.lineFirst : G.lineStep)));
  let natural = cursor + G.textBottom;
  if (hasGauge) {
    const top = cursor + G.gaugeGap;
    const tail = hasGauge.caption ? G.gaugeCaption : G.gaugeBottom;
    natural = top + G.gaugeMinH + tail;
    const gh = Math.max(G.gaugeMinH, (h ?? natural) - top - tail);
    out.gauge = { top, h: gh, caption: hasGauge.caption ? top + gh + 18 : null };
  }
  out.natural = Math.max(G.nodeH, natural);
  return out;
}

function naturalWidth(n) {
  const G = GEOMETRY_WT;
  const widths = [measure(n.title, TEXT_WT.title)];
  if (n.mono !== undefined) widths.push(measure(n.mono, TEXT_WT.mono));
  for (const s of n.sub || []) widths.push(measure(s, TEXT_WT.sub));
  for (const l of n.lines || []) widths.push(measure(lineText(l), TEXT_WT.line));
  return Math.max(...widths) + G.textPad;
}
const clampLane = (w) => Math.min(GEOMETRY_WT.laneMax, Math.max(GEOMETRY_WT.laneMin, Math.ceil(w)));

// ---- lanes ------------------------------------------------------------------
// 1. Longest-path rank over file/text edges (ctrl edges are replies and side channels). Cycles are
//    broken by a DFS in nodes[] order. A node with an explicit lane keeps it; successors rank after it.
// 2. A node with no file/text predecessor that is the target of a ctrl edge stacks in the lane of
//    that ctrl source (a check before the data path, as in "middleware -> lease -> receiver").
// 3. Fully automatic documents (no explicit lane anywhere) are compacted per group: each group gets
//    a contiguous block of lanes, blocks ordered by their lowest rank, so group boxes never interleave.
function dfsOrder(ids, out) {
  const state = new Map();
  const kept = new Map(ids.map((id) => [id, []]));
  const order = [];
  for (const start of ids) {
    if (state.has(start)) continue;
    const stack = [[start, 0]];
    state.set(start, 1);
    while (stack.length) {
      const top = stack[stack.length - 1];
      const next = out.get(top[0])[top[1]];
      if (next === undefined) {
        state.set(top[0], 2);
        order.push(top[0]);
        stack.pop();
        continue;
      }
      top[1]++;
      if (state.get(next) === 1) continue; // back edge: dropped
      kept.get(top[0]).push(next);
      if (!state.has(next)) {
        state.set(next, 1);
        stack.push([next, 0]);
      }
    }
  }
  return { order: order.reverse(), kept };
}

function computeLanes(doc) {
  const ids = doc.nodes.map((n) => n.id);
  const byId = Object.fromEntries(doc.nodes.map((n) => [n.id, n]));
  // x/y nodes sit outside the grid: they neither pin lanes nor push their successors' ranks
  const manual = (id) => typeof byId[id].x === "number" && typeof byId[id].y === "number";
  const hinted = (id) => Number.isInteger(byId[id].lane) && !manual(id);
  // every grid node has a lane: the author placed them all, lanes are used as given. Otherwise lane
  // hints are constraints applied after the automatic layout (applyLaneHints).
  const grid = ids.filter((id) => !manual(id));
  const allHinted = grid.length > 0 && grid.every(hinted);
  const fixed = (id) => allHinted && hinted(id);
  // file/text edges rank +1; ctrl edges into a node without file/text predecessors rank +0
  const dataIn = new Set();
  for (const e of doc.edges) if (e.kind !== "ctrl" && e.from !== e.to && !manual(e.from)) dataIn.add(e.to);
  const out = new Map(ids.map((id) => [id, []]));
  const weight = new Map();
  for (const e of doc.edges) {
    if (e.from === e.to || manual(e.from) || manual(e.to)) continue;
    const w = e.kind !== "ctrl" ? 1 : !dataIn.has(e.to) ? 0 : null;
    if (w === null) continue;
    const key = e.from + "\u0000" + e.to;
    if (!weight.has(key)) out.get(e.from).push(e.to);
    weight.set(key, Math.max(weight.get(key) ?? 0, w));
  }
  const { order, kept } = dfsOrder(ids, out);
  const rank = new Map();
  for (const id of ids) if (fixed(id)) rank.set(id, byId[id].lane);
  for (const id of order) {
    if (!rank.has(id)) rank.set(id, 0);
    for (const next of kept.get(id)) {
      if (fixed(next)) continue;
      const r = rank.get(id) + weight.get(id + "\u0000" + next);
      if (!rank.has(next) || rank.get(next) < r) rank.set(next, r);
    }
  }
  // a node with no edge at all sits with its group (lowest lane of its connected siblings)
  const linked = new Set();
  for (const e of doc.edges) linked.add(e.from).add(e.to);
  for (const n of doc.nodes) {
    if (fixed(n.id) || linked.has(n.id) || !n.group) continue;
    const sib = doc.nodes.filter((m) => m.group === n.group && linked.has(m.id)).map((m) => rank.get(m.id));
    if (sib.length) rank.set(n.id, Math.min(...sib));
  }
  if (allHinted) return { lane: rank, order: null }; // author-placed lanes: rows in nodes[] order

  // fully automatic: blocks = groups, and ungrouped nodes of the same rank
  const blocks = new Map();
  for (const n of doc.nodes) {
    if (manual(n.id)) continue;
    const key = n.group ? "g:" + n.group : "r:" + rank.get(n.id);
    if (!blocks.has(key)) blocks.set(key, { ranks: new Set(), linked: [], first: blocks.size, ids: [], group: n.group || "" });
    const b = blocks.get(key);
    // a node spanning s lanes reserves ranks r..r+s-1 in its block
    for (let k = 0; k < (n.span || 1); k++) b.ranks.add(rank.get(n.id) + k);
    b.ids.push(n.id);
    if (linked.has(n.id)) b.linked.push(rank.get(n.id));
  }
  const list = [...blocks.values()];
  // a block is placed by its connected nodes; an isolated member (rank 0) must not pull it left
  for (const b of list) b.min = b.linked.length ? Math.min(...b.linked) : Math.min(...b.ranks);
  list.sort((p, q) => p.min - q.min || p.first - q.first);
  const compact = new Map();
  const lanes = []; // per lane: {group, ids}
  for (const b of list) {
    const used = [...b.ranks].sort((p, q) => p - q); // empty ranks inside a block are dropped
    used.forEach(() => lanes.push({ group: b.group, ids: [] }));
    const base = lanes.length - used.length;
    for (const id of b.ids) {
      const l = base + used.indexOf(rank.get(id));
      compact.set(id, l);
      lanes[l].ids.push(id);
    }
  }
  // fold: while too wide, merge the two neighbouring lanes of the same group (or both ungrouped)
  // with the fewest nodes; the right lane's nodes stack under the left one's, so a long chain turns
  // downward (as hand-made maps do) instead of running off to the right.
  const spanOf = (id) => byId[id].span || 1;
  while (lanes.length > GEOMETRY_WT.maxAutoLanes) {
    // lanes covered by a spanning node stay as they are (a merge would change what it spans)
    const locked = new Set();
    lanes.forEach((l, i) => l.ids.forEach((id) => {
      if (spanOf(id) > 1) for (let k = 0; k < spanOf(id); k++) locked.add(i + k);
    }));
    let best = -1;
    for (let i = 0; i + 1 < lanes.length; i++) {
      if (lanes[i].group !== lanes[i + 1].group || locked.has(i) || locked.has(i + 1)) continue;
      const size = lanes[i].ids.length + lanes[i + 1].ids.length;
      if (best < 0 || size < lanes[best].ids.length + lanes[best + 1].ids.length) best = i;
    }
    if (best < 0) break;
    lanes[best].ids.push(...lanes[best + 1].ids);
    lanes.splice(best + 1, 1);
  }
  applyLaneHints(doc, lanes, grid.filter(hinted), byId);
  const lane = new Map();
  lanes.forEach((l, i) => l.ids.forEach((id) => lane.set(id, i)));
  return { lane, order: compact };
}

// Lane hints on a partly automatic map. Each hinted node ends up in exactly its lane; groups stay
// contiguous, so the columns around it move instead:
// - the lane is one of its group's columns (or an ungrouped column for an ungrouped node): it moves there;
// - the lane is right of its group: the group grows with empty columns up to that lane;
// - the lane is left of its group: the whole group moves to the nearest boundary at or before the
//   lane (never inside another group), then grows if needed;
// - an ungrouped node in another group's lane: new ungrouped columns are inserted at the nearest
//   boundary at or before the lane, pushing that group right.
// Hints are applied in lane order; boundaries left of an earlier hint are not used, so earlier
// hints keep their lanes.
function applyLaneHints(doc, cols, hintIds, byId) {
  if (!hintIds.length) return;
  for (const id of hintIds) {
    const c = cols.findIndex((col) => col.ids.includes(id));
    if (c >= 0) cols[c].ids.splice(cols[c].ids.indexOf(id), 1);
  }
  // drop columns left empty, unless they are part of a group run (they keep the run contiguous)
  for (let i = cols.length - 1; i >= 0; i--) if (!cols[i].ids.length) cols.splice(i, 1);
  const hints = hintIds.map((id) => ({ id, lane: byId[id].lane, group: byId[id].group || "" })).sort((p, q) => p.lane - q.lane);
  let floor = 0; // boundaries below this would shift an earlier hint
  const boundary = (i) => i === 0 || i === cols.length || !(cols[i - 1].group && cols[i - 1].group === cols[i].group);
  const lastBoundary = (max) => {
    for (let i = Math.min(max, cols.length); i >= floor; i--) if (boundary(i)) return i;
    return Math.min(Math.max(floor, 0), cols.length);
  };
  const empty = (group, n) => Array.from({ length: n }, () => ({ group, ids: [] }));
  for (const h of hints) {
    const L = h.lane;
    const run = h.group ? cols.map((c, i) => (c.group === h.group ? i : -1)).filter((i) => i >= 0) : [];
    if (L < cols.length && cols[L].group === h.group) {
      // its own group's column (or an ungrouped column)
    } else if (run.length && L > run[run.length - 1]) {
      const b = run[run.length - 1];
      cols.splice(b + 1, 0, ...empty(h.group, L - b));
    } else if (run.length) {
      const block = cols.splice(run[0], run.length);
      const p = lastBoundary(L);
      cols.splice(p, 0, ...block, ...empty(h.group, Math.max(0, L - (p + block.length - 1))));
    } else {
      const p = lastBoundary(L);
      cols.splice(p, 0, ...empty(h.group, L - p + 1));
    }
    cols[L].ids.push(h.id);
    floor = L + 1;
  }
}

// ---- path geometry ----------------------------------------------------------
// Parses an absolute path (M L H V C Q Z) into polyline samples. Used for badge positions, the
// crossing check and the viewBox; the runtime uses the browser's own path length for the token.
// Tokens of an absolute path; null when anything but commands M L H V C Q Z, numbers, spaces and
// commas appears.
const PATH_TOKEN_RE = /\s*,?\s*([MLHVCQZ]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)/y;
export function tokenizePath(d) {
  const src = String(d).trim();
  const out = [];
  PATH_TOKEN_RE.lastIndex = 0;
  while (PATH_TOKEN_RE.lastIndex < src.length) {
    const at = PATH_TOKEN_RE.lastIndex;
    const m = PATH_TOKEN_RE.exec(src);
    if (!m || m.index !== at) return null;
    out.push(m[1]);
  }
  return out;
}
const ARITY = { M: 2, L: 2, H: 1, V: 1, C: 6, Q: 4, Z: 0 };
// The grammar route.d must follow: starts with M; every command has a whole number (>= 1) of
// argument groups of its arity (Z none); every number is finite and within +-1e5.
export function isValidPath(d) {
  const t = tokenizePath(d);
  if (!t || t[0] !== "M") return false;
  let i = 0;
  while (i < t.length) {
    const cmd = t[i++];
    if (!Object.hasOwn(ARITY, cmd)) return false;
    let n = 0;
    while (i < t.length && !Object.hasOwn(ARITY, t[i])) {
      const v = Number(t[i++]);
      if (!Number.isFinite(v) || Math.abs(v) > MAX_COORD) return false;
      n++;
    }
    if (ARITY[cmd] === 0 ? n !== 0 : n === 0 || n % ARITY[cmd] !== 0) return false;
  }
  return true;
}
export const MAX_COORD = 1e5;
const MAX_SAMPLES = 512; // per segment: bounded work whatever the coordinates

export function samplePath(d, step = 4) {
  const tokens = tokenizePath(d) || [];
  const pts = [];
  let i = 0;
  let cmd = null;
  let x = 0;
  let y = 0;
  let sx = 0;
  let sy = 0;
  const num = () => Number(tokens[i++]);
  const line = (x2, y2) => {
    if (!Number.isFinite(x2) || !Number.isFinite(y2)) return; // malformed: skipped
    const n = Math.min(MAX_SAMPLES, Math.max(1, Math.ceil(Math.hypot(x2 - x, y2 - y) / step)));
    for (let k = 1; k <= n; k++) pts.push([x + ((x2 - x) * k) / n, y + ((y2 - y) * k) / n]);
    x = x2;
    y = y2;
  };
  while (i < tokens.length) {
    if (/^[A-Z]$/i.test(tokens[i])) cmd = tokens[i++].toUpperCase();
    if (cmd === "M") {
      x = sx = num();
      y = sy = num();
      pts.push([x, y]);
      cmd = "L";
    } else if (cmd === "L") line(num(), num());
    else if (cmd === "H") line(num(), y);
    else if (cmd === "V") line(x, num());
    else if (cmd === "C" || cmd === "Q") {
      const c = cmd === "C" ? [num(), num(), num(), num(), num(), num()] : [num(), num(), num(), num()];
      const [ex, ey] = c.slice(-2);
      const x0 = x;
      const y0 = y;
      const n = 32;
      for (let k = 1; k <= n; k++) {
        const t = k / n;
        const u = 1 - t;
        let px;
        let py;
        if (cmd === "C") {
          px = u * u * u * x0 + 3 * u * u * t * c[0] + 3 * u * t * t * c[2] + t * t * t * ex;
          py = u * u * u * y0 + 3 * u * u * t * c[1] + 3 * u * t * t * c[3] + t * t * t * ey;
        } else {
          px = u * u * x0 + 2 * u * t * c[0] + t * t * ex;
          py = u * u * y0 + 2 * u * t * c[1] + t * t * ey;
        }
        pts.push([px, py]);
      }
      x = ex;
      y = ey;
    } else if (cmd === "Z") {
      line(sx, sy);
      cmd = null;
    } else break; // malformed: stop (the validator rejects these before layout)
    if (tokens[i] === undefined) break;
  }
  return pts;
}

// Point and unit tangent at fraction f (0..1) of a sampled path's length.
export function pointAt(pts, f) {
  let total = 0;
  for (let k = 1; k < pts.length; k++) total += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
  let left = total * f;
  for (let k = 1; k < pts.length; k++) {
    const dx = pts[k][0] - pts[k - 1][0];
    const dy = pts[k][1] - pts[k - 1][1];
    const seg = Math.hypot(dx, dy);
    if (left <= seg && seg > 0) return { x: pts[k - 1][0] + (dx * left) / seg, y: pts[k - 1][1] + (dy * left) / seg, tx: dx / seg, ty: dy / seg };
    left -= seg;
  }
  const last = pts[pts.length - 1] || [0, 0];
  return { x: last[0], y: last[1], tx: 1, ty: 0 };
}

export function pointAtHalf(pts) {
  let total = 0;
  for (let k = 1; k < pts.length; k++) total += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
  let left = total / 2;
  for (let k = 1; k < pts.length; k++) {
    const seg = Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
    if (left <= seg && seg > 0) {
      const t = left / seg;
      return { x: pts[k - 1][0] + (pts[k][0] - pts[k - 1][0]) * t, y: pts[k - 1][1] + (pts[k][1] - pts[k - 1][1]) * t, length: total };
    }
    left -= seg;
  }
  const last = pts[pts.length - 1] || [0, 0];
  return { x: last[0], y: last[1], length: total };
}

// Port point on a side at `pos` (0..len along the side, top->bottom or left->right).
function sidePoint(box, side, pos) {
  if (side === "left") return [box.x, box.y + pos];
  if (side === "right") return [box.x + box.w, box.y + pos];
  if (side === "top") return [box.x + pos, box.y];
  return [box.x + pos, box.y + box.h];
}
const sideLen = (box, side) => (isHorizontal(side) ? box.h : box.w);
const center = (b) => [b.x + b.w / 2, b.y + b.h / 2];

function curve(p1, s1, p2, s2) {
  const G = GEOMETRY_WT;
  const [x1, y1] = p1;
  const [x2, y2] = p2;
  if (s1 === OPPOSITE[s2] && isHorizontal(s1) && Math.abs(y1 - y2) < 0.5) return `M${fmt(x1)} ${fmt(y1)} H${fmt(x2)}`;
  if (s1 === OPPOSITE[s2] && !isHorizontal(s1) && Math.abs(x1 - x2) < 0.5) return `M${fmt(x1)} ${fmt(y1)} V${fmt(y2)}`;
  const n1 = NORMAL[s1];
  const n2 = NORMAL[s2];
  let d1;
  let d2;
  if (s1 === s2) {
    // same side: both handles reach the same outer coordinate
    const a = x1 * n1[0] + y1 * n1[1];
    const b = x2 * n2[0] + y2 * n2[1];
    const far = Math.max(a, b) + G.detour;
    d1 = far - a;
    d2 = far - b;
  } else if (s1 === OPPOSITE[s2]) {
    const gap = Math.abs(isHorizontal(s1) ? x2 - x1 : y2 - y1);
    d1 = d2 = Math.max(12, gap / 2);
  } else {
    d1 = Math.max(12, Math.abs(isHorizontal(s1) ? x2 - x1 : y2 - y1) * 0.6);
    d2 = Math.max(12, Math.abs(isHorizontal(s2) ? x2 - x1 : y2 - y1) * 0.6);
  }
  const c1 = [x1 + n1[0] * d1, y1 + n1[1] * d1];
  const c2 = [x2 + n2[0] * d2, y2 + n2[1] * d2];
  return `M${fmt(x1)} ${fmt(y1)} C${fmt(c1[0])} ${fmt(c1[1])} ${fmt(c2[0])} ${fmt(c2[1])} ${fmt(x2)} ${fmt(y2)}`;
}

// Polyline through waypoints with rounded corners (Q at each waypoint).
function polyline(points) {
  const r0 = GEOMETRY_WT.radius;
  let d = `M${fmt(points[0][0])} ${fmt(points[0][1])}`;
  for (let k = 1; k < points.length - 1; k++) {
    const [ax, ay] = points[k - 1];
    const [px, py] = points[k];
    const [bx, by] = points[k + 1];
    const la = Math.hypot(px - ax, py - ay);
    const lb = Math.hypot(bx - px, by - py);
    const r = Math.min(r0, la / 2, lb / 2);
    if (r <= 0) {
      d += ` L${fmt(px)} ${fmt(py)}`;
      continue;
    }
    d += ` L${fmt(px - ((px - ax) / la) * r)} ${fmt(py - ((py - ay) / la) * r)}`;
    d += ` Q${fmt(px)} ${fmt(py)} ${fmt(px + ((bx - px) / lb) * r)} ${fmt(py + ((by - py) / lb) * r)}`;
  }
  const last = points[points.length - 1];
  return d + ` L${fmt(last[0])} ${fmt(last[1])}`;
}

// Side of `box` that faces point p (dominant axis).
function sideToward(box, p) {
  const [cx, cy] = center(box);
  const dx = (p[0] - cx) / box.w;
  const dy = (p[1] - cy) / box.h;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? "right" : "left";
  return dy >= 0 ? "bottom" : "top";
}
// Port on `side` aligned with point p when possible (axis-aligned first/last segment).
function portToward(box, side, p) {
  const len = sideLen(box, side);
  const pos = isHorizontal(side) ? p[1] - box.y : p[0] - box.x;
  return sidePoint(box, side, Math.min(len - 6, Math.max(6, pos)));
}

// ---- obstacle routing --------------------------------------------------------
// Used when an edge's curve would run through an unrelated node: an orthogonal path through the
// free corridors (lane gaps, row gaps and the space just around each node), found by a shortest-path
// search over that grid with a penalty per bend, then drawn with rounded corners.
const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
const dirOf = (side) => DIRS.findIndex(([x, y]) => x === NORMAL[side][0] && y === NORMAL[side][1]);

function heapPush(h, item) {
  h.push(item);
  let i = h.length - 1;
  while (i > 0) {
    const p = (i - 1) >> 1;
    if (h[p][0] < item[0] || (h[p][0] === item[0] && h[p][1] <= item[1])) break;
    h[i] = h[p];
    i = p;
  }
  h[i] = item;
}
function heapPop(h) {
  const top = h[0];
  const last = h.pop();
  if (h.length) {
    let i = 0;
    for (;;) {
      const l = 2 * i + 1;
      const r = l + 1;
      let m = i;
      const less = (a, b) => a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]);
      if (l < h.length && less(h[l], m === i ? last : h[m])) m = l;
      if (r < h.length && less(h[r], m === i ? last : h[m])) m = r;
      if (m === i) break;
      h[i] = h[m];
      i = m;
    }
    h[i] = last;
  }
  return top;
}

// p1/p2: ports on sides s1/s2; boxes: every node box; xs/ys: corridor lines. Returns a point list or null.
export function routeAround(p1, s1, p2, s2, boxes, xs, ys) {
  const G = GEOMETRY_WT;
  const m = 6;
  const obs = boxes.map((b) => ({ x1: b.x - m, y1: b.y - m, x2: b.x + b.w + m, y2: b.y + b.h + m }));
  const stub = 14;
  const a = [p1[0] + NORMAL[s1][0] * stub, p1[1] + NORMAL[s1][1] * stub];
  const z = [p2[0] + NORMAL[s2][0] * stub, p2[1] + NORMAL[s2][1] * stub];
  const X = [...new Set([...xs, a[0], z[0], ...obs.flatMap((o) => [o.x1 - G.laneGap / 4, o.x2 + G.laneGap / 4])].map(round))].sort((u, v) => u - v);
  const Y = [...new Set([...ys, a[1], z[1], ...obs.flatMap((o) => [o.y1 - G.rowGap / 4, o.y2 + G.rowGap / 4])].map(round))].sort((u, v) => u - v);
  const blocked = (x, y) => obs.some((o) => x > o.x1 && x < o.x2 && y > o.y1 && y < o.y2);
  const segFree = (xa, ya, xb, yb) =>
    !obs.some((o) => Math.max(xa, xb) > o.x1 && Math.min(xa, xb) < o.x2 && Math.max(ya, yb) > o.y1 && Math.min(ya, yb) < o.y2);
  const W = X.length;
  const idx = (i, j) => j * W + i;
  const ai = X.indexOf(round(a[0]));
  const aj = Y.indexOf(round(a[1]));
  const zi = X.indexOf(round(z[0]));
  const zj = Y.indexOf(round(z[1]));
  if (blocked(a[0], a[1]) || blocked(z[0], z[1])) return null;
  const bend = 40;
  const dist = new Map();
  const prev = new Map();
  const h = [];
  let seq = 0;
  const start = idx(ai, aj) * 4 + dirOf(s1);
  dist.set(start, 0);
  heapPush(h, [0, seq++, start]);
  const endDir = (dirOf(s2) + 2) % 4; // moving into the target
  let best = null;
  while (h.length) {
    const [cost, , state] = heapPop(h);
    if (cost > (dist.get(state) ?? Infinity)) continue;
    const cell = state >> 2;
    const d = state & 3;
    const i = cell % W;
    const j = (cell - i) / W;
    if (i === zi && j === zj) {
      const total = cost + (d === endDir ? 0 : bend);
      if (!best || total < best[0]) best = [total, state];
      continue;
    }
    if (best && cost >= best[0]) break;
    for (let nd = 0; nd < 4; nd++) {
      if (nd === (d + 2) % 4) continue; // no U-turns
      const ni = i + Math.sign(DIRS[nd][0]);
      const nj = j + Math.sign(DIRS[nd][1]);
      if (ni < 0 || nj < 0 || ni >= W || nj >= Y.length) continue;
      if (blocked(X[ni], Y[nj]) || !segFree(X[i], Y[j], X[ni], Y[nj])) continue;
      const nc = cost + Math.abs(X[ni] - X[i]) + Math.abs(Y[nj] - Y[j]) + (nd === d ? 0 : bend);
      const ns = idx(ni, nj) * 4 + nd;
      if (nc < (dist.get(ns) ?? Infinity)) {
        dist.set(ns, nc);
        prev.set(ns, state);
        heapPush(h, [nc, seq++, ns]);
      }
    }
  }
  if (!best) return null;
  const cells = [];
  for (let st = best[1]; st !== undefined; st = prev.get(st)) cells.push(st >> 2);
  cells.reverse();
  const pts = [p1, ...cells.map((c) => [X[c % W], Y[(c - (c % W)) / W]]), p2];
  // drop repeated and collinear points
  const out = [];
  for (const p of pts) {
    if (out.length && out[out.length - 1][0] === p[0] && out[out.length - 1][1] === p[1]) continue;
    if (out.length >= 2) {
      const [q, r] = [out[out.length - 2], out[out.length - 1]];
      if ((q[0] === r[0] && r[0] === p[0]) || (q[1] === r[1] && r[1] === p[1])) out.pop();
    }
    out.push(p);
  }
  return out;
}

const inside = (b, x, y, m) => x > b.x + m && x < b.x + b.w - m && y > b.y + m && y < b.y + b.h - m;
const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

// ---- public -----------------------------------------------------------------
// doc: a structurally valid walkthrough document whose references resolve (the validator
// guarantees both before calling this). Returns geometry plus `issues` with JSON pointers.
export function layoutWalkthrough(doc) {
  const G = GEOMETRY_WT;
  const issues = [];
  const nodeIndex = Object.fromEntries(doc.nodes.map((n, i) => [n.id, i]));
  const gaugeByNode = Object.fromEntries((doc.gauges || []).map((g) => [g.node, g]));
  const groupDefs = Object.fromEntries((doc.groups || []).map((g) => [g.id, g]));
  const manual = (n) => typeof n.x === "number" && typeof n.y === "number";

  // ---- grid placement
  const { lane: rank, order } = computeLanes(doc);
  const lane = new Map();
  const row = new Map();
  const taken = new Set();
  const cellsOf = (id, l, r) => {
    const n = doc.nodes[nodeIndex[id]];
    const out = [];
    for (let a = 0; a < (n.span || 1); a++) for (let b = 0; b < (n.rows || 1); b++) out.push(`${l + a}:${r + b}`);
    return out;
  };
  for (const n of doc.nodes) if (!manual(n)) lane.set(n.id, rank.get(n.id) ?? 0);
  for (const n of doc.nodes) {
    if (manual(n) || !Number.isInteger(n.row)) continue;
    row.set(n.id, n.row);
    for (const c of cellsOf(n.id, lane.get(n.id), n.row)) taken.add(c);
  }
  // automatic rows: nodes[] order; in a fully automatic map, flow order first (a folded lane keeps
  // the chain's order top to bottom)
  const flow = !order ? doc.nodes : doc.nodes.map((n, i) => [n, i]).sort((a, b) => order.get(a[0].id) - order.get(b[0].id) || a[1] - b[1]).map(([n]) => n);
  for (const n of flow) {
    if (manual(n) || row.has(n.id)) continue;
    let r = 0;
    while (cellsOf(n.id, lane.get(n.id), r).some((c) => taken.has(c))) r++;
    row.set(n.id, r);
    for (const c of cellsOf(n.id, lane.get(n.id), r)) taken.add(c);
  }

  const gridNodes = doc.nodes.filter((n) => !manual(n));
  const laneCount = Math.max(0, ...gridNodes.map((n) => lane.get(n.id) + (n.span || 1)));
  const rowCount = Math.max(0, ...gridNodes.map((n) => row.get(n.id) + (n.rows || 1)));

  // lane widths (single-lane nodes only) and x positions
  const laneW = Array.from({ length: laneCount }, () => G.laneMin);
  for (const n of gridNodes) if ((n.span || 1) === 1 && n.w === undefined) laneW[lane.get(n.id)] = Math.max(laneW[lane.get(n.id)], clampLane(naturalWidth(n)));
  const groupsIn = (pick) => [...new Set(gridNodes.filter(pick).map((n) => n.group || ""))].sort().join("|");
  const laneGroups = Array.from({ length: laneCount }, (_, l) => groupsIn((n) => lane.get(n.id) <= l && l < lane.get(n.id) + (n.span || 1)));
  const laneX = [];
  let x = G.pad + G.groupSide;
  for (let l = 0; l < laneCount; l++) {
    laneX.push(x);
    const changes = l + 1 < laneCount && laneGroups[l] !== laneGroups[l + 1];
    x += laneW[l] + G.laneGap + (changes ? G.groupGap : 0);
  }

  // row heights (single-row nodes), then rows grown for taller multi-row nodes
  const content = (n, h) => nodeContent(n, gaugeByNode[n.id], h);
  const rowH = Array.from({ length: rowCount }, () => G.nodeH);
  for (const n of gridNodes) if ((n.rows || 1) === 1) rowH[row.get(n.id)] = Math.max(rowH[row.get(n.id)], n.h ?? content(n).natural);
  const groupRows = new Map(); // group id -> [first, last] grid row
  for (const n of gridNodes) {
    if (!n.group) continue;
    const r1 = row.get(n.id);
    const r2 = r1 + (n.rows || 1) - 1;
    const cur = groupRows.get(n.group);
    groupRows.set(n.group, cur ? [Math.min(cur[0], r1), Math.max(cur[1], r2)] : [r1, r2]);
  }
  const topInset = (gid) => (groupDefs[gid] && groupDefs[gid].meta ? G.groupTopMeta : G.groupTop);
  const rowGapBefore = (r) => {
    let need = G.rowGap;
    const starts = [...groupRows].filter(([, [a]]) => a === r).map(([g]) => topInset(g));
    const ends = [...groupRows].some(([, [, b]]) => b === r - 1);
    const startInset = starts.length ? Math.max(...starts) : 0;
    if (startInset) need = Math.max(need, startInset + 8);
    if (ends) need = Math.max(need, G.groupBottom + 8 + startInset);
    return need;
  };
  const rowY = [];
  let y = G.pad + G.groupTopMeta;
  const spanH = (r, k) => {
    let h = 0;
    for (let i = r; i < r + k; i++) h += rowH[i] + (i > r ? rowGapBefore(i) : 0);
    return h;
  };
  for (const n of gridNodes) {
    const k = n.rows || 1;
    if (k === 1) continue;
    const need = n.h ?? content(n).natural;
    const r = row.get(n.id);
    const have = spanH(r, k);
    if (need > have) rowH[r + k - 1] += need - have;
  }
  for (let r = 0; r < rowCount; r++) {
    if (r > 0) y += rowH[r - 1] + rowGapBefore(r);
    rowY.push(y);
  }

  // ---- node boxes
  const nodes = {};
  doc.nodes.forEach((n, i) => {
    const path = `/nodes/${i}`;
    let box;
    if (manual(n)) {
      const w = n.w ?? clampLane(naturalWidth(n));
      box = { x: n.x, y: n.y, w, h: n.h ?? content(n, n.h).natural };
    } else {
      const l = lane.get(n.id);
      const r = row.get(n.id);
      const span = n.span || 1;
      const k = n.rows || 1;
      const w = n.w ?? laneX[l + span - 1] + laneW[l + span - 1] - laneX[l];
      const h = n.h ?? (k > 1 ? spanH(r, k) : Math.max(G.nodeH, content(n).natural));
      box = { x: laneX[l], y: rowY[r], w, h, lane: l, row: r };
    }
    box.x = round(box.x);
    box.y = round(box.y);
    box.w = round(box.w);
    box.h = round(box.h);
    box.content = content(n, box.h);
    box.path = path;
    if (n.h !== undefined && content(n).natural > n.h) {
      issues.push({ path: path + "/h", code: "W_TEXT_LONG", message: `h ${n.h} is shorter than the node's content (${Math.ceil(content(n).natural)}); its text or gauge spills out` });
    }
    nodes[n.id] = box;

    // text fit
    const room = box.w - G.textPad;
    const fit = (s, style, at) => {
      if (measure(s, style) > room) issues.push({ path: at, code: "W_TEXT_LONG", message: "text is likely wider than its box; shorten it, widen the node (w, span) or move it to a wider lane" });
    };
    fit(n.title, TEXT_WT.title, path + "/title");
    if (n.mono !== undefined) fit(n.mono, TEXT_WT.mono, path + "/mono");
    (n.sub || []).forEach((s, j) => fit(s, TEXT_WT.sub, `${path}/sub/${j}`));
    (n.lines || []).forEach((s, j) => fit(lineText(s), TEXT_WT.line, `${path}/lines/${j}`));
  });

  // ---- groups
  const groups = [];
  (doc.groups || []).forEach((g, gi) => {
    const members = doc.nodes.filter((n) => n.group === g.id).map((n) => nodes[n.id]);
    if (!members.length) return;
    const x1 = Math.min(...members.map((b) => b.x)) - G.groupSide;
    const y1 = Math.min(...members.map((b) => b.y)) - topInset(g.id);
    const x2 = Math.max(...members.map((b) => b.x + b.w)) + G.groupSide;
    const y2 = Math.max(...members.map((b) => b.y + b.h)) + G.groupBottom;
    groups.push({ id: g.id, title: g.title, meta: g.meta, tone: g.tone || "default", x: round(x1), y: round(y1), w: round(x2 - x1), h: round(y2 - y1), path: `/groups/${gi}` });
    const longest = Math.max(measure(g.title, TEXT_WT.groupTitle), g.meta ? measure(g.meta, TEXT_WT.groupMeta) : 0);
    if (longest > x2 - x1 - 24) issues.push({ path: `/groups/${gi}`, code: "W_TEXT_LONG", message: "group title or meta is wider than its box; shorten it" });
  });

  // ---- overlaps: node/node, group/group, node/foreign group
  const ids = doc.nodes.map((n) => n.id);
  // where a node or group sits, in the author's terms (lane/row for grid nodes, x/y otherwise)
  const at = (id) => {
    const b = nodes[id];
    const n = doc.nodes[nodeIndex[id]];
    const hint = Number.isInteger(n.lane) || Number.isInteger(n.row) ? " (hinted)" : "";
    return b.lane === undefined ? `x ${b.x}, y ${b.y}` : `lane ${b.lane}, row ${b.row}${hint}`;
  };
  const span = (list) => (list.length ? (Math.min(...list) === Math.max(...list) ? `${Math.min(...list)}` : `${Math.min(...list)}-${Math.max(...list)}`) : "-");
  const groupAt = (g) => {
    const m = doc.nodes.filter((n) => n.group === g.id).map((n) => nodes[n.id]).filter((b) => b.lane !== undefined);
    return `lanes ${span(m.map((b) => b.lane))}, rows ${span(m.map((b) => b.row))}`;
  };
  const q = (v) => JSON.stringify(v);
  for (let a = 0; a < ids.length; a++) {
    for (let b = a + 1; b < ids.length; b++) {
      if (overlaps(nodes[ids[a]], nodes[ids[b]])) {
        issues.push({ path: nodes[ids[b]].path, code: "E_LAYOUT_OVERLAP", message: `node ${q(ids[b])} at ${at(ids[b])} overlaps node ${q(ids[a])} at ${at(ids[a])}; give one of them another row, lane or x/y` });
      }
    }
  }
  for (let a = 0; a < groups.length; a++) {
    for (let b = a + 1; b < groups.length; b++) {
      if (overlaps(groups[a], groups[b])) {
        issues.push({ path: groups[b].path, code: "E_LAYOUT_OVERLAP", message: `group ${q(groups[b].id)} (${groupAt(groups[b])}) overlaps group ${q(groups[a].id)} (${groupAt(groups[a])}); a group box spans all its members, so keep each group's lanes and rows apart from the other's` });
      }
    }
  }
  for (const g of groups) {
    for (const n of doc.nodes) {
      if (n.group === g.id) continue;
      if (overlaps(g, nodes[n.id])) {
        issues.push({ path: nodes[n.id].path, code: "E_LAYOUT_OVERLAP", message: `node ${q(n.id)} at ${at(n.id)} lies inside the box of group ${q(g.id)} (${groupAt(g)}) but is not a member; set its group to ${q(g.id)} or move it outside those lanes/rows` });
      }
    }
  }

  // ---- edge ports
  // Each edge end lives on one side of its node. Ends of the same node pair on one side share a
  // slot (a bidirectional pair is then offset by +-bidi). Slots go where the opposite node faces
  // them when that leaves room, else they are spread evenly in the order of the opposite node.
  const ends = []; // {edge, which, node, side, pair, other}
  const edgeIndex = Object.fromEntries(doc.edges.map((e, i) => [e.id, i]));
  const plan = {};
  const sideCount = (id, side) => ends.filter((e) => e.node === id && e.side === side).length;
  const add = (edge, which, side) => {
    const nodeId = which === "from" ? edge.from : edge.to;
    const otherId = which === "from" ? edge.to : edge.from;
    ends.push({ edge: edge.id, which, node: nodeId, side, pair: [edge.from, edge.to].sort().join("\u0000") + "\u0000" + side, other: otherId });
  };
  const detours = [];
  for (const e of doc.edges) {
    const r = e.route || {};
    if (r.d !== undefined) continue;
    const a = nodes[e.from];
    const b = nodes[e.to];
    if (r.via && r.via.length) {
      const s1 = r.from_side || sideToward(a, r.via[0]);
      const s2 = r.to_side || sideToward(b, r.via[r.via.length - 1]);
      plan[e.id] = { s1, s2, via: r.via };
      continue;
    }
    let s1;
    let s2;
    if (b.x >= a.x + a.w - 1) [s1, s2] = ["right", "left"];
    else if (b.x + b.w <= a.x + 1) [s1, s2] = ["left", "right"];
    else if (b.y >= a.y + a.h - 1) [s1, s2] = ["bottom", "top"];
    else if (b.y + b.h <= a.y + 1) [s1, s2] = ["top", "bottom"];
    else [s1, s2] = ["right", "right"];
    // same lane with something in between: detour around the side
    if (!isHorizontal(s1) && s1 !== s2) {
      const top = s1 === "bottom" ? a : b;
      const bot = s1 === "bottom" ? b : a;
      const chan = { x: Math.max(a.x, b.x), w: Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), y: top.y + top.h, h: bot.y - (top.y + top.h) };
      if (ids.some((id) => id !== e.from && id !== e.to && overlaps(chan, nodes[id]))) {
        if (!r.from_side && !r.to_side) {
          detours.push(e);
          continue;
        }
      }
    }
    s1 = r.from_side || s1;
    s2 = r.to_side || s2;
    plan[e.id] = { s1, s2 };
    add(e, "from", s1);
    add(e, "to", s2);
  }
  for (const e of detours) {
    const load = (side) => sideCount(e.from, side) + sideCount(e.to, side);
    const side = load("left") < load("right") ? "left" : "right";
    plan[e.id] = { s1: side, s2: side };
    add(e, "from", side);
    add(e, "to", side);
  }

  // slot positions per node side
  const portPos = {}; // `${edge}:${which}` -> [x, y]
  const bySide = new Map();
  for (const end of ends) {
    const key = end.node + "\u0000" + end.side;
    if (!bySide.has(key)) bySide.set(key, []);
    bySide.get(key).push(end);
  }
  for (const list of bySide.values()) {
    const box = nodes[list[0].node];
    const side = list[0].side;
    const len = sideLen(box, side);
    const along = (b) => (isHorizontal(side) ? center(b)[1] - box.y : center(b)[0] - box.x);
    const slots = [];
    for (const end of list) {
      let slot = slots.find((s) => s.pair === end.pair);
      if (!slot) {
        const other = nodes[end.other];
        // facing sides with an overlapping range: the middle of the overlap lines both ends up
        let want = len / 2;
        const otherSide = plan[end.edge][end.which === "from" ? "s2" : "s1"];
        if (otherSide === OPPOSITE[side]) {
          const lo = isHorizontal(side) ? Math.max(box.y, other.y) : Math.max(box.x, other.x);
          const hi = isHorizontal(side) ? Math.min(box.y + box.h, other.y + other.h) : Math.min(box.x + box.w, other.x + other.w);
          if (hi - lo >= 16) want = (lo + hi) / 2 - (isHorizontal(side) ? box.y : box.x);
        }
        slot = { pair: end.pair, want, key: along(other), ends: [] };
        slots.push(slot);
      }
      slot.ends.push(end);
    }
    slots.sort((p, q) => p.want - q.want || p.key - q.key);
    const tight = slots.some((s, k) => k > 0 && s.want - slots[k - 1].want < G.portGap + (s.ends.length > 1 || slots[k - 1].ends.length > 1 ? G.bidi : 0));
    if (tight) {
      slots.sort((p, q) => p.key - q.key || p.want - q.want);
      slots.forEach((s, k) => {
        s.at = (len * (k + 1)) / (slots.length + 1);
      });
    } else slots.forEach((s) => (s.at = s.want));
    for (const s of slots) {
      // edges sharing a slot (both directions, or parallel ones) are spread 2*bidi apart, in
      // document order, so both ends of each edge get the same offset
      const order = [...new Set(s.ends.map((e) => e.edge))].sort((p, q) => edgeIndex[p] - edgeIndex[q]);
      s.ends.forEach((end) => {
        const off = (order.indexOf(end.edge) - (order.length - 1) / 2) * 2 * G.bidi;
        const pos = Math.min(len - 4, Math.max(4, s.at + off));
        portPos[`${end.edge}:${end.which}`] = sidePoint(box, side, pos);
      });
    }
  }

  // ---- edge paths
  // corridors for routing around nodes: lane gaps, row gaps, and the margin outside the grid
  const corridorX = [];
  const corridorY = [];
  laneX.forEach((x0, l) => {
    if (l + 1 < laneX.length) corridorX.push((x0 + laneW[l] + laneX[l + 1]) / 2);
  });
  if (laneX.length) corridorX.push(laneX[0] - G.laneGap / 2, laneX[laneX.length - 1] + laneW[laneX.length - 1] + G.laneGap / 2);
  rowY.forEach((y0, r) => {
    if (r + 1 < rowY.length) corridorY.push((y0 + rowH[r] + rowY[r + 1]) / 2);
  });
  if (rowY.length) corridorY.push(rowY[0] - G.rowGap / 2, rowY[rowY.length - 1] + rowH[rowY.length - 1] + G.rowGap / 2);
  const edges = {};
  doc.edges.forEach((e, i) => {
    const r = e.route || {};
    let d;
    if (r.d !== undefined) d = r.d.trim().replace(/\s+/g, " ");
    else if (plan[e.id].via) {
      const { s1, s2, via } = plan[e.id];
      const p1 = portToward(nodes[e.from], s1, via[0]);
      const p2 = portToward(nodes[e.to], s2, via[via.length - 1]);
      d = polyline([p1, ...via, p2]);
    } else {
      const { s1, s2 } = plan[e.id];
      d = curve(portPos[`${e.id}:from`], s1, portPos[`${e.id}:to`], s2);
      // the curve runs through an unrelated node: route around the nodes instead
      const crosses = (path) => {
        const sp = samplePath(path);
        return ids.some((id) => id !== e.from && id !== e.to && sp.some(([px, py]) => inside(nodes[id], px, py, 2)));
      };
      if (crosses(d)) {
        const route = routeAround(portPos[`${e.id}:from`], s1, portPos[`${e.id}:to`], s2, Object.values(nodes), corridorX, corridorY);
        if (route) {
          const alt = polyline(route);
          if (!crosses(alt)) d = alt;
        }
      }
    }
    const pts = samplePath(d);
    const mid = pointAtHalf(pts);
    edges[e.id] = { d, badgeAt: { x: round(mid.x), y: round(mid.y) }, length: round(mid.length), path: `/edges/${i}`, pts };
    // crossing: a sample strictly inside an unrelated node
    const hit = ids.find((id) => id !== e.from && id !== e.to && pts.some(([px, py]) => inside(nodes[id], px, py, 2)));
    if (hit) {
      issues.push({
        path: `/edges/${i}`,
        code: "W_EDGE_CROSSES_NODE",
        message: `edge ${JSON.stringify(e.id)} runs through node ${JSON.stringify(hit)} and no free corridor was found; run \`iad layout\` to see node boxes and lane/row gaps, then set route.via through a gap (or from_side/to_side), or give one node another row`,
      });
    }
  });

  // ---- step badges per scenario: on the step's first edge, at the first spot (middle first, then
  // beside the path, then further along it) that is clear of node boxes and of the scenario's other
  // badges. Node-only steps keep the node's top left corner (error markers use the top right).
  const badges = {};
  const minDist = 2 * G.badgeR + G.badgeGap;
  const nodeBoxes = Object.values(nodes);
  const clearOfNodes = (p) => !nodeBoxes.some((b) => p.x > b.x - G.badgeR - G.badgeGap && p.x < b.x + b.w + G.badgeR + G.badgeGap && p.y > b.y - G.badgeR - G.badgeGap && p.y < b.y + b.h + G.badgeR + G.badgeGap);
  const SPOTS = [[0.5, 0], [0.5, -1], [0.5, 1], [0.35, 0], [0.65, 0], [0.35, -1], [0.65, 1], [0.25, 0], [0.75, 0], [0.2, -1], [0.8, 1]];
  for (const sc of doc.scenarios) {
    const placed = [];
    badges[sc.id] = sc.steps.map((st) => {
      let p;
      if (st.edges.length) {
        const pts = edges[st.edges[0]].pts;
        p = edges[st.edges[0]].badgeAt;
        for (const [f, side] of SPOTS) {
          const q = pointAt(pts, f);
          const c = { x: q.x - q.ty * side * G.badgeOff, y: q.y + q.tx * side * G.badgeOff };
          if (clearOfNodes(c) && !placed.some((o) => Math.hypot(o.x - c.x, o.y - c.y) < minDist)) {
            p = c;
            break;
          }
        }
      } else {
        const b = nodes[st.nodes[0]];
        p = { x: b.x + 4, y: b.y + 4 }; // top left: error markers use the top right
      }
      let k = 0;
      // last resort (no clear spot): step right until clear of the other badges
      while (placed.some((q) => Math.hypot(q.x - (p.x + k * G.badgeNudge), q.y - p.y) < minDist)) k++;
      const at = { x: round(p.x + k * G.badgeNudge), y: round(p.y) };
      placed.push(at);
      return at;
    });
  }

  // ---- viewBox: nodes, groups, edge samples, badges
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const grow = (x1, y1, x2, y2) => {
    minX = Math.min(minX, x1);
    minY = Math.min(minY, y1);
    maxX = Math.max(maxX, x2);
    maxY = Math.max(maxY, y2);
  };
  for (const b of Object.values(nodes)) grow(b.x, b.y - 12, b.x + b.w, b.y + b.h); // -12: marker labels above
  for (const g of groups) grow(g.x, g.y, g.x + g.w, g.y + g.h);
  for (const e of Object.values(edges)) for (const [px, py] of e.pts) grow(px, py, px, py);
  for (const list of Object.values(badges)) for (const p of list) grow(p.x - 10, p.y - 10, p.x + 10, p.y + 10);
  const viewBox = [round(minX - G.pad), round(minY - G.pad), round(maxX - minX + 2 * G.pad), round(maxY - minY + 2 * G.pad)];
  for (const e of Object.values(edges)) delete e.pts;

  return { viewBox, lanes: laneX.map((x0, l) => ({ x: x0, w: laneW[l] })), rows: rowY.map((y0, r) => ({ y: y0, h: rowH[r] })), nodes, groups, edges, badges, issues };
}
