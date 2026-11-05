// IR -> single self-contained HTML file.
// Static markup (header, scenario cards, the component map SVG, cards below) is generated here; the
// runtime in assets/template.html only reads #iad-data (the IR) and #iad-i18n (UI strings).

import { readFileSync, writeFileSync, renameSync, unlinkSync, readdirSync, existsSync, openSync, closeSync } from "node:fs";
import { randomBytes, createHash } from "node:crypto";
import { dirname, join, basename, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validate, isOverview, KINDS, EDGE_KINDS } from "./validate.mjs";
import { escapeHtml, inline, plainText, embedJson } from "./markup.mjs";
import { uiStrings } from "./i18n.mjs";
import { renderDiagram, renderTabs, renderCaptions } from "./overview.mjs";
import { renderMap } from "./walkthrough-svg.mjs";

const SKILL_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const TEMPLATE_PATH = join(SKILL_DIR, "assets", "template.html");
export const OVERVIEW_TEMPLATE_PATH = join(SKILL_DIR, "assets", "template.overview.html");
export const FONTS_DIR = join(SKILL_DIR, "assets", "fonts");

const SLOT_RE = /\{\{(IAD_[A-Z0-9_]+|t:[a-z0-9_]+)\}\}/g;

export class ValidationFailed extends Error {
  constructor(result) {
    super(`document has ${result.errors.length} validation error(s)`);
    this.result = result;
  }
}

// ---- fonts ------------------------------------------------------------------
// Every assets/fonts/*.woff2 is inlined as base64. Known files get their family name and weight
// range (both bundled fonts are variable); any other file uses its basename as the family.
// No fonts -> empty slot. --font-sans / --font-mono in the template name these families.
const FONT_FACES = {
  "iad-sans.woff2": { family: "IAD Sans", weight: "45 930" },
  "geist-mono.woff2": { family: "Geist Mono", weight: "100 900" },
};

export function fontFaces(dir = FONTS_DIR) {
  if (!existsSync(dir)) return "";
  const files = readdirSync(dir).filter((f) => f.endsWith(".woff2")).sort();
  if (!files.length) return "";
  const faces = files.map((f) => {
    const data = readFileSync(join(dir, f)).toString("base64");
    const known = FONT_FACES[f];
    // the file name becomes a CSS string: keep only characters that cannot break out of it
    const family = known ? known.family : basename(f, ".woff2").replace(/[^A-Za-z0-9 _-]/g, "") || "font";
    const weight = known ? `font-weight:${known.weight};` : "";
    return `@font-face{font-family:"${family}";src:url(data:font/woff2;base64,${data}) format("woff2");${weight}font-display:swap;}`;
  });
  return `<style id="iad-fonts">\n${faces.join("\n")}\n</style>`;
}

// ---- walkthrough sections ------------------------------------------------------
// Overview header (h1 + optional subtitle); the walkthrough has its own below.
function renderHeader(meta) {
  return `<h1 data-export>${escapeHtml(meta.title)}</h1>` + (meta.subtitle ? `\n<div class="subtitle" data-export>${inline(meta.subtitle)}</div>` : "");
}

function renderWtHeader(meta) {
  const out = [`<h1>${escapeHtml(meta.title)}</h1>`];
  if (meta.intro) out.push(`<p class="sub">${inline(meta.intro)}</p>`);
  if (meta.facts) {
    out.push(
      `<div class="facts">`,
      ...meta.facts.map((f) => `<div class="fact"><b>${inline(f.label)}</b><span${f.mono === false ? "" : ' class="mono"'}>${inline(f.value)}</span></div>`),
      `</div>`
    );
  }
  return out.join("\n");
}

function renderCases(doc) {
  return doc.scenarios
    .map(
      (sc, i) =>
        `<button type="button" class="case" data-s="s${i + 1}" data-scenario="${escapeHtml(sc.id)}" aria-pressed="false">` +
        `<span class="t">${i + 1}. ${inline(sc.title)}${sc.tag ? ` <span class="case-tag">${inline(sc.tag)}</span>` : ""}</span>` +
        `<span class="s">${inline(sc.summary)}</span></button>`
    )
    .join("\n");
}

function renderLegendCard(doc, ui) {
  const L = doc.legend;
  const kinds = KINDS.filter((k) => Object.hasOwn(L.nodes, k)).map((k) => `<span class="sw ${k}"><i></i>${inline(L.nodes[k])}</span>`);
  const edges = EDGE_KINDS.map(
    (k) =>
      `<span class="sw"><svg viewBox="0 0 34 10" aria-hidden="true"><line class="lg-${k}" x1="1" y1="5" x2="33" y2="5"/></svg>${inline((L.edges && L.edges[k]) || ui["edge_" + k])}</span>`
  );
  const out = [
    `<section class="card legend">`,
    `<h3>${escapeHtml(ui.legend)}</h3>`,
    `<div class="lg-row">\n${kinds.join("\n")}\n</div>`,
    `<div class="lg-row">\n${edges.join("\n")}\n</div>`,
  ];
  if (L.tokens) {
    out.push(
      `<div class="lg-row">`,
      ...L.tokens.map((t) => `<span class="tk-s ${t.kind}">${escapeHtml(t.text)}</span>`),
      `<span class="lg-muted">${escapeHtml(ui.token_hint)}</span>`,
      `</div>`
    );
  }
  out.push(`<p class="hint">${escapeHtml(ui.kbd_hint)}</p>`, `</section>`);
  return out.join("\n");
}

function renderBelow(doc, ui) {
  const out = [`<div class="below">`];
  if (doc.tldr) {
    out.push(
      `<section class="card">`,
      `<h3>${inline(doc.tldr.title || ui.tldr_title)}</h3>`,
      `<ol class="three">`,
      ...doc.tldr.points.map((p) => `<li>${inline(p)}</li>`),
      `</ol>`,
      `</section>`
    );
  }
  for (const t of doc.tables || []) {
    out.push(
      `<section class="card table-card">`,
      `<h3>${inline(t.title)}</h3>`,
      `<div class="tbl-wrap"><table>`,
      `<thead><tr>${t.columns.map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead>`,
      `<tbody>`,
      ...t.rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`),
      `</tbody>`,
      `</table></div>`,
      `</section>`
    );
  }
  out.push(renderLegendCard(doc, ui), `</div>`);

  // v2 sections kept as plain cards under the grid
  const extra = [];
  if (doc.callouts) {
    extra.push(...doc.callouts.map((c) => `<section class="card"><h3>${inline(c.title)}</h3>\n<p class="card-body">${inline(c.body)}</p></section>`));
  }
  if (doc.considerations) {
    const c = doc.considerations;
    extra.push(
      `<section class="card considerations">`,
      `<h3>${inline(c.title)}</h3>`,
      `<ol>`,
      ...c.items.map((it) => `<li><b>${inline(it.decision)}</b>\n<span class="why">${inline(it.why)}</span></li>`),
      `</ol>`,
      `</section>`
    );
  }
  if (doc.tool_examples) {
    const te = doc.tool_examples;
    extra.push(
      `<section class="card tool-examples">`,
      `<h3>${inline(te.title)}</h3>`,
      ...(te.lead ? [`<p class="card-body">${inline(te.lead)}</p>`] : []),
      ...te.tools.map(
        (t) =>
          `<div class="tool-card">\n<span class="tool-name">${escapeHtml(t.name)}</span>\n<pre>${escapeHtml(t.code)}</pre>` +
          (t.note ? `\n<div class="tool-note">${inline(t.note)}</div>` : "") +
          `\n</div>`
      ),
      `</section>`
    );
  }
  if (extra.length) out.push(`<div class="extra">`, ...extra, `</div>`);
  return out.join("\n");
}

function renderFooter(meta) {
  return meta.source ? `<footer>${inline(meta.source)}</footer>` : "";
}

// ---- Content-Security-Policy -------------------------------------------------
// The page needs no network: everything is inline or a data:/blob: URL. Inline executable scripts
// (plain <script> without attributes) are allowed by their SHA-256, computed from the template so the
// policy can never drift from the shipped code. JSON data islands are not executed and need no hash.
// The export rasterizes a data: SVG through <img> and downloads via blob: URLs.
const EXEC_SCRIPT_RE = /<script>([\s\S]*?)<\/script>/g;

export function contentSecurityPolicy(template) {
  const hashes = [...template.matchAll(EXEC_SCRIPT_RE)].map(([, body]) => {
    if (new RegExp(SLOT_RE.source).test(body)) throw new Error("template has a slot inside an inline script; its CSP hash would not be stable");
    return `'sha256-${createHash("sha256").update(body, "utf8").digest("base64")}'`;
  });
  return [
    "default-src 'none'",
    `script-src ${hashes.join(" ")}`,
    "style-src 'unsafe-inline'",
    "font-src data:",
    "img-src data: blob:",
    "base-uri 'none'",
    "form-action 'none'",
  ].join("; ");
}

// ---- public API -------------------------------------------------------------
// `meta.style` picks the template and the style-specific slots; the shared slots (language, title,
// fonts, header, data, UI strings, CSP) are the same for both.
export function renderHtml(doc, { templatePath, fontsDir = FONTS_DIR } = {}) {
  const result = validate(doc);
  if (!result.ok) throw new ValidationFailed(result);

  const overview = isOverview(doc);
  templatePath ??= overview ? OVERVIEW_TEMPLATE_PATH : TEMPLATE_PATH;
  const ui = uiStrings(doc.meta.lang || "en");
  const title = doc.meta.subtitle ? `${doc.meta.title} — ${plainText(doc.meta.subtitle)}` : doc.meta.title;
  const slots = {
    IAD_LANG: escapeHtml(doc.meta.lang || "en"),
    IAD_TITLE: escapeHtml(title),
    IAD_FONTS: fontFaces(fontsDir),
    IAD_HEADER: renderHeader(doc.meta),
    IAD_DATA: embedJson(doc),
    IAD_I18N: embedJson(ui),
    ...(overview
      ? {
          IAD_OV_TABS: renderTabs(doc, ui),
          IAD_OV_DIAGRAM: renderDiagram(doc),
          IAD_OV_CAPTIONS: renderCaptions(doc),
        }
      : {
          IAD_WT_HEADER: renderWtHeader(doc.meta),
          IAD_WT_CASES: renderCases(doc),
          IAD_WT_MAP: renderMap(doc, ui),
          IAD_WT_BELOW: renderBelow(doc, ui),
          IAD_WT_FOOTER: renderFooter(doc.meta),
        }),
  };

  // Single pass: substituted content is never re-scanned for slots.
  let template;
  try {
    template = readFileSync(templatePath, "utf8");
  } catch (e) {
    throw new Error(`template ${templatePath} cannot be read: ${e.message}`);
  }
  slots.IAD_CSP = escapeHtml(contentSecurityPolicy(template));
  const html = template.replace(SLOT_RE, (match, name) => {
    if (name.startsWith("t:")) {
      const key = name.slice(2);
      if (!Object.hasOwn(ui, key)) throw new Error(`template uses unknown UI string ${match}`);
      return escapeHtml(ui[key]);
    }
    if (!Object.hasOwn(slots, name)) throw new Error(`template uses unknown slot ${match}`);
    return slots[name];
  });
  return { html, warnings: result.warnings };
}

export function defaultOutputPath(inputPath) {
  const ext = extname(inputPath);
  return join(dirname(inputPath), basename(inputPath, ext) + ".html");
}

// Write via a temp file in the same directory, then rename (atomic on POSIX filesystems).
// The temp name is random and opened exclusively ("wx"), so an existing file is never clobbered
// or removed; only a temp file this call created is cleaned up on failure.
export function writeFileAtomic(path, data) {
  const target = resolve(path);
  const tmp = join(dirname(target), `.${basename(target)}.${randomBytes(8).toString("hex")}.tmp`);
  let created = false;
  try {
    const fd = openSync(tmp, "wx");
    created = true;
    try {
      writeFileSync(fd, data);
    } finally {
      closeSync(fd);
    }
    renameSync(tmp, target);
  } catch (e) {
    if (created) {
      try {
        unlinkSync(tmp);
      } catch {
        // already gone
      }
    }
    throw e;
  }
}

export function renderFile(doc, outPath, options) {
  const { html, warnings } = renderHtml(doc, options);
  writeFileAtomic(outPath, html);
  return { outPath, warnings };
}
