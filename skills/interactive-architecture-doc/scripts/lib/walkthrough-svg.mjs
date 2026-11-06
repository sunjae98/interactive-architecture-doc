// Walkthrough style: the component map as a static SVG string, from layoutWalkthrough().
// Leading spaces in `lines` are kept by CSS (white-space:pre on .nl), not by xml:space.
// The runtime in assets/template.html only toggles classes on these elements, moves the token,
// shows per-scenario badges / skip labels and draws error markers; it never computes geometry.

import { escapeHtml, plainText } from "./markup.mjs";
import { layoutWalkthrough, lineText, gaugeRoom } from "./walkthrough-layout.mjs";

const a = (v) => escapeHtml(String(v));

function renderNode(n, box, gauge, doc, ui) {
  const c = box.content;
  const x = box.x;
  const y = box.y;
  const tx = x + 12;
  const out = [
    `<g class="node ${n.kind}" data-id="${a(n.id)}" tabindex="0" role="button" aria-label="${a(ui.node_details.replace("{title}", () => n.title))}">`,
    `<rect class="box" x="${x}" y="${y}" width="${box.w}" height="${box.h}" rx="${n.kind === "store" ? 14 : 10}"/>`,
    `<text class="nt" x="${tx}" y="${y + c.title}">${escapeHtml(n.title)}</text>`,
  ];
  if (c.mono !== null) out.push(`<text class="nm" x="${tx}" y="${y + c.mono}">${escapeHtml(n.mono)}</text>`);
  (n.sub || []).forEach((s, i) => out.push(`<text class="ns" x="${tx}" y="${y + c.sub[i]}">${escapeHtml(s)}</text>`));
  (n.lines || []).forEach((s, i) => {
    const cls = typeof s === "object" && s.muted ? "nl m" : "nl";
    out.push(`<text class="${cls}" x="${tx}" y="${y + c.lines[i]}">${escapeHtml(lineText(s))}</text>`);
  });
  if (gauge && c.gauge) {
    const g = c.gauge;
    const gx = x + 20;
    const gw = box.w - 40;
    const gy = y + g.top;
    out.push(
      `<rect class="gauge-bg" x="${gx}" y="${gy}" width="${gw}" height="${g.h}" rx="6"/>`,
      `<rect class="gauge" data-gauge="${a(gauge.id)}" data-gy="${gy}" data-gh="${g.h}" x="${gx + 1}" y="${gy + g.h - 1}" width="${gw - 2}" height="0" rx="5"/>`,
      `<text class="gauge-l" data-gauge-label="${a(gauge.id)}" data-room="${gaugeRoom(box.w)}" x="${x + box.w / 2}" y="${gy + g.h / 2}">${escapeHtml(gauge.empty || "")}</text>`
    );
    if (g.caption !== null) out.push(`<text class="nm" x="${tx}" y="${y + g.caption}">${escapeHtml(gauge.caption)}</text>`);
  }
  for (const sc of doc.scenarios) {
    for (const k of sc.skip || []) {
      if (k.node !== n.id) continue;
      out.push(
        `<g class="skipmark" data-s="${a(sc.id)}">`,
        `<rect x="${x + 10}" y="${y + box.h - 34}" width="${box.w - 20}" height="24" rx="6"/>`,
        `<text x="${x + box.w / 2}" y="${y + box.h - 18}">${escapeHtml(k.label)}</text>`,
        `</g>`
      );
    }
  }
  out.push(`</g>`);
  return out.join("\n");
}

// Returns the <svg> markup. `ui` supplies the accessible label.
export function renderMap(doc, ui, layout = layoutWalkthrough(doc)) {
  const L = layout;
  const gaugeByNode = Object.fromEntries((doc.gauges || []).map((g) => [g.node, g]));
  const [vx, vy, vw, vh] = L.viewBox;
  const marker = (id) =>
    `<marker id="${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" orient="auto-start-reverse" markerUnits="userSpaceOnUse"><path d="M0 0 L10 5 L0 10 z"/></marker>`;
  const out = [
    `<svg id="wtMap" class="wt-map" viewBox="${vx} ${vy} ${vw} ${vh}" style="--map-w:${vw}px" role="group" aria-label="${a(ui.map_label)}">`,
    `<defs>${marker("wt-arw")}${marker("wt-arw-on")}</defs>`,
    `<g class="wt-groups">`,
  ];
  for (const g of L.groups) {
    out.push(
      `<g class="grp${g.tone === "muted" ? " grp-muted" : ""}" data-group="${a(g.id)}">`,
      `<rect x="${g.x}" y="${g.y}" width="${g.w}" height="${g.h}" rx="14"/>`,
      `<text class="gt" x="${g.x + 12}" y="${g.y + 18}">${escapeHtml(g.title)}</text>`,
      ...(g.meta ? [`<text class="gm" x="${g.x + 12}" y="${g.y + 32}">${escapeHtml(g.meta)}</text>`] : []),
      `</g>`
    );
  }
  out.push(`</g>`, `<g class="wt-edges">`);
  for (const e of doc.edges) {
    const d = a(L.edges[e.id].d);
    out.push(
      `<g class="edge" data-id="${a(e.id)}" data-k="${e.kind}" data-from="${a(e.from)}" data-to="${a(e.to)}">`,
      `<path class="hit" d="${d}"/>`,
      `<path class="ln" d="${d}"/>`,
      `</g>`
    );
  }
  out.push(`</g>`, `<g class="wt-nodes">`);
  for (const n of doc.nodes) out.push(renderNode(n, L.nodes[n.id], gaugeByNode[n.id], doc, ui));
  out.push(`</g>`, `<g class="wt-badges">`);
  for (const sc of doc.scenarios) {
    out.push(`<g class="badges" data-s="${a(sc.id)}">`);
    L.badges[sc.id].forEach((p, j) => {
      out.push(
        `<g class="badge" data-step="${j}" tabindex="0" role="button" aria-label="${a(`${j + 1}. ${plainText(sc.steps[j].title)}`)}" transform="translate(${p.x},${p.y})">` +
          `<circle r="9.5"/><text>${j + 1}</text><title>${escapeHtml(`${j + 1}. ${plainText(sc.steps[j].title)}`)}</title></g>`
      );
    });
    out.push(`</g>`);
  }
  out.push(`</g>`, `<g class="wt-markers"></g>`, `<g class="wt-tokens"></g>`, `</svg>`);
  return out.join("\n");
}
