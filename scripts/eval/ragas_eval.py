#!/usr/bin/env python3
"""Ragas sidecar: reads JSON from stdin, outputs metrics JSON to stdout.

Input (stdin): JSON array of:
  { "query": str, "answer": str, "contexts": [str], "reference"?: str }

Output (stdout): JSON:
  { "per_item": [{ "faithfulness"?, "answer_relevancy"?, "context_precision"? }],
    "aggregates": { same keys, averaged } }

LLM backend (in priority order):
  1. GROQ_API_KEY  → Groq (llama-3.1-8b-instant)
  2. OPENAI_API_KEY → OpenAI (gpt-4o-mini)
  3. Neither        → exits with error (metrics require an LLM)
"""

import json
import os
import sys


def build_llm_and_embeddings():
    groq_key = os.getenv("GROQ_API_KEY")
    openai_key = os.getenv("OPENAI_API_KEY")

    if groq_key:
        from langchain_groq import ChatGroq
        from langchain_openai import OpenAIEmbeddings

        # Groq for LLM; OpenAI embeddings needed by answer_relevancy
        # If no OPENAI_API_KEY, fall back to a no-embedding mode (skip answer_relevancy)
        llm = ChatGroq(model="llama-3.1-8b-instant", api_key=groq_key)
        embeddings = OpenAIEmbeddings(api_key=openai_key) if openai_key else None
        return llm, embeddings

    if openai_key:
        from langchain_openai import ChatOpenAI, OpenAIEmbeddings

        llm = ChatOpenAI(model="gpt-4o-mini", api_key=openai_key)
        embeddings = OpenAIEmbeddings(api_key=openai_key)
        return llm, embeddings

    sys.stderr.write(
        "ragas_eval: no LLM API key found. Set GROQ_API_KEY or OPENAI_API_KEY.\n"
    )
    sys.exit(1)


def avg(values: list) -> float:
    clean = [v for v in values if v is not None]
    if not clean:
        return 0.0
    return sum(clean) / len(clean)


def main() -> None:
    raw = sys.stdin.read().strip()
    if not raw:
        sys.stderr.write("ragas_eval: empty stdin\n")
        sys.exit(1)

    data = json.loads(raw)
    if isinstance(data, dict):
        data = [data]

    if not data:
        print(json.dumps({"per_item": [], "aggregates": {}}))
        return

    # Lazy imports after env check so missing packages give a clear error
    from datasets import Dataset
    from ragas import evaluate
    from ragas.metrics import faithfulness, answer_relevancy, context_precision
    from ragas.llms import LangchainLLM
    from ragas.embeddings import LangchainEmbeddingsWrapper

    llm_raw, embeddings_raw = build_llm_and_embeddings()
    langchain_llm = LangchainLLM(llm=llm_raw)

    has_reference = all("reference" in d and d["reference"] for d in data)

    dataset_dict: dict = {
        "question": [d["query"] for d in data],
        "answer": [d["answer"] for d in data],
        "contexts": [d["contexts"] for d in data],
    }
    if has_reference:
        dataset_dict["ground_truths"] = [[d["reference"]] for d in data]

    dataset = Dataset.from_dict(dataset_dict)

    # Configure metrics with our LLM
    faithfulness.llm = langchain_llm
    active_metrics = [faithfulness]

    if embeddings_raw is not None:
        answer_relevancy.llm = langchain_llm
        answer_relevancy.embeddings = LangchainEmbeddingsWrapper(embeddings_raw)
        active_metrics.append(answer_relevancy)

    if has_reference:
        context_precision.llm = langchain_llm
        active_metrics.append(context_precision)

    result = evaluate(dataset, metrics=active_metrics)
    df = result.to_pandas()

    per_item: list[dict] = []
    for _, row in df.iterrows():
        item: dict = {}
        if "faithfulness" in df.columns:
            item["faithfulness"] = float(row["faithfulness"]) if row["faithfulness"] is not None else None
        if "answer_relevancy" in df.columns:
            item["answer_relevancy"] = float(row["answer_relevancy"]) if row["answer_relevancy"] is not None else None
        if "context_precision" in df.columns:
            item["context_precision"] = float(row["context_precision"]) if row["context_precision"] is not None else None
        per_item.append(item)

    aggregates: dict = {}
    for key in ("faithfulness", "answer_relevancy", "context_precision"):
        values = [item.get(key) for item in per_item]
        if any(v is not None for v in values):
            aggregates[key] = avg(values)

    print(json.dumps({"per_item": per_item, "aggregates": aggregates}))


if __name__ == "__main__":
    main()
