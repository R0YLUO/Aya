---
name: brain-lint
description: Health-check the brain/ knowledge base against the code. Use after merging parallel worktree/subtree work, when the user asks to "lint the brain", "check the brain", or suspects brain pages have gone stale or contradictory.
---

# Brain Lint

Audit `brain/` (the as-built knowledge base — schema in `brain/README.md`) for staleness,
contradictions, and gaps. Run this after every integration merge of parallel agent work, or
on request.

## The pass

1. **Orient.** Read `brain/index.md` and `ls brain/log/ | tail -10`. Compare against
   `git log --oneline -20` and the task statuses in `implementation_plan.json`:
   - Is there a `brain/log/` entry for each task completed since the last lint?
   - Any merged work with no brain trace at all? (List the missing taskIds.)
2. **Verify claims against code.** For each brain page touched since the last lint (or all
   pages if few), spot-check that referenced file paths exist and named exports/behaviours
   still match (`grep` the symbol; read only what's needed). Fix stale claims; bump
   `updated`.
3. **Reconcile contradictions.** Where two pages (often from different agents) disagree,
   read the code to decide, fix both, and link them.
4. **Structural health.**
   - Status blocks ("done / in progress / todo") in package pages match
     `implementation_plan.json`.
   - Concepts referenced in several pages but lacking their own page → create it.
   - Orphan pages nothing links to → link or fold into another page.
   - Pages over ~150 lines → split.
5. **Regenerate** the index (`node brain/scripts/build-index.mjs`) — also the fix for any
   merge conflict in `index.md`.
6. **Record the pass** as `brain/log/YYYY-MM-DD--lint.md`: what was checked, what was fixed,
   open questions for the user.

## Guardrails

- Fix the brain, not the code: if the code looks wrong against a spec, report it — a lint
  pass never changes `packages/*` or `specs/`.
- Never hand-edit `brain/index.md`.
- If the working tree is dirty with unrelated work, commit lint fixes separately:
  `docs(brain): lint pass — <summary>`.
