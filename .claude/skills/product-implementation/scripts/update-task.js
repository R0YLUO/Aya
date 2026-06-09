#!/usr/bin/env node
"use strict";

/**
 * update-task.js — set a task's status in the implementation plan.
 *
 * Usage:
 *   node update-task.js <taskId> <status> [--plan <path>]
 *   node update-task.js api-router progress
 *   node update-task.js api-router done
 *
 * <status> must be one of: todo | progress | done
 *
 * When moving a task to "progress" or "done", the script WARNS (on stderr) if
 * the task's dependencies are not all "done" — it does not block, so you can
 * override deliberately, but you'll be told.
 *
 * Exit codes:
 *   0  updated (or already at the requested status — a no-op is reported)
 *   1  error (bad args, unknown taskId, invalid status, plan problems)
 */

const {
  VALID_STATUSES,
  resolvePlanPath,
  positionalArgs,
  loadPlan,
  savePlan,
} = require("./lib");

function main() {
  const [taskId, status] = positionalArgs();

  if (!taskId || !status) {
    throw new Error(
      "Usage: node update-task.js <taskId> <status> [--plan <path>]\n" +
        `  status must be one of: ${VALID_STATUSES.join(" | ")}`
    );
  }
  if (!VALID_STATUSES.includes(status)) {
    throw new Error(
      `Invalid status "${status}". Must be one of: ${VALID_STATUSES.join(" | ")}`
    );
  }

  const planPath = resolvePlanPath();
  const plan = loadPlan(planPath);

  const task = plan.find((t) => t.taskId === taskId);
  if (!task) {
    const known = plan.map((t) => t.taskId).join(", ");
    throw new Error(`No task with taskId "${taskId}". Known taskIds: ${known}`);
  }

  if (task.status === status) {
    console.error(`[update-task] "${taskId}" is already "${status}". No change.`);
    process.exit(0);
  }

  // Advisory dependency check when advancing work.
  if (status === "progress" || status === "done") {
    const byId = new Map(plan.map((t) => [t.taskId, t]));
    const unfinishedDeps = (task.dependencies || []).filter(
      (d) => !(byId.get(d) && byId.get(d).status === "done")
    );
    if (unfinishedDeps.length > 0) {
      console.error(
        `[update-task] WARNING: "${taskId}" has unfinished dependencies: ` +
          unfinishedDeps.join(", ")
      );
    }
  }

  const previous = task.status;
  task.status = status;
  savePlan(planPath, plan);

  console.error(
    `[update-task] "${taskId}": ${previous} -> ${status} (saved to ${planPath})`
  );
  process.exit(0);
}

try {
  main();
} catch (err) {
  console.error(`[update-task] ERROR: ${err.message}`);
  process.exit(1);
}
