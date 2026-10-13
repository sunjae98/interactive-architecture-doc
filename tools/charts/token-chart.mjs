#!/usr/bin/env node
// Generates docs/token-comparison-{light,dark}.svg: estimated tokens an agent reads and writes
// to produce one forked document, single SKILL.md + hand-edited template vs this skill.
// Usage: node tools/charts/token-chart.mjs
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SKILL = join(ROOT, "skills", "interactive-architecture-doc");
const BYTES_PER_TOKEN = 4; // rough estimate for English prose, JSON and HTML

// Baseline: the single-SKILL.md skill imported in the first commit of this repository.
const BASELINE_REV = "0cc39c1";
const BASELINE_FILES = ["SKILL.md", "reference/design-system.md", "reference/template.html"];
const BASELINE_TEMPLATE = "reference/template.html";

function gitBytes(rev, path) {
  const out = execFileSync("git", ["show", `${rev}:skills/interactive-architecture-doc/${path}`], { cwd: ROOT });
  return out.length;
}
const size = (p) => statSync(join(SKILL, p)).size;

function measure() {
  const baselineRead = BASELINE_FILES.reduce((n, f) => n + gitBytes(BASELINE_REV, f), 0);
  const baselineWrite = gitBytes(BASELINE_REV, BASELINE_TEMPLATE); // the whole template is rewritten
  const iadRead = size("SKILL.md") + size("references/format.md") + scaffoldBytes();
  const iadWrite = size("examples/three-branch.en.json"); // a filled-in forked document
  const tok = (b) => Math.round(b / BYTES_PER_TOKEN);
  return [
    { label: "Reads", a: tok(baselineRead), b: tok(iadRead) },
    { label: "Writes", a: tok(baselineWrite), b: tok(iadWrite) },
    { label: "Total", a: tok(baselineRead + baselineWrite), b: tok(iadRead + iadWrite) },
  ];
}

// Size of a 3-scenario, 7-step forked `iad init` skeleton (the starting file for a forked doc).
function scaffoldBytes() {
  const dir = mkdtempSync(join(tmpdir(), "iad-chart-"));
  const tmp = join(dir, "init.json");
  try {
    execFileSync(process.execPath, [
      join(SKILL, "scripts", "iad.mjs"), "init", tmp,
      "--steps", "7", "--scenarios", "simple,lookup,job", "--fork",
    ], { cwd: ROOT, stdio: "ignore" });
    return readFileSync(tmp).length;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const THEMES = {
  light: {
    surface: "#fcfcfb", ink: "#0b0b0b", ink2: "#52514e", muted: "#898781",
    grid: "#e1e0d9", axis: "#c3c2b7", a: "#2a78d6", b: "#eb6834",
  },
  dark: {
    surface: "#1a1a19", ink: "#f0efec", ink2: "#c3c2b7", muted: "#898781",
    grid: "#2c2c2a", axis: "#383835", a: "#3987e5", b: "#d95926",
  },
};
const SERIES = [
  { key: "a", name: "Single SKILL.md + hand-edited template" },
  { key: "b", name: "interactive-architecture-doc" },
];

const fmt = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n));
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");

// Horizontal bar with a 4px rounded data end and a square baseline end.
function bar(x, y, w, h, r = 4) {
  if (w <= r) return `M${x},${y}h${w}v${h}h${-w}z`;
  return `M${x},${y}h${w - r}a${r},${r} 0 0 1 ${r},${r}v${h - 2 * r}a${r},${r} 0 0 1 ${-r},${r}h${-(w - r)}z`;
}

function svg(rows, t) {
  const W = 720, left = 72, right = 64, top = 76, rowGap = 22, barH = 18, gap = 2;
  const groupH = barH * 2 + gap;
  const H = top + rows.length * groupH + (rows.length - 1) * rowGap + 62;
  const max = Math.max(...rows.flatMap((r) => [r.a, r.b]));
  const step = 5000, niceMax = Math.ceil(max / step) * step;
  const plotW = W - left - right;
  const xs = (v) => left + (v / niceMax) * plotW;
  const out = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="t d" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif">`);
  out.push(`<title id="t">Estimated tokens per forked document</title>`);
  out.push(`<desc id="d">${esc(rows.map((r) => `${r.label}: ${SERIES[0].name} ${r.a}, ${SERIES[1].name} ${r.b}`).join("; "))}. Tokens estimated as bytes / ${BYTES_PER_TOKEN}.</desc>`);
  out.push(`<rect width="${W}" height="${H}" rx="8" fill="${t.surface}"/>`);
  out.push(`<text x="24" y="30" font-size="15" font-weight="600" fill="${t.ink}">Estimated tokens to create one forked document</text>`);
  // legend
  let lx = 24;
  for (const s of SERIES) {
    out.push(`<rect x="${lx}" y="44" width="10" height="10" rx="2" fill="${t[s.key]}"/>`);
    out.push(`<text x="${lx + 16}" y="53" font-size="12" fill="${t.ink2}">${esc(s.name)}</text>`);
    lx += 16 + s.name.length * 6.6 + 20;
  }
  // gridlines + ticks
  const plotBottom = H - 52;
  for (let v = 0; v <= niceMax; v += step) {
    const x = xs(v);
    out.push(`<line x1="${x}" y1="${top - 6}" x2="${x}" y2="${plotBottom}" stroke="${v === 0 ? t.axis : t.grid}" stroke-width="1"/>`);
    out.push(`<text x="${x}" y="${plotBottom + 16}" font-size="11" fill="${t.muted}" text-anchor="middle">${fmt(v)}</text>`);
  }
  rows.forEach((r, i) => {
    const y0 = top + i * (groupH + rowGap);
    out.push(`<text x="${left - 10}" y="${y0 + groupH / 2 + 4}" font-size="12" font-weight="${r.label === "Total" ? 600 : 400}" fill="${t.ink}" text-anchor="end">${r.label}</text>`);
    SERIES.forEach((s, j) => {
      const y = y0 + j * (barH + gap), w = xs(r[s.key]) - left;
      out.push(`<path d="${bar(left, y, w, barH)}" fill="${t[s.key]}"><title>${esc(`${r.label} · ${s.name}: ~${r[s.key]} tokens`)}</title></path>`);
      out.push(`<text x="${left + w + 6}" y="${y + barH / 2 + 4}" font-size="11" fill="${t.ink2}">${fmt(r[s.key])}</text>`);
    });
  });
  out.push(`<text x="24" y="${H - 12}" font-size="11" fill="${t.muted}">3 scenarios × 7 steps. Estimate: file bytes / ${BYTES_PER_TOKEN}, not exact tokenizer counts.</text>`);
  out.push(`</svg>`);
  return out.join("\n") + "\n";
}

const rows = measure();
for (const [name, theme] of Object.entries(THEMES)) {
  writeFileSync(join(ROOT, "docs", `token-comparison-${name}.svg`), svg(rows, theme));
}
console.log(JSON.stringify(rows));
