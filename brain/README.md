# The Brain — Aya's as-built knowledge base

This directory is a persistent, LLM-maintained wiki describing **what has actually been
built** in this repository: where things live, how they connect, the conventions that
emerged during implementation, and the decisions made along the way. Agents write it;
humans read it. It exists so that every new coding session — especially parallel
sub-agents in worktrees — starts from accumulated knowledge instead of a cold read of
the whole codebase.

**Division of truth** (never duplicate across these layers):

| Layer | Role |
|---|---|
| `specs/` | *Prescriptive* — what should be built (PRD, architecture, ADRs). |
| The code | *The implementation* — the only truth about behaviour. |
| `brain/` | *As-built* — the map between the two: what exists, where, how it connects, conventions, deviations, gotchas. |

If something is already plainly stated in a spec or obvious from a single source file,
it does not belong here. The bar: *would an agent need to read more than one file to
learn this?*

## Structure

```
brain/
  README.md      ← this schema (conventions + workflows)
  index.md       ← GENERATED catalog — never edit by hand (see scripts/build-index.mjs)
  packages/      ← one as-built page per workspace package
  concepts/      ← cross-cutting topics (flows, conventions, contracts)
  decisions/     ← implementation-level decisions too small for an ADR in specs/08
  handoffs/      ← one file per item that needs the human (keys, accounts, manual verification)
  log/           ← one small file per ingest event (chronological record)
  scripts/       ← node-stdlib-only tooling (build-index.mjs)
```

## Page format

Every page (except this README and the generated `index.md`) starts with YAML
frontmatter:

```yaml
---
title: Short page title
type: package | concept | decision | handoff | log
packages: [api, llm]        # workspace packages the page concerns (may be empty)
tasks: [llm-run-ocr]        # implementation_plan.json taskIds that shaped the page
summary: One line for the index — write it for an agent deciding whether to open this page.
updated: 2026-06-10
---
```

Handoff pages additionally require `status: open | resolved`.

Conventions:

- **Markdown links, relative to the repo root reader** — link pages as
  `[llm](../packages/llm.md)` and code as `packages/llm/src/model.ts`. Plain relative
  links work in editors, on GitHub, and in Obsidian.
- **Short pages.** Target well under 150 lines. If a page grows past that, split a
  concept out.
- **Reference code by path** (and symbol name), not by copying code in. Copied code
  goes stale silently; a path is checkable.
- **Date everything relevant** with absolute dates; bump `updated` whenever you edit.
- **Flag uncertainty and gaps explicitly** (e.g. "not yet built — see task
  `api-router`") rather than describing planned work as if it exists.

## Workflows

### Ingest (the unit is one completed plan task)

Performed as a step of the `product-implementation` skill, **before the task's
commit**, so the brain in any commit is consistent with the code in that commit:

1. Update the `brain/packages/` page(s) for the package(s) you touched.
2. Create/update `brain/concepts/` pages for anything cross-cutting you built,
   discovered, or had to work out (non-obvious interactions belong here, not in chat
   history).
3. If you made a notable implementation decision (a deviation, a workaround, a
   choice between real alternatives), record it in `brain/decisions/`.
4. Append a log entry: `brain/log/YYYY-MM-DD--<taskId>.md` (type `log`, a few lines:
   what was built, which brain pages were touched, anything surprising).
5. Regenerate the index: `node brain/scripts/build-index.mjs`.
6. Commit the brain changes **with the task's code** in the task's single commit.

### Handoffs (the needs-a-human ledger)

A **handoff** records something only the human can do: provide a secret or account
(API keys, AWS, LangSmith), run something on a real device, make a paid/owned-resource
decision, or verify behaviour end-to-end where tests could only use mocks.

- **When to write one:** during ingest, whenever a task is marked `done` on the
  strength of mocked/stubbed verification but its real end-to-end behaviour is still
  unproven pending a human-supplied resource — or whenever you discover a human
  prerequisite for upcoming work. "Done" in the plan means *acceptance criteria met*;
  the handoff is how the remaining gap stays visible instead of silently absorbed.
- **Format:** `handoffs/<slug>.md`, type `handoff`, `status: open`, with three short
  sections: **What's needed** (the exact action, copy-pasteable where possible),
  **Why** (what is unverified/blocked without it), **Verify after** (how an agent
  confirms it once provided). List the affected `tasks:` in frontmatter.
- **One file per item** (merge-safe, like `log/`). If a handoff already covers your
  gap (e.g. "Anthropic API key"), add your taskId to its `tasks:` list and extend the
  body — don't create a duplicate.
- **Resolving:** when the human has done the thing (and it's been verified per the
  page), set `status: resolved`, bump `updated`, and regenerate the index. The
  `project-manager` skill reports open handoffs and handles resolution.

### Query (start every task here)

Before designing or reading code: read `brain/index.md`, open the pages for the
package(s) and concept(s) the task touches, then the relevant `specs/` doc. Only then
read code, and only what the brain points you at.

### Lint (after every parallel-work integration merge)

Whenever subtree/worktree work is merged together, run a brain-lint pass:

- contradictions between pages written by different agents;
- claims now stale against the merged code (spot-check paths and symbols);
- orphan pages (nothing links to them) and concepts mentioned but pageless;
- log entries missing for merged tasks;
- regenerate `index.md`.

Record the pass as a log entry: `brain/log/YYYY-MM-DD--lint.md`.

## Merge safety (parallel agents)

- `index.md` is **generated** — never hand-edit. After any merge, regenerate it; a
  conflict in it is resolved by regeneration, not by hand.
- The log is **one file per event**, so parallel agents never write the same log
  file. `ls brain/log/` is the timeline.
- Content-page conflicts are expected to be rare (agents work in different packages);
  when two agents touch the same concept page, the post-merge lint pass reconciles.
