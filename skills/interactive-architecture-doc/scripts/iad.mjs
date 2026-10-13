#!/usr/bin/env node
// iad — interactive-architecture-doc CLI. Node >= 18, no dependencies.
//
//   node scripts/iad.mjs validate <doc.json>... [--json]
//
// Exit codes: 0 = valid (warnings allowed), 1 = validation errors, 2 = usage / read / parse error.

import { readFileSync } from "node:fs";
import { validate, formatIssue } from "./lib/validate.mjs";

const USAGE = `Usage:
  iad validate <doc.json>... [--json]

Options:
  --json       print {ok, errors[], warnings[]} as JSON
  -h, --help   show this help`;

class UsageError extends Error {}

function readDoc(file) {
  let source;
  try {
    source = readFileSync(file, "utf8");
  } catch (e) {
    throw new UsageError(`cannot read ${file}: ${e.message}`);
  }
  try {
    return JSON.parse(source);
  } catch (e) {
    throw new UsageError(`${file} is not valid JSON: ${e.message}`);
  }
}

function parseArgs(argv) {
  const args = { command: argv[0], files: [], json: false, help: false };
  for (const a of argv.slice(1)) {
    if (a === "--json") args.json = true;
    else if (a === "-h" || a === "--help") args.help = true;
    else if (a.startsWith("-")) throw new UsageError(`unknown option ${a}`);
    else args.files.push(a);
  }
  return args;
}

function cmdValidate(args) {
  if (!args.files.length) throw new UsageError("validate needs at least one file");
  const results = args.files.map((file) => ({ file, ...validate(readDoc(file)) }));
  if (args.json) {
    const payload = results.length === 1 ? strip(results[0]) : results;
    process.stdout.write(JSON.stringify(payload, null, 2) + "\n");
  } else {
    for (const r of results) {
      const prefix = results.length > 1 ? `${r.file}: ` : "";
      for (const e of r.errors) process.stdout.write(prefix + formatIssue(e) + "\n");
      for (const w of r.warnings) process.stdout.write(prefix + formatIssue(w) + "\n");
      process.stderr.write(`${r.file}: ${r.ok ? "ok" : "invalid"} (${r.errors.length} error(s), ${r.warnings.length} warning(s))\n`);
    }
  }
  return results.every((r) => r.ok) ? 0 : 1;
}

function strip({ ok, errors, warnings }) {
  return { ok, errors, warnings };
}

function main(argv) {
  try {
    const args = parseArgs(argv);
    if (!args.command || args.command === "-h" || args.command === "--help" || args.help) {
      process.stdout.write(USAGE + "\n");
      return args.command ? 0 : 2;
    }
    if (args.command === "validate") return cmdValidate(args);
    throw new UsageError(`unknown command "${args.command}"`);
  } catch (e) {
    if (!(e instanceof UsageError)) throw e;
    process.stderr.write(`iad: ${e.message}\n\n${USAGE}\n`);
    return 2;
  }
}

process.exitCode = main(process.argv.slice(2));
