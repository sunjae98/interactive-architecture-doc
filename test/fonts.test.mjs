import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FONTS = join(ROOT, "skills/interactive-architecture-doc/assets/fonts");
const HASHES = join(ROOT, "tools/build-fonts/hashes.json");

test("bundled woff2 files match tools/build-fonts/hashes.json (file set, sha256, bytes)", () => {
  const expected = JSON.parse(readFileSync(HASHES, "utf8"));
  const files = readdirSync(FONTS).filter((f) => f.endsWith(".woff2")).sort();
  assert.deepEqual(files, Object.keys(expected).sort(), "file set");
  for (const f of files) {
    const data = readFileSync(join(FONTS, f));
    const actual = { sha256: createHash("sha256").update(data).digest("hex"), bytes: data.length };
    assert.deepEqual(actual, expected[f], f);
  }
});
