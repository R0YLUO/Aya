---
name: project-manager
description: Give the human a concise, honest status report on the Aya build — what's implemented, what's actually verified vs only mock-tested, what's in progress, what's next, and what's pending the human (keys, accounts, devices). Use when the user asks "where are we at", "status update", "what's left", "what do you need from me", "project status", or asks any question about overall progress. Also handles resolving brain/handoffs/ items when the human reports them done.
---

# Project Manager

Bridge between the human and the agentic dev loop. Three sources, each answering a
different question:

| Source | Answers |
|---|---|
| `implementation_plan.json` | what's intended, and the done/progress/todo status of each task |
| `brain/` (index, packages, log) | what's actually built and how it was verified |
| `brain/handoffs/` | what only the human can do (keys, accounts, devices, e2e checks) |

The reader is a human who skims. Be complete on the important points, ruthless about
length.

## Procedure

### 1. Gather (do all of this before writing anything)

```bash
node .claude/skills/project-manager/scripts/plan-status.js
```

→ counts, per-category breakdown, in-progress tasks, ready tasks (deps met), blocked
tasks with their blockers.

Then:

- Read `brain/index.md`. Open every `brain/handoffs/` page with `status: open`.
- Skim the newest few `brain/log/` entries, plus `git log --oneline -10` and
  `git status --short`, to catch work (or drift) the plan/brain don't reflect yet —
  e.g. uncommitted changes or commits without a matching task. Mention drift if found.
- Open further brain pages **only** if needed to answer the user's actual question.

### 2. Answer the question first

If the user asked something specific ("is the API done?", "can I demo this?",
"what's blocking the web reader?"), answer that directly in the first sentence —
then give the standard report only if they asked for a general update.

### 3. Report format

Target well under 30 lines. One line per bullet. Omit empty sections. No spec
recaps, no narration of how you gathered this.

```
**Snapshot:** <done>/<total> tasks done · <n> in progress · <n> ready to build · <n> blocked.

**Needs you (<n>):**
- <action, imperative and concrete> — <what it unblocks/verifies> (brain/handoffs/<file>)

**In progress:** <taskId — one-line state, from the brain/log if known>

**Up next (ready):** <taskId>, <taskId>, … <call out the critical path if obvious>

**Done but not verified end-to-end:** <area — what real verification is missing>

**Risks / notes:** <only if genuinely worth the human's attention>
```

### 4. Maintain the handoff ledger

When the human says they've done a handoff item ("API key is set", "AWS is
configured"):

1. Run the **Verify after** steps on that handoff page if they're runnable from the
   shell; report the result honestly — don't mark resolved on say-so when a check
   exists and fails.
2. On success: set `status: resolved`, bump `updated`, note the verification result
   in the page body, and regenerate the index:
   `node brain/scripts/build-index.mjs`.
3. If resolving it unblocks plan tasks or other handoffs, say so.

You may also **create** a handoff (per the format in `brain/README.md`) when this
review uncovers a human-pending gap nobody recorded.

## Honesty rules (the whole point of this skill)

- **"Done" in the plan means acceptance criteria met — usually with mocks.** Never
  report something as *working* unless it was verified end-to-end (real API, real
  AWS, real device, or hermetic e2e like the web Playwright suite). Say which.
- Distinguish three levels explicitly when it matters: *code complete (unit/mock
  tested)* → *verified e2e* → *deployed*. Today nothing is deployed.
- Don't soften failures or gaps; don't pad with praise or process talk.
- Read-only toward the plan and code: never change task statuses, never start
  implementation work from this skill — name the next step and let the human invoke
  `product-implementation`. The only files this skill edits are `brain/handoffs/`
  pages (+ regenerated index).
