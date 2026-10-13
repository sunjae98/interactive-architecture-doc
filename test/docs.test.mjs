import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SKILL = path.join(ROOT, "skills", "interactive-architecture-doc");
const SKIP_DIRS = new Set([".git", "node_modules", ".omc", ".venv", ".cache"]);

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

test("all relative markdown links resolve", () => {
  const broken = [];
  for (const file of walk(ROOT).filter((f) => f.endsWith(".md"))) {
    const text = fs.readFileSync(file, "utf8").replace(/```[\s\S]*?```/g, "");
    for (const m of text.matchAll(/\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
      const target = m[1];
      if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("#")) continue;
      const rel = decodeURIComponent(target.split("#")[0]);
      if (!rel) continue;
      if (!fs.existsSync(path.resolve(path.dirname(file), rel))) {
        broken.push(`${path.relative(ROOT, file)} -> ${target}`);
      }
    }
  }
  assert.deepEqual(broken, []);
});

test("SKILL.md is <=150 lines with name/description/compatibility frontmatter", () => {
  const text = fs.readFileSync(path.join(SKILL, "SKILL.md"), "utf8");
  assert.ok(text.trimEnd().split("\n").length <= 150, "SKILL.md exceeds 150 lines");
  const fm = text.match(/^---\n([\s\S]*?)\n---\n/);
  assert.ok(fm, "missing frontmatter");
  const keys = Object.fromEntries(
    fm[1].split("\n").map((l) => l.match(/^([a-z-]+):\s*(.*)$/)).filter(Boolean).map((m) => [m[1], m[2]]),
  );
  assert.equal(keys.name, "interactive-architecture-doc");
  assert.ok(keys.description && keys.description.length > 0, "description missing");
  assert.ok(keys.compatibility && keys.compatibility.length > 0, "compatibility missing");
});

test("licenses/ files and THIRD_PARTY_NOTICES.md agree", () => {
  const files = fs.readdirSync(path.join(SKILL, "licenses")).sort();
  const notices = fs.readFileSync(path.join(ROOT, "THIRD_PARTY_NOTICES.md"), "utf8");
  const listed = [...new Set([...notices.matchAll(/licenses\/([A-Za-z0-9._-]+\.txt)/g)].map((m) => m[1]))].sort();
  assert.deepEqual(listed, files);
});

test("skill folder contains no dev files", () => {
  const bad = walk(SKILL)
    .map((f) => path.relative(SKILL, f))
    .filter((r) => /(^|\/)(test|tests|tools)\//.test(r) || /\.test\./.test(r));
  assert.deepEqual(bad, []);
});
