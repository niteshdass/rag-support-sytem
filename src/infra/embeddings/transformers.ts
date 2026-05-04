import { pipeline, type FeatureExtractionPipeline } from '@xenova/transformers';
import { logger } from '../../observability/logger.js';

const MODEL_NAME = 'Xenova/bge-small-en-v1.5';
const BATCH_SIZE = 16;

let _pipe: FeatureExtractionPipeline | null = null;

async function getPipeline(): Promise<FeatureExtractionPipeline> {
  if (!_pipe) {
    logger.info({ model: MODEL_NAME }, 'loading embedding model');
    _pipe = await pipeline('feature-extraction', MODEL_NAME);
    logger.info({ model: MODEL_NAME }, 'embedding model ready');
  }
  return _pipe;
}

export async function embed(texts: string[]): Promise<Float32Array[]> {
  if (texts.length === 0) return [];

  const pipe = await getPipeline();
  const results: Float32Array[] = new Array(texts.length);

  for (let start = 0; start < texts.length; start += BATCH_SIZE) {
    const batch = texts.slice(start, start + BATCH_SIZE);
    const outputs = await Promise.all(
      batch.map(text =>
        pipe(text, { pooling: 'mean', normalize: true }),
      ),
    );
    for (let i = 0; i < outputs.length; i++) {
      results[start + i] = new Float32Array(outputs[i]!.data as Float32Array);
    }
  }

  return results;
}
