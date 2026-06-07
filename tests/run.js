#!/usr/bin/env node
// Test runner for Cover Battle.
//
// Discovers every `*.test.js` in this directory, runs each named test with a
// fresh assertion object, prints a per-test PASS/FAIL line and a final summary.
// Exits 0 only if every test passed; exits 1 if any test failed (so CI / npm
// can gate on it).
//
// Usage:  node tests/run.js

const fs = require("fs");
const path = require("path");
const { makeAssert } = require("./assert");

const TESTS_DIR = __dirname;

const files = fs
  .readdirSync(TESTS_DIR)
  .filter((f) => f.endsWith(".test.js"))
  .sort();

let totalTests = 0;
let passed = 0;
let failed = 0;
const failures = [];

console.log("Cover Battle test suite\n=======================");

for (const file of files) {
  const suiteObj = require(path.join(TESTS_DIR, file));
  if (!suiteObj || !Array.isArray(suiteObj.tests)) {
    console.log(`! ${file}: not a valid suite (skipped)`);
    continue;
  }
  console.log(`\n# ${file}`);
  for (const { name, fn } of suiteObj.tests) {
    totalTests++;
    const a = makeAssert();
    try {
      fn(a);
      passed++;
      console.log(`  PASS  ${name}  (${a.count} assertion${a.count === 1 ? "" : "s"})`);
    } catch (err) {
      failed++;
      failures.push({ file, name, message: err && err.message ? err.message : String(err) });
      console.log(`  FAIL  ${name}`);
      console.log(`        ${err && err.message ? err.message : err}`);
    }
  }
}

console.log("\n=======================");
console.log(`Files: ${files.length}   Tests: ${totalTests}   Passed: ${passed}   Failed: ${failed}`);

if (failed > 0) {
  console.log("\nFailures:");
  for (const f of failures) {
    console.log(`  - [${f.file}] ${f.name}: ${f.message}`);
  }
  console.log("\nRESULT: FAIL");
  process.exit(1);
} else {
  console.log("\nRESULT: PASS");
  process.exit(0);
}
