---
title: project-manager skill + handoffs ledger added
type: log
packages: []
tasks: []
summary: New .claude/skills/project-manager (status reports for the human) and brain/handoffs/ (needs-a-human ledger); product-implementation now records verification gaps as handoffs.
updated: 2026-06-10
---

# 2026-06-10 — project-manager skill + handoffs ledger

- Added `brain/handoffs/` — one page per item only the human can do (`type: handoff`,
  `status: open | resolved`); schema/workflow documented in `brain/README.md`,
  rendered as the top section of the index by `build-index.mjs`.
- Seeded four open handoffs: Anthropic API key, LangSmith account, AWS account,
  mobile device run — all reflecting that current "done" tasks were verified with
  mocks only.
- New skill `.claude/skills/project-manager/` (+ `scripts/plan-status.js`): concise
  human-facing status report from plan + brain + handoffs, with honesty rules
  (done-with-mocks ≠ verified e2e ≠ deployed); also resolves handoffs.
- `product-implementation` skill updated: step 4 verification-honesty note, step 6
  handoff recording, report includes verification level; new guardrail. CLAUDE.md
  golden rule #11 added.
