---
title: "Decision: temperature stays config but is not sent to the API"
type: decision
packages: [llm]
tasks: [llm-run-ocr]
summary: Current Anthropic models reject the temperature param; createStructuredRunner omits it by default (sendTemperature flag) while config keeps temperature 0 documented.
updated: 2026-06-10
---

# Temperature: documented as 0, omitted from requests

**Context.** The spec (specs/04-llm-pipeline.md) and `LlmConfig` fix
`temperature: 0` for determinism. But current Anthropic models reject the
`temperature` parameter on requests.

**Decision.** `createStructuredRunner` (`packages/llm/src/model.ts`) takes
`opts.sendTemperature`, **defaulting to false**: production requests omit the
parameter entirely, while `StageConfig.temperature: 0` remains as documented intent.

**Consequences.**
- Don't "fix" the missing temperature by passing it — requests would start failing.
- If a future model accepts it again, flip the default deliberately and run evals
  (prompt/model-config changes are eval-gated).
- The type `temperature: 0` (literal) means nobody can quietly raise it.
