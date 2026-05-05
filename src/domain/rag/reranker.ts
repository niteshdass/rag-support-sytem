import * as infraReranker from '../../infra/reranker/transformers.js';
import type { RetrievedChunk } from './retriever.js';

export interface RankedChunk extends RetrievedChunk {
  rerankerScore: number;
}

export async function rerank(
  query: string,
  chunks: RetrievedChunk[],
  topK = 6,
): Promise<RankedChunk[]> {
  if (chunks.length === 0) return [];

  const scores = await infraReranker.score(query, chunks.map(c => c.text));

  return chunks
    .map((chunk, i) => ({ ...chunk, rerankerScore: scores[i]! }))
    .sort((a, b) => b.rerankerScore - a.rerankerScore)
    .slice(0, topK);
}
