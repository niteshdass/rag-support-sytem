import { pipeline, type TextClassificationPipeline } from '@xenova/transformers';
import { logger } from '../../observability/logger.js';

const MODEL_NAME = 'Xenova/bge-reranker-base';

let _pipe: TextClassificationPipeline | null = null;

async function getPipeline(): Promise<TextClassificationPipeline> {
  if (!_pipe) {
    logger.info({ model: MODEL_NAME }, 'loading reranker model');
    _pipe = await pipeline('text-classification', MODEL_NAME) as TextClassificationPipeline;
    logger.info({ model: MODEL_NAME }, 'reranker model ready');
  }
  return _pipe;
}

// bge-reranker-base is a cross-encoder: tokenizer accepts [query, passage] sentence pairs.
// @xenova/transformers v2 types only declare string | string[], but the runtime handles
// [string, string] as a sentence pair — required for cross-encoder inference.
type CrossEncoderFn = (input: [string, string], opts: { top_k: null }) => Promise<Array<{ label: string; score: number }>>;

export async function score(query: string, texts: string[]): Promise<number[]> {
  if (texts.length === 0) return [];

  const pipe = await getPipeline() as unknown as CrossEncoderFn;

  const outputs = await Promise.all(
    texts.map(text => pipe([query, text], { top_k: null })),
  );

  // bge-reranker-base outputs a single classification label; its score is the relevance signal
  return outputs.map(out => (Array.isArray(out) ? out[0]! : out).score);
}
