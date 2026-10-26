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
  const testSources = filesUnder(resolve(root, "tests")).filter((file) => file.endsWith(".mjs"));
  const misplacedTest = scripts.find((file) => file.endsWith(".test.mjs"));
  if (misplacedTest) throw new Error(`Regression tests belong under tests/, found: ${relative(root, misplacedTest)}`);
  const tooling = filesUnder(resolve(root, "tools")).filter((file) => file.endsWith(".mjs"));
  const tests = testSources.filter((file) => file.endsWith(".test.mjs"));
  if (!scripts.length || !tests.length) throw new Error("Expected runtime modules under scripts/ and regression tests under tests/");
  for (const file of [...scripts, ...testSources, ...tooling]) run(["--check", file]);
  console.log(`Syntax passed: ${scripts.length} scripts, ${tests.length} tests, ${tooling.length} tooling files`);
  const integrityResult = spawnSync(process.execPath, [resolve(root, "tools", "check-integrity.mjs")], { cwd: root, encoding: "utf8" });
  if (integrityResult.stdout) process.stdout.write(integrityResult.stdout);
  if (integrityResult.stderr) process.stderr.write(integrityResult.stderr);
  if (integrityResult.error || integrityResult.status !== 0) {
    throw integrityResult.error ?? new Error(`Integrity check failed (${integrityResult.signal ?? integrityResult.status})`);
  }
  const linkResult = spawnSync(process.execPath, [resolve(root, "tools", "check-links.mjs")], { cwd: root, encoding: "utf8" });
  if (linkResult.stdout) process.stdout.write(linkResult.stdout);
  if (linkResult.stderr) process.stderr.write(linkResult.stderr);
  if (linkResult.error || linkResult.status !== 0) {
    throw linkResult.error ?? new Error(`Link check failed (${linkResult.signal ?? linkResult.status})`);
  }
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
