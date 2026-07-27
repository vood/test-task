#!/usr/bin/env node
/* Terminal runner for the GPU credit system exercise.
 *
 *   node interview/gpu-credits/run-tests.mjs [path/to/solution.js]
 *
 * Defaults to interview/gpu-credits/solution.js. The file must define a
 * top-level `class CreditSystem`.
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const solutionPath = resolve(process.cwd(), process.argv[2] || resolve(here, "solution.js"));
const includeOptional = !process.argv.includes("--skip-optional");

await import(resolve(here, "tests.js"));
const SUITES = globalThis.CREDIT_TEST_SUITES;

class AssertionError extends Error {
  constructor(label, actual, expected) {
    super(`${label}: expected ${format(expected)}, got ${format(actual)}`);
    this.label = label;
    this.actual = actual;
    this.expected = expected;
  }
}

function format(v) {
  return typeof v === "string" ? JSON.stringify(v) : String(v);
}

function harness(CreditSystem) {
  return {
    CreditSystem,
    eq: (actual, expected, label) => {
      if (actual !== expected) throw new AssertionError(label, actual, expected);
    },
    ok: (actual, label) => {
      if (actual !== true) throw new AssertionError(label, actual, true);
    },
    no: (actual, label) => {
      if (actual !== false) throw new AssertionError(label, actual, false);
    },
  };
}

let source;
try {
  source = await readFile(solutionPath, "utf8");
} catch {
  console.error(`Could not read ${solutionPath}`);
  process.exit(2);
}

let CreditSystem;
try {
  CreditSystem = new Function(`${source}\n;return typeof CreditSystem !== "undefined" ? CreditSystem : null;`)();
} catch (err) {
  console.error(`Your code did not load: ${err.message}`);
  process.exit(2);
}
if (typeof CreditSystem !== "function") {
  console.error("No class named CreditSystem was found in your file.");
  process.exit(2);
}

const dim = (s) => `[2m${s}[0m`;
const green = (s) => `[32m${s}[0m`;
const red = (s) => `[31m${s}[0m`;
const bold = (s) => `[1m${s}[0m`;

let passed = 0;
let failed = 0;

for (const suite of SUITES) {
  if (suite.optional && !includeOptional) continue;
  console.log(`\n${bold(suite.name)} ${dim("— " + suite.why)}`);
  for (const testCase of suite.cases) {
    const started = process.hrtime.bigint();
    let error = null;
    try {
      testCase.run(harness(CreditSystem));
    } catch (err) {
      error = err;
    }
    const ms = Number(process.hrtime.bigint() - started) / 1e6;
    if (!error && testCase.budgetMs && ms > testCase.budgetMs) {
      error = new Error(`took ${ms.toFixed(0)}ms, budget is ${testCase.budgetMs}ms`);
    }
    if (error) {
      failed++;
      console.log(`  ${red("FAIL")} ${testCase.name}`);
      console.log(`       ${error.message}`);
    } else {
      passed++;
      const timing = testCase.budgetMs ? dim(` (${ms.toFixed(0)}ms)`) : "";
      console.log(`  ${green("PASS")} ${testCase.name}${timing}`);
    }
  }
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
