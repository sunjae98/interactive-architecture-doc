// Headless smoke test: renders the fixture and runs its self-check (#iad-selfcheck) in Chromium.
// Skipped when no Chromium/Chrome binary is found (set IAD_CHROME to point at one).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { renderHtml } from "../skills/interactive-architecture-doc/scripts/lib/render.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CANDIDATES = [
  process.env.IAD_CHROME,
  "/opt/homebrew/bin/chromium",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].filter(Boolean);
const CHROME = CANDIDATES.find((p) => existsSync(p));

test("smoke: the rendered fixture passes its own self-check in headless Chromium", { skip: !CHROME && "no Chromium/Chrome found (set IAD_CHROME)", timeout: 60000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "iad-smoke-"));
  let child;
  let exited = Promise.resolve();
  // Chrome starts helper processes (zygote, renderer) that outlive a killed browser and keep writing
  // to the profile, so the whole process group is killed and awaited before the profile is removed.
  const killAll = () => { try { process.kill(-child.pid, "SIGKILL"); } catch { try { child.kill("SIGKILL"); } catch {} } };
  try {
    const file = join(dir, "doc.html");
    writeFileSync(file, renderHtml(JSON.parse(readFileSync(join(ROOT, "test/fixtures/walkthrough.en.json"), "utf8"))).html);
    const url = pathToFileURL(file).href + "#iad-selfcheck";
    // --dump-dom prints once the virtual time budget is spent; the token's animation frames can keep
    // the process alive afterwards, so it is killed as soon as the result is in.
    // Linux CI runners (e.g. Ubuntu 24.04) block the user namespaces Chrome's sandbox needs, so the
    // sandbox is turned off there; the page is a local file this test just rendered.
    const sandbox = process.platform === "linux" ? ["--no-sandbox"] : [];
    child = spawn(CHROME, ["--headless=new", ...sandbox, "--disable-gpu", "--disable-dev-shm-usage", "--no-first-run", `--user-data-dir=${join(dir, "profile")}`, "--virtual-time-budget=5000", "--dump-dom", url], { stdio: ["ignore", "pipe", "pipe"], detached: true });
    exited = new Promise((resolve) => child.on("close", resolve));
    let err = "";
    child.stderr.on("data", (d) => { err = (err + d).slice(-2000); });
    const result = await new Promise((resolve, reject) => {
      let out = "";
      const timer = setTimeout(() => { killAll(); reject(new Error("no self-check result within 45s")); }, 45000);
      child.stdout.on("data", (d) => {
        out += d;
        const m = out.match(/<pre id="iad-selfcheck-result" data-state="(pass|fail)">([^<]*)<\/pre>/);
        if (m) { clearTimeout(timer); killAll(); resolve(m); }
      });
      child.on("exit", () => { clearTimeout(timer); const m = out.match(/<pre id="iad-selfcheck-result" data-state="(pass|fail)">([^<]*)<\/pre>/); m ? resolve(m) : reject(new Error(`chromium exited without a self-check result\n${err}`)); });
    });
    assert.equal(result[1], "pass", result[2]);
    const json = JSON.parse(result[2].replace(/&quot;/g, '"').replace(/&amp;/g, "&"));
    assert.deepEqual({ ok: json.ok, checked: json.checked, failures: json.failures, errors: json.errors }, { ok: true, checked: 12, failures: [], errors: [] });
  } finally {
    if (child) {
      killAll();
      await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 5000))]);
    }
    rmSync(dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
  }
});
