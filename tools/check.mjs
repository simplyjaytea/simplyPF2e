#!/usr/bin/env node
/** Shared local, pull-request and release gate. No installed dependencies. */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = fileURLToPath(new URL("../", import.meta.url));
function filesUnder(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(path) : entry.isFile() ? [path] : [];
  }).sort();
}

function run(args) {
  const result = spawnSync(process.execPath, args, { cwd: root, encoding: "utf8" });
  if (result.error || result.status !== 0) {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    throw result.error ?? new Error(`Check failed (${result.signal ?? result.status}): ${args.join(" ")}`);
  }
}

try {
  const scripts = filesUnder(resolve(root, "scripts")).filter((file) => file.endsWith(".mjs"));
  const tooling = filesUnder(resolve(root, "tools")).filter((file) => file.endsWith(".mjs"));
  const tests = scripts.filter((file) => file.endsWith(".test.mjs"));
  if (!scripts.length || !tests.length) throw new Error("Expected runtime modules and regression tests under scripts/");
  for (const file of [...scripts, ...tooling]) run(["--check", file]);
  console.log(`Syntax passed: ${scripts.length} scripts, ${tooling.length} tooling files`);
  for (const file of tests) {
    console.log(`Checking ${relative(root, file)}`);
    run([file]);
  }
  console.log(`Regressions passed: ${tests.length} files`);
  for (const file of ["module.json", "lang/en.json"]) {
    JSON.parse(readFileSync(resolve(root, file), "utf8"));
  }
  console.log(`Manifest/localization JSON passed; Node ${process.version}`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
