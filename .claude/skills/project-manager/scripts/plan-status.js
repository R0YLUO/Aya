"use strict";

/**
 * Summarise implementation_plan.json for the project-manager skill.
 * Prints a JSON summary on stdout. Node stdlib only.
 *
 * Usage: node .claude/skills/project-manager/scripts/plan-status.js [--plan <path>]
 */

const { resolvePlanPath, loadPlan } = require("../../product-implementation/scripts/lib.js");

function summarise(plan) {
  const byId = new Map(plan.map((t) => [t.taskId, t]));
  const isDone = (id) => byId.get(id)?.status === "done";

  const counts = { total: plan.length, done: 0, progress: 0, todo: 0 };
  const byCategory = {};
  const inProgress = [];
  const ready = [];
  const blocked = [];

  for (const task of plan) {
    counts[task.status] = (counts[task.status] ?? 0) + 1;
    const cat = (byCategory[task.category] ??= { done: 0, progress: 0, todo: 0 });
    cat[task.status] = (cat[task.status] ?? 0) + 1;

    const brief = { taskId: task.taskId, category: task.category };
    if (task.status === "progress") {
      inProgress.push(brief);
    } else if (task.status === "todo") {
      const unmet = (task.dependencies ?? []).filter((d) => !isDone(d));
      if (unmet.length === 0) ready.push(brief);
      else blocked.push({ ...brief, blockedOn: unmet });
    }
  }

  return { counts, byCategory, inProgress, ready, blocked };
}

try {
  const planPath = resolvePlanPath();
  console.log(JSON.stringify({ plan: planPath, ...summarise(loadPlan(planPath)) }, null, 2));
} catch (err) {
  console.error(`plan-status: ${err.message}`);
  process.exit(1);
}
