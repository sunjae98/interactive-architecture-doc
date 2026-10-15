#!/usr/bin/env node
// iad — interactive-architecture-doc CLI. Node >= 18, no dependencies.
//
//   node scripts/iad.mjs validate <doc.json>... [--json]
//   node scripts/iad.mjs render <doc.json> [-o <out.html>] [--json]
//   node scripts/iad.mjs init <out.json> [--style walkthrough|overview] [--lang ko|en] [--steps N] [--scenarios a,b] [--fork]
//                             [--paths a,b] [--force] [--json]
//
// Exit codes: 0 = valid (warnings allowed), 1 = validation errors, 2 = usage / read / parse / write error.
// --json: one file -> one object, several files -> an array. A file that cannot be read, parsed or
// written is reported as {ok: false, error: "..."} (arrays add "file") and the exit code is 2.

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { validate, formatIssue } from "./lib/validate.mjs";
import { renderHtml, writeFileAtomic, defaultOutputPath, ValidationFailed } from "./lib/render.mjs";
import { scaffold, scaffoldOverview, formatJson, KEBAB, LANGS, STYLES, MAX_STEPS, MAX_PATHS } from "./lib/scaffold.mjs";

const USAGE = `Usage:
  iad validate <doc.json>... [--json]
  iad render <doc.json> [-o <out.html>] [--json]
  iad init <out.json> [--style walkthrough|overview] [--lang ko|en] [--force] [--json]
           walkthrough: [--steps N] [--scenarios id1,id2,...] [--fork]
           overview:    [--paths id1,id2,...]

Options:
  --json             print {ok, errors[], warnings[]} (render adds "output") as JSON;
                     unreadable/unwritable files print {ok:false, error}
  -o, --out <file>   render output path (default: next to the JSON, same name, .html)
  --style s          init: walkthrough (default; step-by-step scenarios) or overview (one layered
                     diagram with optional path highlighting)
  --lang ko|en       init: UI and placeholder language (default en)
  --steps N          init: number of steps, 1..20 (default 3)
  --scenarios ids    init: comma-separated kebab-case scenario ids (default "default")
  --fork             init: a decision node fanning out to one column per scenario (needs >= 2 scenarios, >= 2 steps)
  --paths ids        init (overview): comma-separated kebab-case path ids, at most ${MAX_PATHS}; one component each
  --force            init: overwrite an existing file
  -h, --help         show this help`;

class UsageError extends Error {}
class FileError extends UsageError {} // read/parse/write problems: exit 2, no usage text

function readDoc(file) {
  let source;
  try {
    source = readFileSync(file, "utf8");
  } catch (e) {
    throw new FileError(`cannot read ${file}: ${e.message}`);
  }
  try {
    return JSON.parse(source);
  } catch (e) {
    throw new FileError(`${file} is not valid JSON: ${e.message}`);
  }
}

const INIT_OPTIONS = ["--style", "--lang", "--steps", "--scenarios", "--fork", "--paths", "--force"];
const VALUE_HINT = { "--style": STYLES.join(" or "), "--lang": "ko or en", "--steps": "a number", "--scenarios": "scenario ids", "--paths": "path ids" };

function parseArgs(argv) {
  const args = { command: argv[0], files: [], json: false, help: false, out: null, init: {} };
  const rest = argv.slice(1);
  const value = (i, what) => {
    if (i + 1 >= rest.length) throw new UsageError(`${rest[i]} needs ${what}`);
    return rest[i + 1];
  };
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === "--json") args.json = true;
    else if (a === "-o" || a === "--out") args.out = value(i++, "a file path");
    else if (a === "-h" || a === "--help") args.help = true;
    else if (INIT_OPTIONS.includes(a)) {
      if (args.command !== "init") throw new UsageError(`${a} is only valid for init`);
      if (a === "--fork" || a === "--force") args.init[a.slice(2)] = true;
      else args.init[a.slice(2)] = value(i++, VALUE_HINT[a]);
    } else if (a.startsWith("-")) throw new UsageError(`unknown option ${a}`);
    else args.files.push(a);
  }
  return args;
}

function cmdValidate(args) {
  if (!args.files.length) throw new UsageError("validate needs at least one file");
  const results = args.files.map((file) => {
    try {
      return { file, ...validate(readDoc(file)) };
    } catch (e) {
      if (!(e instanceof FileError)) throw e;
      return { file, ok: false, error: e.message };
    }
  });
  if (args.json) {
    const payload = results.length === 1 ? strip(results[0]) : results;
    process.stdout.write(JSON.stringify(payload, null, 2) + "\n");
  } else {
    for (const r of results) {
      if (r.error) {
        process.stderr.write(`iad: ${r.error}\n`);
        continue;
      }
      const prefix = results.length > 1 ? `${r.file}: ` : "";
      for (const e of r.errors) process.stdout.write(prefix + formatIssue(e) + "\n");
      for (const w of r.warnings) process.stdout.write(prefix + formatIssue(w) + "\n");
      process.stderr.write(`${r.file}: ${r.ok ? "ok" : "invalid"} (${r.errors.length} error(s), ${r.warnings.length} warning(s))\n`);
    }
  }
  if (results.some((r) => r.error)) return 2;
  return results.every((r) => r.ok) ? 0 : 1;
}

function cmdRender(args) {
  if (args.files.length !== 1) throw new UsageError("render needs exactly one file");
  const file = args.files[0];
  const outPath = args.out || defaultOutputPath(file);
  if (resolve(outPath) === resolve(file)) throw new UsageError(`output ${outPath} would overwrite the input file`);
  const doc = readDoc(file);
  try {
    const { html, warnings } = renderHtml(doc);
    try {
      writeFileAtomic(outPath, html);
    } catch (e) {
      throw new FileError(`cannot write ${outPath}: ${e.message}`);
    }
    if (args.json) {
      process.stdout.write(JSON.stringify({ ok: true, errors: [], warnings, output: outPath }, null, 2) + "\n");
    } else {
      for (const w of warnings) process.stderr.write(formatIssue(w) + "\n");
      process.stdout.write(`wrote ${outPath}\n`);
    }
    return 0;
  } catch (e) {
    if (e instanceof FileError) throw e;
    // template / font problems are bugs in the skill, not in the document
    if (!(e instanceof ValidationFailed)) throw new FileError(`internal: ${e.message}`);
    if (args.json) {
      process.stdout.write(JSON.stringify(strip(e.result), null, 2) + "\n");
    } else {
      for (const i of [...e.result.errors, ...e.result.warnings]) process.stdout.write(formatIssue(i) + "\n");
      process.stderr.write(`${file}: not rendered (${e.result.errors.length} error(s))\n`);
    }
    return 1;
  }
}

function cmdInit(args) {
  if (args.files.length !== 1) throw new UsageError("init needs exactly one output file");
  if (args.out) throw new UsageError("init takes the output path as its argument, not -o");
  const file = args.files[0];
  const o = args.init;
  const style = o.style ?? "walkthrough";
  if (!STYLES.includes(style)) throw new UsageError(`--style must be one of: ${STYLES.join(", ")}`);
  const lang = o.lang ?? "en";
  if (!LANGS.includes(lang)) throw new UsageError(`--lang must be one of: ${LANGS.join(", ")}`);
  if (style === "overview") {
    for (const key of ["steps", "scenarios", "fork"]) {
      if (key in o) throw new UsageError(`--${key} is only valid with --style walkthrough`);
    }
    const paths = o.paths === undefined ? [] : o.paths.split(",").map((id) => id.trim());
    for (const id of paths) {
      if (!KEBAB.test(id)) throw new UsageError(`path id ${JSON.stringify(id)} must be kebab-case`);
      if (id === "client" || id === "entry") throw new UsageError(`path id ${JSON.stringify(id)} is reserved by the skeleton`);
    }
    if (new Set(paths).size !== paths.length) throw new UsageError("path ids must be unique");
    if (paths.length > MAX_PATHS) throw new UsageError(`--paths takes at most ${MAX_PATHS} ids (one column each)`);
    return writeSkeleton(args, file, o, scaffoldOverview({ lang, paths }));
  }
  if ("paths" in o) throw new UsageError("--paths is only valid with --style overview");
  const stepsText = o.steps ?? "3";
  if (!/^[0-9]+$/.test(stepsText) || +stepsText < 1 || +stepsText > MAX_STEPS) throw new UsageError(`--steps must be an integer in 1..${MAX_STEPS}`);
  const steps = +stepsText;
  const scenarios = (o.scenarios ?? "default").split(",").map((id) => id.trim());
  for (const id of scenarios) {
    if (!KEBAB.test(id)) throw new UsageError(`scenario id ${JSON.stringify(id)} must be kebab-case`);
  }
  if (new Set(scenarios).size !== scenarios.length) throw new UsageError("scenario ids must be unique");
  if (o.fork && scenarios.length < 2) throw new UsageError("--fork needs at least 2 scenarios (--scenarios a,b)");
  if (o.fork && steps < 2) throw new UsageError("--fork needs --steps 2 or more");
  return writeSkeleton(args, file, o, scaffold({ lang, steps, scenarios, fork: !!o.fork }));
}

function writeSkeleton(args, file, o, doc) {
  if (!o.force && existsSync(file)) throw new FileError(`${file} already exists (use --force to overwrite)`);
  const { warnings } = validate(doc);
  try {
    writeFileAtomic(file, formatJson(doc) + "\n");
  } catch (e) {
    throw new FileError(`cannot write ${file}: ${e.message}`);
  }
  if (args.json) {
    process.stdout.write(JSON.stringify({ ok: true, errors: [], warnings, output: file }, null, 2) + "\n");
  } else {
    process.stdout.write(`wrote ${file}: replace the ${warnings.length} [placeholder] string(s), then run validate\n`);
  }
  return 0;
}

function strip({ ok, errors, warnings, error }) {
  return error ? { ok, error } : { ok, errors, warnings };
}

function main(argv) {
  let json = false;
  try {
    const args = parseArgs(argv);
    json = args.json;
    if (!args.command || args.command === "-h" || args.command === "--help" || args.help) {
      process.stdout.write(USAGE + "\n");
      return args.command ? 0 : 2;
    }
    if (args.command === "validate") return cmdValidate(args);
    if (args.command === "render") return cmdRender(args);
    if (args.command === "init") return cmdInit(args);
    throw new UsageError(`unknown command "${args.command}"`);
  } catch (e) {
    if (!(e instanceof UsageError)) throw e;
    if (json && e instanceof FileError) process.stdout.write(JSON.stringify({ ok: false, error: e.message }, null, 2) + "\n");
    process.stderr.write(e instanceof FileError ? `iad: ${e.message}\n` : `iad: ${e.message}\n\n${USAGE}\n`);
    return 2;
  }
}

process.exitCode = main(process.argv.slice(2));
