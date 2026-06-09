"use strict";

/**
 * Shared helpers for the product-implementation skill scripts.
 * No external dependencies — Node's stdlib only.
 */

const fs = require("fs");
const path = require("path");

const VALID_STATUSES = ["todo", "progress", "done"];
const PLAN_FILENAME = "implementation_plan.json";

/**
 * Resolve the path to implementation_plan.json.
 * Priority: --plan <path> arg  >  PLAN_PATH env  >  upward search from cwd.
 */
function resolvePlanPath(argv = process.argv.slice(2)) {
  const flagIdx = argv.indexOf("--plan");
  if (flagIdx !== -1 && argv[flagIdx + 1]) {
    return path.resolve(argv[flagIdx + 1]);
  }
  if (process.env.PLAN_PATH) {
    return path.resolve(process.env.PLAN_PATH);
  }
  // Walk up from cwd looking for the plan file.
  let dir = process.cwd();
  while (true) {
    const candidate = path.join(dir, PLAN_FILENAME);
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break; // reached filesystem root
    dir = parent;
  }
  // Fall back to cwd (load() will produce a clear error if absent).
  return path.join(process.cwd(), PLAN_FILENAME);
}

/** Strip --plan <path> from a positional arg list so callers see only real args. */
function positionalArgs(argv = process.argv.slice(2)) {
  const out = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--plan") {
      i++; // skip the value too
      continue;
    }
    out.push(argv[i]);
  }
  return out;
}

function loadPlan(planPath) {
  if (!fs.existsSync(planPath)) {
    throw new Error(`Plan file not found: ${planPath}`);
  }
  let raw;
  try {
    raw = fs.readFileSync(planPath, "utf8");
  } catch (err) {
    throw new Error(`Could not read plan file ${planPath}: ${err.message}`);
  }
  let plan;
  try {
    plan = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Plan file ${planPath} is not valid JSON: ${err.message}`);
  }
  if (!Array.isArray(plan)) {
    throw new Error(`Plan file ${planPath} must contain a JSON array of tasks.`);
  }
  return plan;
}

function savePlan(planPath, plan) {
  // Preserve 2-space indentation and a trailing newline to keep diffs clean.
  fs.writeFileSync(planPath, JSON.stringify(plan, null, 2) + "\n", "utf8");
}

module.exports = {
  VALID_STATUSES,
  PLAN_FILENAME,
  resolvePlanPath,
  positionalArgs,
  loadPlan,
  savePlan,
};
