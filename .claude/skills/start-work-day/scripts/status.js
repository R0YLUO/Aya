"use strict";

/**
 * Plan status snapshot for the start-work-day orchestrator.
 * Reuses the product-implementation skill's plan helpers — one source of truth
 * for locating/parsing implementation_plan.json.
 *
 * Prints a JSON summary on stdout. Exit codes:
 *   0 — work remains and is actionable (something ready, or a task is in progress)
 *   3 — plan complete: every task is done
 *   4 — stalled: tasks remain but none are ready and none are in progress
 *   1 — plan file problem (message on stderr)
 */

const {
  resolvePlanPath,
  loadPlan,
} = require("../../product-implementation/scripts/lib.js");

let planPath;
let plan;
try {
  planPath = resolvePlanPath();
  plan = loadPlan(planPath);
} catch (err) {
  console.error(`[status] ${err.message}`);
  process.exit(1);
}

const byId = new Map(plan.map((t) => [t.taskId, t]));
const inProgress = plan.filter((t) => t.status === "progress");
const todo = plan.filter((t) => t.status === "todo");
const doneCount = plan.filter((t) => t.status === "done").length;

const ready = [];
const blocked = [];
for (const t of todo) {
  const waitingOn = (t.dependencies || []).filter(
    (d) => byId.get(d)?.status !== "done"
  );
  if (waitingOn.length === 0) {
    ready.push(t.taskId);
  } else {
    blocked.push({ taskId: t.taskId, waitingOn });
  }
}

console.log(
  JSON.stringify(
    {
      planPath,
      total: plan.length,
      counts: { done: doneCount, progress: inProgress.length, todo: todo.length },
      inProgress: inProgress.map((t) => t.taskId),
      ready,
      blocked,
    },
    null,
    2
  )
);

if (todo.length === 0 && inProgress.length === 0) process.exit(3);
if (ready.length === 0 && inProgress.length === 0) process.exit(4);
process.exit(0);
