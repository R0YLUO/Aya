---
title: "Decision: temperature stays config but is sent per-provider"
type: decision
packages: [llm]
tasks: [llm-run-ocr, llm-provider-abstraction]
summary: temperature is fixed 0 as documented intent, but whether it is SENT is per-provider — Anthropic models reject it (sendTemperature:false), Gemini/OpenAI accept it (true). The flag lives in the PROVIDERS table.
updated: 2026-06-18
---

# Temperature: documented as 0, sent per-provider

**Context.** The spec (specs/04-llm-pipeline.md) and `ModelSpec` fix `temperature: 0`
for determinism. But current **Anthropic** models reject the `temperature` parameter,
while Gemini/OpenAI accept (and benefit from) it.

**Decision.** Now that the LLM layer is provider-agnostic ([[llm-provider-abstraction]]),
the omit-vs-send choice is **per-provider, not a default**. The `PROVIDERS` table in
`packages/llm/src/config.ts` carries `sendTemperature`: `false` for `anthropic`, `true`
for `google-genai` / `openai`. `createStructuredRunner` (`packages/llm/src/model.ts`)
spreads `temperature: 0` into the `initChatModel` fields **only when `spec.sendTemperature`
is true**. `ModelSpec.temperature: 0` (literal type) remains the documented intent.

**Consequences.**
- Don't hard-code temperature at a call site — it's resolved from the provider table.
- Adding a provider means setting its `sendTemperature` correctly in the one table.
- If a future Anthropic model accepts the param, flip its row to `true` and run evals
  (provider/model-config changes are eval-gated).
- The literal `temperature: 0` type means nobody can quietly raise it.
