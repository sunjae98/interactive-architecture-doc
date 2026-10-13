#!/usr/bin/env node
// iad — interactive-architecture-doc CLI. Node >= 18, no dependencies.
//
//   node scripts/iad.mjs validate <doc.json>... [--json]
//   node scripts/iad.mjs render <doc.json> [-o <out.html>] [--json]
//
// Exit codes: 0 = valid (warnings allowed), 1 = validation errors, 2 = usage / read / parse / write error.
// --json: one file -> one object, several files -> an array. A file that cannot be read, parsed or
// written is reported as {ok: false, error: "..."} (arrays add "file") and the exit code is 2.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { validate, formatIssue } from "./lib/validate.mjs";
import { renderHtml, writeFileAtomic, defaultOutputPath, ValidationFailed } from "./lib/render.mjs";

const USAGE = `Usage:
  iad validate <doc.json>... [--json]
  iad render <doc.json> [-o <out.html>] [--json]

Options:
  --json             print {ok, errors[], warnings[]} (render adds "output") as JSON;
                     unreadable/unwritable files print {ok:false, error}
  -o, --out <file>   render output path (default: next to the JSON, same name, .html)
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

function parseArgs(argv) {
  const args = { command: argv[0], files: [], json: false, help: false, out: null };
  const rest = argv.slice(1);
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === "--json") args.json = true;
    else if (a === "-o" || a === "--out") {
      if (i + 1 >= rest.length) throw new UsageError(`${a} needs a file path`);
      args.out = rest[++i];
    } else if (a === "-h" || a === "--help") args.help = true;
    else if (a.startsWith("-")) throw new UsageError(`unknown option ${a}`);
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
    throw new UsageError(`unknown command "${args.command}"`);
  } catch (e) {
    if (!(e instanceof UsageError)) throw e;
    if (json && e instanceof FileError) process.stdout.write(JSON.stringify({ ok: false, error: e.message }, null, 2) + "\n");
    process.stderr.write(e instanceof FileError ? `iad: ${e.message}\n` : `iad: ${e.message}\n\n${USAGE}\n`);
    return 2;
  }
}

process.exitCode = main(process.argv.slice(2));
