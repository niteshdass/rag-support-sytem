# Eval methodology

## Overview

Two evaluation tiers:

1. **Built-in metrics** (TypeScript, no extra deps): citation recall, hallucination detection, confidence, latency, auto-resolve rate. Always runs.
2. **Ragas metrics** (Python sidecar, optional `--ragas` flag): faithfulness, answer relevancy, context precision. Requires a configured LLM.

---

## Running evals

```bash
# Built-in metrics only
npm run eval

# Built-in + Ragas
npm run eval -- --ragas
```

Results are saved to MongoDB `evalRuns` collection and printed to stdout.

---

## Ragas sidecar

`scripts/eval/ragas_eval.py` reads a JSON array from stdin and writes metrics JSON to stdout. `runEval.ts` spawns it via `child_process.spawnSync` when `--ragas` is passed.

### Python venv setup

```bash
# From project root
python3 -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

Verify:

```bash
echo '[{"query":"test","answer":"answer","contexts":["context text"]}]' | python3 scripts/eval/ragas_eval.py
```

### LLM backend

Ragas metrics require an LLM to evaluate. Set one of these env vars (`.env`):

| Var | Backend | Cost |
|-----|---------|------|
| `GROQ_API_KEY` | Groq (llama-3.1-8b-instant) | Free tier |
| `OPENAI_API_KEY` | OpenAI (gpt-4o-mini) | Pay per token |

Groq is preferred — it's on the project's free-tier stack. Answer relevancy also uses OpenAI embeddings; if only `GROQ_API_KEY` is set (no `OPENAI_API_KEY`), faithfulness and context precision still run but answer relevancy is skipped.

```env
# .env
GROQ_API_KEY=gsk_...
```

---

## Metrics

### Built-in

| Metric | Description |
|--------|-------------|
| `citationRecall` | Fraction of `mustReferenceDocIds` that appear in the answer's citations |
| `hallucinationFlag` | True if any `mustNotHallucinate` term appears in the response |
| `confidence` | Pipeline confidence score (0–1) |
| `latencyMs` | End-to-end pipeline latency |
| `autoResolveRate` | Fraction of entries routed to `auto` |

### Ragas

| Metric | Description |
|--------|-------------|
| `faithfulness` | Are all claims in the answer supported by the retrieved contexts? (0–1) |
| `answerRelevancy` | Is the answer relevant to the question? (0–1) |
| `contextPrecision` | Are the retrieved contexts relevant given the expected answer? (0–1, requires `reference`) |

`contextPrecision` only runs when all golden set entries have an `expectedAnswerSummary` (used as the reference ground truth).

---

## Golden set

`scripts/eval/golden_set.jsonl` — one JSON object per line:

```jsonl
{
  "id": "gs-001",
  "query": "...",
  "audience": "end-user" | "agent",
  "expectedAnswerSummary": "...",
  "mustReferenceDocIds": ["docId1"],
  "mustNotHallucinate": ["term1"]
}
```

The golden set version is the SHA-256 of the file contents (first 12 chars). It is stored in each `EvalRun` document so quality regressions can be traced back to the exact golden set used.

Expand the golden set as the product evolves. Target: 200+ entries covering common questions, edge cases, and intentionally hard cases that stress retrieval.

---

## Interpreting results

- **`citationRecall < 0.8`**: retrieval is missing expected documents — check chunk size, embedding model, or whether documents were indexed.
- **`hallucinationRate > 0.05`**: LLM is inventing facts — tighten the system prompt or lower the confidence threshold.
- **`faithfulness < 0.7`**: answers diverge from retrieved context — possible prompt or model issue.
- **`contextPrecision < 0.6`**: retrieval is returning irrelevant chunks — re-examine chunking strategy or hybrid fusion weights.

---

## CI integration

Add to your CI pipeline:

```yaml
- name: Run eval
  run: |
    source .venv/bin/activate
    npm run eval -- --ragas
  env:
    GROQ_API_KEY: ${{ secrets.GROQ_API_KEY }}
    MONGODB_URI: ${{ secrets.MONGODB_URI_TEST }}
```

A failing eval (e.g. `citationRecall` below threshold) should block the merge. Thresholds are configured per-tenant in MongoDB (`tenant.evalThresholds` — future field).
