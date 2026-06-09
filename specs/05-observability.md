# Observability

We can't claim *Fast & Efficient* or *Accurate* without measuring them. Observability is
first-class: we track **LLM cost, latency, and quality** for every scan, plus standard infra
health.

Two layers:

- **LangSmith** — the system of record for everything LLM: traces, token usage, cost, per-stage
  latency, and the eval runs (see [`06-evals.md`](./06-evals.md)). Native to LangChain, so we
  get it by instrumenting the chains, not by hand-rolling metrics.
- **CloudWatch** — infra/API health: Lambda duration, errors, throttles, API Gateway 4xx/5xx,
  DynamoDB consumed capacity.

## LLM observability (LangSmith)

Every `runOcr` and `analyzeText` call runs inside a LangSmith trace. Configure via environment
(no code changes at call sites):

```
LANGCHAIN_TRACING_V2=true
LANGCHAIN_API_KEY=...
LANGCHAIN_PROJECT=aya-<stage>     # e.g. aya-prod, aya-dev
```

**Tag every run** so we can slice the dashboards:

| Tag / metadata | Example | Lets us answer |
|----------------|---------|----------------|
| `stage` | `ocr` / `analysis` | Which call dominates cost & latency? |
| `pageId` | `0f2e…` | Trace one scan end-to-end |
| `model` | `claude-…` | Cost/quality by model version |
| `env` | `prod` / `dev` | Keep prod and dev separate |

**What we watch per stage:**
- **Cost:** input/output tokens and estimated $ per call → **cost per scan** (= OCR + analysis).
- **Latency:** wall-clock per call and per scan, against the ~15s PRD budget.
- **Volume:** scans per day, error rate by failure type.

These directly serve the North Stars: cost-per-scan keeps *Fast & Efficient* honest; latency
guards the *UX* budget.

## Per-scan application metrics

The API also emits one structured log line per scan (JSON, to CloudWatch Logs) so we have an
operational record independent of LangSmith:

```jsonc
{
  "event": "page_scanned",
  "pageId": "0f2e...",
  "ocrStatus": "ok",
  "ocrLatencyMs": 4200,
  "analysisLatencyMs": 7300,
  "totalLatencyMs": 11500,
  "phraseCount": 42,
  "ocrTokens":      { "input": 1800, "output": 260 },
  "analysisTokens": { "input": 520,  "output": 1900 },
  "estCostUsd": 0.031,
  "outcome": "ok"            // ok | image_unreadable | no_chinese_text | analysis_failed
}
```

From these we derive CloudWatch metric filters / dashboards for: p50/p95 scan latency, scan
success rate, cost per scan, and error breakdown.

## Infra observability (CloudWatch)

Standard managed-service signals, with alarms on the ones that affect users:

| Source | Watch | Alarm when |
|--------|-------|------------|
| Lambda | duration, errors, throttles, concurrency | error rate or p95 duration spikes |
| API Gateway | 4xx, 5xx, latency | 5xx rate above threshold |
| DynamoDB | consumed RCAPU/WCAPU, throttled requests | throttling occurs |
| S3 | upload failures (via Lambda) | repeated `image_not_found` |

## What "good" looks like

| Signal | Target | North Star |
|--------|--------|-----------|
| p95 scan latency | within the ~15s budget | UX-Centric, Fast |
| Cost per scan | tracked and trending down | Fast & Efficient |
| Scan success rate | high; failures are *clean* PRD errors, not 500s | Reliable |
| OCR accuracy / translation quality | meets eval thresholds | Accurate |

Cost and latency are reviewed continuously; quality is gated by evals in CI. Together they make
every North Star measurable rather than aspirational.
