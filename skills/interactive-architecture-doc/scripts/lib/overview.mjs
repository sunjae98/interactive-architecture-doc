// Overview style: static markup for assets/template.overview.html.
// The whole diagram is computed here (scripts/lib/layout.mjs) and emitted as inline SVG; the runtime
// in the template only toggles path highlighting, captions, export and the self-check.

import { layoutOverview } from "./layout.mjs";
import { escapeHtml, inline } from "./markup.mjs";

// Numbers are rounded to 0.01 so the output is stable across platforms (no float noise).
const num = (v) => (typeof v === "number" ? String(Math.round(v * 100) / 100) : v);
const attrs = (o) =>
  Object.entries(o)
    .filter(([, v]) => v !== undefined && v !== null && v !== false)
    .map(([k, v]) => ` ${k}="${escapeHtml(num(v))}"`)
    .join("");
const n2 = (v) => Math.round(v * 100) / 100;

function renderNode(g) {
  const n = g.node;
  const cls = ["ov-node", n.tone === "outer" ? "ov-outer" : "", n.rows ? "ov-card" : ""].filter(Boolean).join(" ");
  const out = [`<g${attrs({ class: cls, "data-node": n.id })}>`];
  if (n.rows) {
    const r = 8;
    const head = `M${n2(g.x)},${n2(g.y + 40)} V${n2(g.y + r)} a${r},${r} 0 0 1 ${r},-${r} H${n2(g.x + g.w - r)} a${r},${r} 0 0 1 ${r},${r} V${n2(g.y + 40)} Z`;
    out.push(`<rect${attrs({ class: "ov-box", x: g.x, y: g.y, width: g.w, height: g.h, rx: r })}/>`);
    out.push(`<path${attrs({ class: "ov-head", d: head })}/>`);
    out.push(`<text${attrs({ class: "ov-title ov-head-text", x: g.x + 14, y: g.y + 25 })}>${escapeHtml(n.title)}</text>`);
    n.rows.forEach((row, i) => {
      const ry = g.y + 52 + i * 36;
      out.push(`<rect${attrs({ class: "ov-row", x: g.x + 12, y: ry, width: g.w - 24, height: 30, rx: 6 })}/>`);
      out.push(`<text${attrs({ class: "ov-code ov-row-text", x: g.x + 24, y: ry + 19 })}>${escapeHtml(row)}</text>`);
    });
  } else {
    const cx = g.x + g.w / 2;
    out.push(`<rect${attrs({ class: "ov-box", x: g.x, y: g.y, width: g.w, height: g.h, rx: 10 })}/>`);
    const titleY = n.code === undefined ? g.y + 37 : g.y + 28;
    out.push(`<text${attrs({ class: "ov-title", x: cx, y: titleY, "text-anchor": "middle" })}>${escapeHtml(n.title)}</text>`);
    if (n.code !== undefined) {
      out.push(`<text${attrs({ class: "ov-code", x: cx, y: g.y + 47, "text-anchor": "middle" })}>${escapeHtml(n.code)}</text>`);
    }
  }
  out.push(`</g>`);
  return out.join("");
}

function renderEdge(e) {
  const tipY = e.up ? e.y1 : e.y2;
  const dir = e.up ? 1 : -1;
  const out = [`<g${attrs({ class: "ov-edge", "data-from": e.from, "data-to": e.to })}>`];
  out.push(`<path${attrs({ class: "ov-line", d: `M${n2(e.x)},${n2(e.y1)} V${n2(e.y2)}` })}/>`);
  out.push(`<path${attrs({ class: "ov-arrow", d: `M${n2(e.x - 5)},${n2(tipY + dir * 8)} L${n2(e.x)},${n2(tipY)} L${n2(e.x + 5)},${n2(tipY + dir * 8)} Z` })}/>`);
  for (const p of e.pills) {
    // the default label shows until a path with its own variant is selected (runtime)
    out.push(`<g${attrs({ class: "ov-pill", "data-for": p.path ?? undefined, display: p.path === null ? undefined : "none" })}>`);
    out.push(`<rect${attrs({ x: p.x - p.w / 2, y: p.y - 12, width: p.w, height: 24, rx: 12 })}/>`);
    out.push(`<text${attrs({ x: p.x, y: p.y + 4, "text-anchor": "middle" })}>${escapeHtml(p.text)}</text>`);
    out.push(`</g>`);
  }
  out.push(`</g>`);
  return out.join("");
}

export function renderDiagram(doc) {
  const geo = layoutOverview(doc);
  const out = [
    `<svg${attrs({
      class: "ov-diagram",
      id: "ovDiagram",
      xmlns: "http://www.w3.org/2000/svg",
      viewBox: `0 0 ${geo.width} ${geo.height}`,
      role: "img",
      "aria-label": doc.meta.title,
    })}>`,
  ];
  for (const b of geo.groups) {
    out.push(
      `<g class="ov-group"><rect${attrs({ x: b.x, y: b.y, width: b.w, height: b.h, rx: 12 })}/>` +
        `<text${attrs({ class: "ov-label", x: b.x + 16, y: b.y + 22 })}>${escapeHtml(b.label)}</text></g>`
    );
  }
  for (const b of geo.boundaries) {
    out.push(
      `<g class="ov-boundary"><line${attrs({ x1: 24, x2: geo.width - 24, y1: b.y, y2: b.y })}/>` +
        `<text${attrs({ class: "ov-label", x: 24, y: b.labelY })}>${escapeHtml(b.label)}</text></g>`
    );
  }
  for (const e of geo.edges) out.push(renderEdge(e));
  // document order (an object would list integer-like ids first)
  for (const layer of doc.layers) for (const n of layer.nodes) out.push(renderNode(geo.nodes[n.id]));
  out.push(`</svg>`);
  return out.join("\n");
}

export function renderTabs(doc, ui) {
  if (!doc.paths || !doc.paths.length) return "";
  const tab = (id, label, selected) =>
    `<button${attrs({ type: "button", role: "tab", class: "ov-tab", "data-path": id, "aria-selected": String(selected), tabindex: selected ? "0" : "-1" })}>${escapeHtml(label)}</button>`;
  return [
    `<div class="ov-tabs" role="tablist" aria-label="${escapeHtml(ui.paths_label)}">`,
    tab("", ui.tab_overview, true),
    ...doc.paths.map((p) => tab(p.id, p.label, false)),
    `</div>`,
  ].join("\n");
}

// One caption per view; the runtime shows the selected path's caption, or the overview caption
// when that path has none.
export function renderCaptions(doc) {
  const out = [];
  if (doc.caption) out.push(`<p class="ov-caption" data-caption="">${inline(doc.caption)}</p>`);
  for (const p of doc.paths || []) {
    if (p.caption) out.push(`<p class="ov-caption"${attrs({ "data-caption": p.id })} hidden>${inline(p.caption)}</p>`);
  }
  return out.join("\n");
}
