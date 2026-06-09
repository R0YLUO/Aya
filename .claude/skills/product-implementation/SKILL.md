---
name: product-implementation
description: Implement the Aya product from implementation_plan.json one task at a time. Use when the user wants to build out the planned work, "implement the next task", "work through the plan", "continue the implementation", or pick up the next ready-to-build task. Picks the first todo task whose dependencies are done, marks it in progress, implements it against its acceptanceCriteria, then marks it done.
---

# Product Implementation

Drive the Aya build forward by executing `implementation_plan.json` one encapsulated task
at a time. Each task carries its own `acceptanceCriteria` — treat those as the definition of
done and, where practical, as the test cases to write first (TDD).

## When to use

- "Implement the next task" / "continue the plan" / "work through the implementation plan".
- Whenever you need to know which task is actionable next and then build it.

## The loop

Work **one task per iteration** unless the user explicitly asks you to continue through
several. Each iteration ends by **committing** the finished task (step 6), then stop and report
what you did before picking the next one.

### 1. Pick the next ready task

```bash
node .claude/skills/product-implementation/scripts/next-task.js
```

- Prints the selected task as JSON on **stdout** (taskId, description, dependencies,
  acceptanceCriteria, category). Diagnostics go to **stderr**.
- It selects the **first** `todo` task (in plan order) whose `dependencies` are empty or all
  `done`.
- **Exit code 3** means nothing is actionable: either everything is `done`, or all remaining
  `todo` tasks are blocked by unfinished dependencies (the blockers are listed on stderr).
  Report that to the user and stop — do not invent work.
- **Exit code 1** means a problem with the plan file; surface the error.

### 2. Mark it in progress

Before writing any code, claim the task:

```bash
node .claude/skills/product-implementation/scripts/update-task.js <taskId> progress
```

### 3. Implement it

- Read the relevant `architecture/` (`specs/`) doc(s) for the task's area first — they are the
  source of truth (see the repo `CLAUDE.md`).
- Honour the repo's golden rules: types live once in `packages/shared`; LLM output is
  Zod-validated; keep the scan path to two LLM calls and stateless; no secrets in code.
- Build strictly to the task's `acceptanceCriteria`. Prefer writing the tests the criteria
  describe, then making them pass.
- Stay within the task's scope — if you discover the work actually needs a dependency that is
  still `todo`, stop and tell the user rather than silently expanding scope.

### 4. Verify against acceptance criteria

Run the checks the criteria imply — typically:

```bash
npm run typecheck && npm run lint && npm run build
```

plus any package-specific tests/evals the task names. Do not mark a task done if these fail.

### 5. Mark it done

Only after the acceptance criteria are demonstrably met:

```bash
node .claude/skills/product-implementation/scripts/update-task.js <taskId> done
```

### 6. Commit the completed task

Every completed task ends with **one commit** that captures all of its work, including the
`implementation_plan.json` status change. Stage and commit from the repo root:

```bash
git add -A
git commit -m "<type>(<scope>): <summary> [<taskId>]"
```

- Use a concise Conventional-Commits-style subject and always include the `taskId` so the
  commit maps back to the plan (e.g. `chore(repo): add shared base tsconfig & lint config
  [repo-base-tsconfig]`).
- One commit per task — don't bundle multiple tasks into a single commit, and don't leave the
  task's work uncommitted.
- Commit only when the task is `done` and verification passed. If checks failed (see the
  guardrail below), leave the work uncommitted and the task in `progress`.
- Follow the repo's commit conventions in `CLAUDE.md` (including the trailing `Co-Authored-By`
  line). Do **not** push unless the user asks.

Then report: what was built, how it satisfies the acceptance criteria, the commit you made, and
what the next ready task would be (you may run `next-task.js` again to show it).

## Scripts reference

| Script | Purpose |
|--------|---------|
| `scripts/next-task.js` | Print the next `todo` task whose dependencies are all `done`. Exit 3 if none. |
| `scripts/update-task.js <taskId> <status>` | Set a task's status to `todo` \| `progress` \| `done`. Warns (does not block) if advancing a task whose dependencies aren't done. |
| `scripts/lib.js` | Shared helpers (plan location/load/save). Not run directly. |

Both runnable scripts locate `implementation_plan.json` by walking up from the current
directory. Override with `--plan <path>` or the `PLAN_PATH` env var if needed. They use only
Node's standard library (Node >= 22) — no install step.

## Guardrails

- **One source of truth for status:** always change task status through `update-task.js`, never
  by hand-editing the JSON, so the file stays well-formed.
- **Don't skip the dependency order.** Trust `next-task.js` to pick what's ready; if it returns
  exit 3, the right move is to finish blockers, not to force a blocked task.
- **Stop on failure.** If implementation or verification fails, leave the task in `progress`,
  report the failure, and let the user decide — don't mark it `done` and don't commit.
- **One commit per completed task.** A task isn't finished until its work is committed (step 6).
  Never commit a task that didn't pass verification, and never push unless the user asks.
