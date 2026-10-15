// Overview style: deterministic geometry for the layered diagram.
// Pure (no I/O). The validator uses it for alignment and fit checks, the renderer for the SVG.
// Layers stack top to bottom on a fixed column grid; every edge is a straight vertical line between
// two nodes in adjacent layers, drawn where the two nodes overlap horizontally.

export const GEOMETRY = {
  width: 880, // viewBox width; the page scales the SVG to its container
  pad: 48, // left/right margin of the grid
  gap: 40, // between columns
  top: 28,
  bottom: 28,
  nodeH: 64, // plain node height
  headH: 40, // card header height
  rowH: 30,
  rowGap: 6,
  layerGap: 108, // vertical space between layers (edges and their labels live here)
  groupInset: 24, // group box left/right inset from the viewBox edge
  groupTop: 36, // group box top above its first layer
  groupBottom: 24, // group box bottom below its last layer
  pillH: 24,
  minOverlap: 24, // two nodes must overlap at least this much to share an edge
  laneMax: 180, // max distance between parallel edges of one node pair
};

export const DEFAULT_COLUMNS = 3;

// Approximate advance widths. Fonts are embedded (IAD Sans, Geist Mono), so this only has to be
// close enough to warn before text clearly overflows. Wide (CJK, Hangul, fullwidth) glyphs are 1em.
const WIDE_RE = /[ᄀ-ᅟ⺀-〾ぁ-㏿㐀-䶿一-鿿ꥠ-꥿가-힣豈-﫿︰-﹏＀-｠￠-￦]/;

export function textWidth(s, px, { mono = false, bold = false, tracking = 0 } = {}) {
  let em = 0;
  for (const ch of String(s)) em += WIDE_RE.test(ch) ? 1 : mono ? 0.6 : bold ? 0.58 : 0.54;
  return (em + tracking * [...String(s)].length) * px;
}

// Text styles shared with the template CSS (.ov-*): keep the two in sync.
export const TEXT = {
  title: { px: 15, bold: true },
  outerTitle: { px: 15, mono: true, bold: true, tracking: 0.04 },
  code: { px: 12, mono: true },
  pill: { px: 12, mono: true, bold: true },
  label: { px: 11, mono: true, bold: true, tracking: 0.08 },
};
const measure = (s, style) => textWidth(s, style.px, style);
export const pillWidth = (s) => measure(s, TEXT.pill) + 20;

const round = (n) => Math.round(n * 10) / 10;

// doc: a structurally valid overview document whose ids resolve (the validator guarantees both
// before calling this). Returns geometry plus `issues` (alignment errors, fit warnings) with JSON
// pointers, so the validator can report them and the renderer can trust a clean layout.
export function layoutOverview(doc) {
  const G = GEOMETRY;
  const columns = doc.meta.columns || DEFAULT_COLUMNS;
  const colW = (G.width - G.pad * 2 - G.gap * (columns - 1)) / columns;
  const colX = (c) => G.pad + (c - 1) * (colW + G.gap);
  const issues = [];
  const warn = (path, message) => issues.push({ path, code: "W_TEXT_LONG", message });

  // ---- nodes, layer by layer
  const nodes = {};
  const layers = [];
  let y = G.top;
  doc.layers.forEach((layer, li) => {
    let cursor = 1;
    let h = G.nodeH;
    const ids = [];
    layer.nodes.forEach((n, ni) => {
      const span = n.span || 1;
      const col = n.col || cursor;
      const nh = n.rows ? G.headH + 12 + n.rows.length * (G.rowH + G.rowGap) + 6 : G.nodeH;
      h = Math.max(h, nh);
      const w = colW * span + G.gap * (span - 1);
      nodes[n.id] = { node: n, layer: li, path: `/layers/${li}/nodes/${ni}`, x: round(colX(col)), y, w: round(w), h: nh };
      ids.push(n.id);
      cursor = col + span;
    });
    layers.push({ y, h, ids, group: layer.group, boundary: layer.boundary });
    y += h + G.layerGap;
  });
  const height = round(y - G.layerGap + G.bottom);

  // ---- text fit (node titles, codes, rows)
  for (const g of Object.values(nodes)) {
    const n = g.node;
    const outer = n.tone === "outer";
    const room = n.rows ? g.w - 28 : g.w - 24;
    if (measure(n.title, outer ? TEXT.outerTitle : TEXT.title) > room) warn(g.path + "/title", `title is wider than its box; shorten it or widen the node (span)`);
    if (n.code !== undefined && measure(n.code, TEXT.code) > g.w - 24) warn(g.path + "/code", `code is wider than its box; shorten it or widen the node (span)`);
    (n.rows || []).forEach((r, i) => {
      if (measure(r, TEXT.code) > g.w - 48) warn(`${g.path}/rows/${i}`, `row is wider than its card; shorten it or widen the node (span)`);
    });
  }

  // ---- groups: one dashed box around the contiguous layers that share a group id
  const groupDefs = Object.fromEntries((doc.groups || []).map((g) => [g.id, g]));
  const groups = [];
  layers.forEach((l, i) => {
    if (!l.group) return;
    const last = groups[groups.length - 1];
    if (last && last.id === l.group && last.lastLayer === i - 1) {
      last.bottom = l.y + l.h;
      last.lastLayer = i;
    } else {
      groups.push({ id: l.group, label: groupDefs[l.group].label, top: l.y, bottom: l.y + l.h, lastLayer: i });
    }
  });
  const groupBoxes = groups.map((g) => ({
    id: g.id,
    label: g.label,
    x: G.groupInset,
    y: round(g.top - G.groupTop),
    w: G.width - G.groupInset * 2,
    h: round(g.bottom - g.top + G.groupTop + G.groupBottom),
  }));

  // ---- boundaries: a dotted line across the gap above the layer that declares one
  const boundaries = [];
  layers.forEach((l, i) => {
    if (!l.boundary || i === 0) return;
    const prev = layers[i - 1];
    const above = Math.max(prev.y + prev.h, ...groupBoxes.filter((b) => b.y + b.h <= l.y).map((b) => b.y + b.h));
    const startsGroup = l.group && !(prev.group === l.group);
    const below = startsGroup ? l.y - G.groupTop : l.y;
    const lineY = round((above + below) / 2);
    // label under the line, or above it when a group box starts right below
    boundaries.push({ label: l.boundary, y: lineY, labelY: round(startsGroup ? lineY - 8 : lineY + 18) });
  });
  const rails = [...boundaries.map((b) => b.y), ...groupBoxes.flatMap((b) => [b.y, b.y + b.h])];

  // ---- edges: parallel edges between the same pair spread out inside the overlap
  const pairs = new Map();
  (doc.edges || []).forEach((e, i) => {
    const key = [e.from, e.to].sort().join("\u0000");
    if (!pairs.has(key)) pairs.set(key, []);
    pairs.get(key).push(i);
  });
  const edges = [];
  (doc.edges || []).forEach((e, i) => {
    const a = nodes[e.from];
    const b = nodes[e.to];
    const up = a.y > b.y;
    const top = up ? b : a;
    const bot = up ? a : b;
    const ox1 = Math.max(a.x, b.x);
    const ox2 = Math.min(a.x + a.w, b.x + b.w);
    if (ox2 - ox1 < G.minOverlap) {
      issues.push({ path: `/edges/${i}`, code: "E_EDGE_ALIGN", message: `${JSON.stringify(e.from)} and ${JSON.stringify(e.to)} do not share a column; move one of them (col/span) so they overlap` });
      return;
    }
    const lane = pairs.get([e.from, e.to].sort().join("\u0000"));
    const k = lane.length;
    const spacing = k > 1 ? Math.min(G.laneMax, (ox2 - ox1 - G.minOverlap) / (k - 1)) : 0;
    const x = round((ox1 + ox2) / 2 + (lane.indexOf(i) - (k - 1) / 2) * spacing);
    const y1 = top.y + top.h;
    const y2 = bot.y;

    // label in the longest stretch of the edge that no group border or boundary line crosses
    const cuts = [y1, ...rails.filter((r) => r > y1 && r < y2).sort((p, q) => p - q), y2];
    let best = [y1, y2];
    let len = -1;
    for (let c = 0; c < cuts.length - 1; c++) {
      if (cuts[c + 1] - cuts[c] > len) {
        len = cuts[c + 1] - cuts[c];
        best = [cuts[c], cuts[c + 1]];
      }
    }
    const pillY = round((best[0] + best[1]) / 2);
    const labels = [];
    if (e.label !== undefined) labels.push({ path: null, text: e.label });
    for (const [pathId, text] of Object.entries(e.label_by_path || {})) labels.push({ path: pathId, text });
    const pills = labels.map((l) => ({ path: l.path, text: l.text, x, y: pillY, w: round(pillWidth(l.text)) }));
    edges.push({ index: i, from: e.from, to: e.to, up, x, y1, y2, pills });
  });

  // edge labels in the same gap must not collide (the widest variant of each label counts)
  for (let i = 0; i < edges.length; i++) {
    for (let j = i + 1; j < edges.length; j++) {
      const p = edges[i];
      const q = edges[j];
      if (!p.pills.length || !q.pills.length || p.pills[0].y !== q.pills[0].y) continue;
      const pw = Math.max(...p.pills.map((s) => s.w));
      const qw = Math.max(...q.pills.map((s) => s.w));
      if (Math.abs(p.x - q.x) < (pw + qw) / 2 + 8) warn(`/edges/${q.index}`, `label overlaps the label of /edges/${p.index}; shorten one of them`);
    }
  }

  return { width: G.width, height, columns, colW, nodes, layers, groups: groupBoxes, boundaries, edges, issues };
}
