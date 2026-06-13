---
title: "evals-scorer-pinyin: deterministic pinyin scorer with polyphone exceptions"
type: log
packages: [evals]
tasks: [evals-scorer-pinyin]
summary: Added src/pinyin.ts — scorePinyin/summarisePinyin comparing model pinyin to pinyin-pro's library reading of the same characters, with single-char alternate-reading fallback and a small explicit polyphone exception list, reporting a mismatch rate that excludes excused polyphones. Wired it into run-evals' analysis stage. 13 new offline tests; 46 evals tests pass.
updated: 2026-06-13
---

# evals-scorer-pinyin

Implemented the third eval dimension (specs/06-evals.md): a deterministic pinyin
check that compares the model's pinyin for each phrase to a pinyin library's reading
of the **same characters**, reporting a mismatch rate. This is not an LLM judge — it
is a cheap, repeatable guard.

## What I built

- `packages/evals/src/pinyin.ts`:
  - `referencePinyin(token)` — pinyin-pro's tone-symbol, space-separated reading.
  - `characterReadings(char)` — all valid readings of a single character (`multiple`).
  - `normalizePinyin` (lower-case, collapse whitespace, trim) + `stripTones` (NFD strip
    of combining diacritics) — so proper-noun capitalisation (`Lǔ Xùn` vs `lǔ xùn`) and
    spacing never count as a mismatch, while tone marks stay significant.
  - `scorePinyin(token, predicted)` → `{ token, predicted, reference, match,
    polyphoneException }`. Match = exact normalised hit, OR (single-char) any of the
    character's valid readings, OR a `DEFAULT_POLYPHONE_EXCEPTIONS` entry / tone-only
    difference for a listed token. The last three set `polyphoneException`.
  - `summarisePinyin(tokens)` → counts + `mismatchRate` where polyphone exceptions are
    excluded from the denominator (PRD target: near-0 on common vocabulary).
- Wired into `run-evals.ts`: `scoreAnalysis` now scores every predicted phrase that has
  a non-null pinyin and a Han character, and the report carries
  `analysis.pinyinScored / pinyinMismatches / pinyinMismatchRate`, printed under the
  Analysis line.
- Exported the new API from the barrel.

## Key decisions

- **pinyin-pro** (^3.28.1) as the reference library, added as a **runtime** dependency
  (the scorer imports it eagerly; it is small/offline, unlike the lazy `langsmith`
  import). Verified its output matches the seeded gold pinyin exactly for the analysis
  fixtures (incl. tone sandhi `一起` → `yì qǐ`, proper noun `鲁迅` → `lǔ xùn`).
- Two-layered polyphone handling: per-character fallback (any valid reading of a
  single char) plus a deliberately small, documented `DEFAULT_POLYPHONE_EXCEPTIONS`
  list for multi-char tokens / tone sandhi — rather than loosening the matcher globally.

## Verification

- `npm run test -w @aya/evals` — 46 tests pass (13 new: normalize/reference/character
  readings/stripTones, exact match, case-insensitive proper noun, clear mismatch,
  single-char polyphone, listed tone-only exception, summary mismatch-rate /
  clean-batch / empty-batch, plus the run-evals gold-aligned pinyin assertion).
- `npm run typecheck && npm run lint && npm run build` — all green.
- `npm run eval -w @aya/evals` — runs offline; model stages skip without a key.
- All offline against fixtures + the deterministic library. No real Anthropic/LangSmith
  call — covered by the existing anthropic-api-key / langsmith-account handoffs (the
  pinyin check will run over real model output once those land); no new handoff needed.
