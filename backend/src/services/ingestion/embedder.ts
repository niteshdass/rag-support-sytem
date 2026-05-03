import { VoyageAIClient } from 'voyageai';
import { config } from '../../config.js';
import { env } from '../../env.js';
import { logger } from '../../logger.js';
import { withRetry } from '../../utils/retry.js';

const VOYAGE_BATCH_SIZE = 128;

const client = new VoyageAIClient({ apiKey: env.VOYAGE_API_KEY });

async function embedBatch(batch: string[]): Promise<number[][]> {
  const start = Date.now();
  const response = await withRetry(
    () =>
      client.embed({
        input: batch,
        model: config.embeddingModel,
      }),
    {
      maxRetries: config.embeddingMaxRetries,
      baseDelayMs: 500,
      timeoutMs: config.embeddingTimeoutMs,
    }
  );

  logger.info(
    {
      model: config.embeddingModel,
      inputChunks: batch.length,
      latencyMs: Date.now() - start,
    },
    'Embedding batch complete'
  );

  const data = response.data ?? [];
  return data.map((item) => item.embedding ?? []);
}

export async function embedChunks(chunks: string[]): Promise<number[][]> {
  const embeddings: number[][] = [];

  for (let i = 0; i < chunks.length; i += VOYAGE_BATCH_SIZE) {
    const batch = chunks.slice(i, i + VOYAGE_BATCH_SIZE);
    const batchEmbeddings = await embedBatch(batch);
    embeddings.push(...batchEmbeddings);
  }

  return embeddings;
}
