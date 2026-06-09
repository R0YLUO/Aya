#!/usr/bin/env node
"use strict";

/**
 * next-task.js — pick the next actionable task from the implementation plan.
 *
 * Selects the FIRST task (in array order) whose status is "todo" and whose
 * dependencies are either empty or all "done". Prints that task as JSON to
 * stdout. Diagnostics go to stderr so stdout stays machine-parseable.
 *
 * Usage:
 *   node next-task.js [--plan <path/to/implementation_plan.json>]
 *
 * Exit codes:
 *   0  a task was selected (printed as JSON on stdout)
 *   3  no actionable task (all done, or remaining todos are blocked)
 *   1  error (missing/invalid plan file, etc.)
 */

const { resolvePlanPath, loadPlan } = require("./lib");

function main() {
  const planPath = resolvePlanPath();
  const plan = loadPlan(planPath);

  const byId = new Map(plan.map((t) => [t.taskId, t]));
  const isDone = (id) => byId.get(id) && byId.get(id).status === "done";

  const depsSatisfied = (task) =>
    !Array.isArray(task.dependencies) ||
    task.dependencies.length === 0 ||
    task.dependencies.every(isDone);

  const todos = plan.filter((t) => t.status === "todo");
  const picked = todos.find(depsSatisfied);

  if (picked) {
    // Machine-readable task on stdout.
    process.stdout.write(JSON.stringify(picked, null, 2) + "\n");
    console.error(
      `[next-task] Selected "${picked.taskId}" (${picked.category}) from ${planPath}`
    );
    process.exit(0);
  }

  // Nothing actionable — explain why on stderr.
  if (todos.length === 0) {
    const remaining = plan.filter((t) => t.status !== "done");
    if (remaining.length === 0) {
      console.error("[next-task] All tasks are done. 🎉");
    } else {
      console.error(
        `[next-task] No tasks in "todo" status. ${remaining.length} task(s) still in progress: ` +
          remaining.map((t) => `${t.taskId}(${t.status})`).join(", ")
      );
    }
  } else {
    console.error(
      "[next-task] All remaining todo tasks are blocked by unfinished dependencies:"
    );
    for (const t of todos) {
      const blockers = (t.dependencies || []).filter((d) => !isDone(d));
      console.error(`  - ${t.taskId} waiting on: ${blockers.join(", ")}`);
    }
  }
  process.exit(3);
}

try {
  main();
} catch (err) {
  console.error(`[next-task] ERROR: ${err.message}`);
  process.exit(1);
}
