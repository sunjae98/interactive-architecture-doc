// IR -> single self-contained HTML file.
// Static markup is generated here; the runtime in assets/template.html only reads #iad-data
// (steps, scenarios, meta.entry_request) and #iad-i18n (UI strings).

import { readFileSync, writeFileSync, renameSync, unlinkSync, readdirSync, existsSync, openSync, closeSync } from "node:fs";
import { randomBytes, createHash } from "node:crypto";
import { dirname, join, basename, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validate, isOverview, KINDS } from "./validate.mjs";
import { escapeHtml, inline, plainText, embedJson } from "./markup.mjs";
import { uiStrings } from "./i18n.mjs";
import { renderDiagram, renderTabs, renderCaptions } from "./overview.mjs";

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

// ---- board ------------------------------------------------------------------
const cols = (n) => `--cols:${n};--cols-md:${Math.min(n, 2)}`;

function renderNode(n) {
  const classes = ["node", n.kind];
  if (n.width) classes.push("w-" + n.width);
  let attrs = ` class="${classes.join(" ")}" data-step="${n.step}"`;
  if (n.branches) attrs += ` data-branch="${escapeHtml(n.branches.join(","))}"`;
  if (n.fan_hub) attrs += ` data-fan-hub="${escapeHtml(n.fan_hub)}"`;
  if (n.fan_target) attrs += ` data-fan-target="${escapeHtml(n.fan_target)}"`;

  const out = [`<div${attrs}>`, `<span class="num">${n.step}</span>`];
  if (n.tag) out.push(`<span class="tag">${inline(n.tag)}</span>`);
  out.push(`<span class="body">${inline(n.body)}</span>`);
  if (n.code !== undefined || n.entry) {
    out.push(`<code class="blk"${n.entry ? " data-entry" : ""}>${escapeHtml(n.code || "")}</code>`);
  }
  if (n.details) {
    const d = n.details;
    out.push(`<div class="detail-grid${d.code ? "" : " no-left"}">`);
    if (d.code) out.push(`<div class="detail-left"><code class="blk">${escapeHtml(d.code)}</code></div>`);
    out.push(`<div class="detail-right">`);
    for (const item of d.items) {
      out.push(
        `<div class="detail-item${item.variant === "alt" ? " alt-item" : ""}">` +
          `<div class="detail-title">${inline(item.title)}</div>` +
          `<div class="detail-body">${inline(item.body)}</div></div>`
      );
    }
    out.push(`</div>`, `</div>`);
  }
  if (n.note) out.push(`<div class="note">${inline(n.note)}</div>`);
  out.push(`</div>`);
  return out.join("\n");
}

function renderBlocks(blocks, inColumn = false) {
  return blocks.map((b) => renderBlock(b, inColumn)).join("\n");
}

function renderBlock(b, inColumn) {
  switch (b.type) {
    case "node":
      return inColumn ? renderNode(b) : `<div class="center-row">\n${renderNode(b)}\n</div>`;
    case "arrow":
      return `<div class="plain-arrow">↓${b.label ? `<span class="arrow-label">${inline(b.label)}</span>` : ""}</div>`;
    case "internal":
      return `<div class="internal">\n<span class="badge">${inline(b.badge)}</span>\n${renderBlocks(b.children)}\n</div>`;
    case "fork":
      return `<div class="fork-zone">\n<svg class="zone-overlay" data-fan-svg aria-hidden="true"></svg>\n${renderBlocks(b.children)}\n</div>`;
    case "columns":
      return [
        `<div class="fork-row" style="${cols(b.columns.length)}">`,
        ...b.columns.map(
          (c) =>
            `<div class="fork-col">\n${c.title ? `<div class="fork-title">${inline(c.title)}</div>\n` : ""}${renderBlocks(c.children, true)}\n</div>`
        ),
        `</div>`,
      ].join("\n");
    case "external":
      return [
        `<div class="external-zone">`,
        `<span class="badge2">${inline(b.badge)}</span>`,
        `<div class="external-row" style="${cols(b.systems.length)}">`,
        ...b.systems.map(
          (s) =>
            `<div class="external-card">\n<div class="name">${inline(s.name)}</div>\n<ul class="external-list">\n` +
            s.items.map((it) => `<li>${inline(it.text)}${it.tag ? `<span class="ext-tag">${inline(it.tag)}</span>` : ""}</li>`).join("\n") +
            `\n</ul>\n</div>`
        ),
        `</div>`,
        `</div>`,
      ].join("\n");
    default:
      throw new Error(`internal: unknown block type ${b.type}`);
  }
}

// ---- page sections ----------------------------------------------------------
function renderHeader(meta) {
  return `<h1 data-export>${escapeHtml(meta.title)}</h1>` + (meta.subtitle ? `\n<div class="subtitle" data-export>${inline(meta.subtitle)}</div>` : "");
}

function renderTldr(tldr, ui) {
  if (!tldr) return "";
  return [
    `<div class="tldr">`,
    `<h2>${escapeHtml(ui.tldr_heading)}</h2>`,
    `<div class="headline">"<b>${inline(tldr.headline)}</b>" ${escapeHtml(ui.tldr_suffix)}</div>`,
    `<ol>`,
    ...tldr.points.map((p) => `<li><b>${inline(p.title)}</b>\n<span class="sub">${inline(p.detail)}</span></li>`),
    `</ol>`,
    `</div>`,
  ].join("\n");
}

function renderStepper(steps) {
  const items = steps.map((s, i) => `<div class="step"><span class="num">${i + 1}</span>${inline(s.label)}</div>`);
  return `<div class="stepper" data-export>\n${items.join('\n<span class="step-arrow">→</span>\n')}\n</div>`;
}

function renderLegend(legend) {
  const items = KINDS.filter((k) => k in legend).map((k) => `<span><i class="dot ${k}"></i> ${inline(legend[k])}</span>`);
  return `<div class="legend" data-export>\n${items.join("\n")}\n</div>`;
}

function renderSections(doc) {
  const out = [];
  if (doc.callouts) {
    out.push(
      `<div class="callout" style="--cols:${Math.min(doc.callouts.length, 2)}">`,
      ...doc.callouts.map((c) => `<div class="card">\n<h3>${inline(c.title)}</h3>\n${inline(c.body)}\n</div>`),
      `</div>`
    );
  }
  if (doc.considerations) {
    const c = doc.considerations;
    out.push(
      `<div class="considerations">`,
      `<h3>${inline(c.title)}</h3>`,
      `<ol>`,
      ...c.items.map((it) => `<li><b>${inline(it.decision)}</b>\n<span class="why">${inline(it.why)}</span></li>`),
      `</ol>`,
      `</div>`
    );
  }
  if (doc.tool_examples) {
    const te = doc.tool_examples;
    out.push(
      `<div class="tool-examples">`,
      `<h3>${inline(te.title)}</h3>`,
      ...(te.lead ? [`<div class="lead">${inline(te.lead)}</div>`] : []),
      `<div class="tool-cards">`,
      ...te.tools.map(
        (t) =>
          `<div class="tool-card">\n<span class="tool-name">${escapeHtml(t.name)}</span>\n<pre>${escapeHtml(t.code)}</pre>` +
          (t.note ? `\n<div class="tool-note">${inline(t.note)}</div>` : "") +
          `\n</div>`
      ),
      `</div>`,
      `</div>`
    );
  }
  return out.join("\n");
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
          IAD_TLDR: renderTldr(doc.tldr, ui),
          IAD_STEPPER: renderStepper(doc.steps),
          IAD_LEGEND: renderLegend(doc.legend),
          IAD_BOARD: renderBlocks(doc.board),
          IAD_SECTIONS: renderSections(doc),
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
