import { getLLMClient } from '../../infra/llm/factory.js';
import { embed } from '../../infra/embeddings/transformers.js';
import { retrieve } from './retriever.js';
import { rerank } from './reranker.js';
import { QueryRewriter } from './queryRewriter.js';
import { Generator } from './generator.js';
import { RAGPipeline } from './pipeline.js';

let _pipeline: RAGPipeline | null = null;

export function getPipeline(): RAGPipeline {
  if (!_pipeline) {
    const llm = getLLMClient();
    _pipeline = new RAGPipeline(
      new QueryRewriter(llm),
      embed,
      retrieve,
      rerank,
      new Generator(llm),
    );
  }
  return _pipeline;
}

export function setPipeline(p: RAGPipeline): void {
  _pipeline = p;
}
