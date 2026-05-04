import { createHash } from 'node:crypto';
import { embed } from '../../infra/embeddings/transformers.js';
import {
  EmbeddingCacheModel,
  EMBEDDING_CACHE_TTL_SECONDS,
} from '../../infra/mongo/models/EmbeddingCache.js';
import { logger } from '../../observability/logger.js';

const MODEL_NAME = 'Xenova/bge-small-en-v1.5';

function cacheKey(text: string, model: string): string {
  return createHash('sha256').update(`${model}:${text}`).digest('hex');
}

export async function embedWithCache(texts: string[]): Promise<Float32Array[]> {
  if (texts.length === 0) return [];

  const hashes = texts.map(t => cacheKey(t, MODEL_NAME));

  const cached = await EmbeddingCacheModel.find({
    contentHash: { $in: hashes },
    model: MODEL_NAME,
  }).lean();

  const hitMap = new Map(cached.map(c => [c.contentHash, c.vector]));

  const missIndices: number[] = [];
  for (let i = 0; i < hashes.length; i++) {
    if (!hitMap.has(hashes[i]!)) missIndices.push(i);
  }

  logger.debug(
    { total: texts.length, hits: texts.length - missIndices.length, misses: missIndices.length },
    'embedding cache lookup',
  );

  if (missIndices.length > 0) {
    const missTexts = missIndices.map(i => texts[i]!);
    const vectors = await embed(missTexts);

    const expiresAt = new Date(Date.now() + EMBEDDING_CACHE_TTL_SECONDS * 1000);
    await Promise.all(
      missIndices.map((idx, j) =>
        EmbeddingCacheModel.updateOne(
          { contentHash: hashes[idx]!, model: MODEL_NAME },
          { $set: { vector: Array.from(vectors[j]!), expiresAt } },
          { upsert: true },
        ),
      ),
    );

    for (let j = 0; j < missIndices.length; j++) {
      hitMap.set(hashes[missIndices[j]!]!, Array.from(vectors[j]!));
    }
  }

  return hashes.map(h => new Float32Array(hitMap.get(h)!));
}
