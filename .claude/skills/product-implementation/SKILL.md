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
several. Each iteration ends by **committing** the finished task (step 7), then stop and report
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

- **Query the brain first**: read `brain/index.md`, then the brain pages for the package(s)
  and concept(s) the task touches. They tell you what already exists, the conventions to
  follow, and known gotchas — so you read only the code the brain points you at
  (see `brain/README.md`).
- Read the relevant `specs/` doc(s) for the task's area — they are the source of truth for
  intent (see the repo `CLAUDE.md`).
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

For tasks that touch `packages/web` UI or routes, also run the Playwright e2e suite —
`npm run test:e2e -w @aya/web` — and use the `ui-verify` skill for setup, fixtures, and
screenshot-based visual checks. This is the web analogue of the eval gate on `packages/llm`.

**Be honest about the level of verification you achieved.** If the acceptance criteria
could only be met with mocks/stubs and real end-to-end verification needs something only
the human can provide (an API key, an AWS/LangSmith account, a physical device, a
deployment), the task may still be marked done — but you **must** record the gap as a
handoff in step 6 so it surfaces to the human instead of being silently absorbed.

### 5. Mark it done

Only after the acceptance criteria are demonstrably met:

```bash
node .claude/skills/product-implementation/scripts/update-task.js <taskId> done
```

### 6. Update the brain (ingest the task)

Fold what you built and learned into the as-built knowledge base, per the ingest workflow in
`brain/README.md`:

- Update `brain/packages/<package>.md` for each package you touched (status, what lives
  where, conventions, gotchas).
- Create/update `brain/concepts/` pages for cross-cutting behaviour you built or had to work
  out; record notable implementation decisions in `brain/decisions/`.
- **Record handoffs**: if anything about this task is pending the human — end-to-end
  verification blocked on a key/account/device, a setup step, a decision — create
  `brain/handoffs/<slug>.md` (`type: handoff`, `status: open`) per the format in
  `brain/README.md`, or add your taskId to an existing handoff that already covers the
  gap. The `project-manager` skill reports these to the human.
- Add a log entry `brain/log/YYYY-MM-DD--<taskId>.md`.
- Regenerate the index: `node brain/scripts/build-index.mjs`.

Keep pages short and as-built (no spec duplication). These changes ride in the task's commit
(step 7), so the brain and the code stay consistent at every commit.

### 7. Commit the completed task

Every completed task ends with **one commit** that captures all of its work, including the
`implementation_plan.json` status change and the brain updates (step 6). Stage and commit
from the repo root:

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

Then report: what was built, how it satisfies the acceptance criteria, **what level of
verification was achieved (and any handoff recorded for the gap)**, the commit you made, and
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
- **One commit per completed task.** A task isn't finished until its work is committed (step 7).
  Never commit a task that didn't pass verification, and never push unless the user asks.
- **The brain is part of the task.** Don't skip step 6 — a task whose knowledge never lands in
  `brain/` forces the next agent to rediscover it from the code.
- **Done ≠ verified end-to-end.** Marking a task done on mock-level verification without
  recording the handoff for the remaining gap hides work from the human and breaks the
  `project-manager` skill's reporting. When in doubt, write the handoff.
