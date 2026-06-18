---
name: start-work-day
description: Ralph-loop orchestrator that drives implementation_plan.json to completion by spawning one fresh sub-agent per task until every task is done (or the plan stalls). Use when the user wants to "run the loop", "orchestrate the implementation", "start the work day", "finish the plan", "build everything", "keep going until it's done", or otherwise asks for autonomous multi-task execution rather than a single next task.
---

# Start Work Day (Ralph-style orchestrator)

Drive `implementation_plan.json` to completion autonomously. This skill makes **you the
orchestrator**: you do not implement anything yourself — you dispatch one fresh sub-agent per
iteration, each of which runs the `product-implementation` skill to complete exactly **one**
task, then you verify the result and loop until the plan is done or genuinely stuck.

The design follows the Ralph loop principle: **all state lives in files, not in context**.
`implementation_plan.json` is the task queue, git is the history, `brain/` is the memory.
Every sub-agent starts cold and reorients from those files, so the loop survives any single
iteration failing, and your own context stays small no matter how many tasks run.

## Arguments

- *(none)* — loop until the plan is complete or stalled.
- `<N>` (a number) — complete at most N tasks this run, then report.
- `<taskId>` — loop until that specific task is `done` (its dependencies get built along the
  way because `next-task.js` respects plan order), then stop.

## Phase 0 — Preflight (once, before the first iteration)

1. **Require a clean working tree.** Run `git status --porcelain`. Sub-agents commit with
   `git add -A`, so any pre-existing uncommitted changes would be silently swept into the next
   task's commit. If the tree is dirty, **stop and ask the user** to commit/stash first — do
   not proceed and do not stash for them.
2. **Sync with the remote**: `git pull --ff-only` while the local tree has no unpushed work, to
   start from the latest state. (Sub-agents commit to local `main` and **do not push** — pushing
   to `main` is blocked by the harness — so the human pushes accumulated commits when ready.)
3. **Take the opening snapshot**:

   ```bash
   node .claude/skills/start-work-day/scripts/status.js
   ```

   - Exit **3** → the plan is already complete; report and stop.
   - Exit **4** → tasks remain but all are blocked by unfinished dependencies with nothing in
     progress; report the `blocked` list and stop.
   - Record `counts.done` — forward progress is measured against it every iteration.
4. **Set the iteration budget**: number of remaining tasks (`todo + progress`, capped by the
   `<N>` argument if given) **plus 3** spare iterations for recoveries/retries. If the budget
   runs out before the stop condition is met, stop and report — never loop unbounded.
5. **Handle a stale `progress` task.** If `inProgress` is non-empty at preflight, a previous
   run died mid-task. Make iteration 1 a **recovery iteration**: dispatch a sub-agent with the
   recovery prompt below instead of the standard one.

## The loop

Each iteration: **check → dispatch → verify → decide**. Run sub-agents **sequentially and in
the foreground** (no `run_in_background`, no parallel dispatch — every iteration commits to the
same branch (local `main`, not pushed), and each task may depend on the previous one's output).

### 1. Check

Run `status.js`:

- Exit **3** → plan complete. Go to the final report.
- Exit **4** → stalled (everything remaining is blocked, nothing in progress). Go to the
  final report and flag it.
- Stop-condition met (`<N>` tasks completed this run, or the target `<taskId>` is `done`) →
  final report.
- Otherwise continue.

### 2. Dispatch

Spawn a sub-agent with the Agent tool (`subagent_type: general-purpose`, foreground) with
this prompt, verbatim apart from the bracketed slot:

> You are one iteration of the Aya implementation loop. Complete exactly **one** task from
> `implementation_plan.json`, end to end.
>
> 1. Read `.claude/CLAUDE.md` and honour everything in it.
> 2. Run the `product-implementation` skill (if the Skill tool is unavailable, read
>    `.claude/skills/product-implementation/SKILL.md` and follow it exactly): pick the next
>    ready task with `next-task.js`, mark it `progress`, implement it to its
>    `acceptanceCriteria`, verify, mark it `done`, update `brain/` (including any
>    `brain/handoffs/` entry), and finish with **one commit to local `main`** (do NOT push)
>    whose subject contains the `[taskId]`.
> 3. Do exactly one task. Do not start a second.
> 4. If you cannot complete the task — failed verification, unexpected blocker, something
>    only a human can provide that prevents even mock-level completion — leave it in
>    `progress`, do **not** commit broken work, and report precisely what blocked you.
> 5. [Retry only: "A previous attempt at this task failed. Here is what went wrong: <failure
>    summary>. Diagnose before re-implementing."]
>
> Report back: the taskId, its final status, the commit hash (or "none"), the verification
> level achieved (real vs mocked, which checks ran), and any handoff entries you created.

**Recovery prompt** (stale `progress` task at preflight): same framing, but instead of
picking a new task, instruct the agent to assess the named in-progress task — check
`git log` for a `[taskId]` commit and `git status` for abandoned work — then either finish
it properly through the skill's remaining steps, or reset it with
`node .claude/skills/product-implementation/scripts/update-task.js <taskId> todo` and
discard any unverifiable leftovers, reporting which it chose and why.

### 3. Verify — never take the sub-agent's word for it

The agent's report is a claim; the files are the truth. Check, from the orchestrator:

```bash
node .claude/skills/start-work-day/scripts/status.js   # done-count up by one? task status right?
git log --oneline -2                                        # newest subject contains the [taskId]?
git status --porcelain                                      # tree clean (work fully committed)?
```

An iteration **succeeded** only if: the claimed task is `done` in the plan, `counts.done`
increased, the newest commit subject contains the taskId, and the tree is clean. Anything
else — including "agent says done but plan says progress", or a dirty tree — is a **failure**.

Do not re-review the implementation itself (no reading diffs or source). Quality is the
sub-agent's job, enforced by the skill's own verification gates; yours is dispatch, state
integrity, and progress accounting. Reading code inflates your context and kills the loop.

### 4. Decide

- **Success** → next iteration. Append one line to your running tally (taskId, commit,
  verification level, handoffs) for the final report.
- **Failure, first time for this task** → retry **once**: dispatch a fresh sub-agent with the
  retry slot filled with a short summary of what went wrong. A fresh context plus the failure
  summary is the Ralph-loop recovery mechanism — do not try to fix it yourself.
- **Failure, second time for the same task** → stop the loop. Leave the task exactly as the
  failed agent left it (in `progress`, uncommitted work intact) so the human can inspect it.
  Report both failure summaries.
- **No-progress iteration** (agent returned "success" but verification shows nothing changed)
  → counts as a failure for that task.

## Final report

Always end with, in this order:

1. **Outcome**: plan complete / stop condition reached / stalled / halted on repeated failure
   / iteration budget exhausted.
2. **Completed this run**: taskId → commit, one line each, flagging any that were verified
   only with mocks.
3. **Handoffs opened** during the run (anything now pending the human) — point the user at
   the `project-manager` skill for the consolidated view.
4. **Remaining work**: the `status.js` snapshot — what's ready, what's blocked and on what.
5. If halted or stalled: exactly what the human needs to do to unblock the loop.

## Scripts reference

| Script | Purpose |
|--------|---------|
| `scripts/status.js` | JSON plan snapshot: counts, in-progress, ready, blocked-with-reasons. Exit 0 = actionable work remains, 3 = plan complete, 4 = stalled. |

Plus the `product-implementation` scripts (`next-task.js`, `update-task.js`) — used by
sub-agents, and by you only for recovery resets.

## Guardrails

- **Orchestrate, don't implement.** If you catch yourself editing source files or running the
  build to "just fix" a failed task, stop — that's a sub-agent's job, on a fresh dispatch.
- **One sub-agent at a time.** Parallel dispatch needs worktree isolation and a merge story;
  that's a deliberate future extension (record an ADR), not a flag to flip mid-run.
- **Two strikes per task, then a human.** Endless retries on the same failing task burn money
  and hide a real problem. Same for the global iteration budget.
- **Never bypass the sub-agent's gates.** Don't mark tasks `done` from the orchestrator, don't
  commit on a sub-agent's behalf, and don't relax the product-implementation skill's
  verification to keep the loop moving. A stopped loop is honest; a green-but-broken plan is
  not.
- **A dirty preflight tree is the user's call.** Their uncommitted work must never ride into
  an agent's task commit.
