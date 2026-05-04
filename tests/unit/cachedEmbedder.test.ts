import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

// Mock the underlying embedder before importing the module under test
vi.mock('../../src/infra/embeddings/transformers.js', () => ({
  embed: vi.fn(),
}));

import { embed } from '../../src/infra/embeddings/transformers.js';
import { embedWithCache } from '../../src/domain/embeddings/cachedEmbedder.js';
import { EmbeddingCacheModel, EMBEDDING_CACHE_TTL_SECONDS } from '../../src/infra/mongo/models/EmbeddingCache.js';

const mockEmbed = vi.mocked(embed);

let mongod: MongoMemoryServer;

beforeEach(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());

  // Default: return a deterministic 3-dim vector per text
  mockEmbed.mockImplementation(async (texts: string[]) =>
    texts.map((_, i) => new Float32Array([i + 1, 0, 0])),
  );
});

afterEach(async () => {
  await mongoose.disconnect();
  await mongod.stop();
  vi.clearAllMocks();
});

describe('cachedEmbedder', () => {
  it('same text twice — second call hits cache, no model invocations', async () => {
    await embedWithCache(['hello world']);
    expect(mockEmbed).toHaveBeenCalledTimes(1);

    await embedWithCache(['hello world']);
    expect(mockEmbed).toHaveBeenCalledTimes(1); // still 1
  });

  it('different model name in cache key → cache miss on model change', async () => {
    // Seed the cache with a fake entry under a different model name
    const { createHash } = await import('node:crypto');
    const altModel = 'some-other-model';
    const hash = createHash('sha256').update(`${altModel}:hello`).digest('hex');
    await EmbeddingCacheModel.create({
      contentHash: hash,
      model: altModel,
      vector: [9, 9, 9],
      expiresAt: new Date(Date.now() + 1_000_000),
    });

    // embedWithCache always uses bge-small, so the above entry should NOT be hit
    await embedWithCache(['hello']);
    expect(mockEmbed).toHaveBeenCalledTimes(1);
  });

  it('TTL field set to ~30 days from now', async () => {
    const before = Date.now();
    await embedWithCache(['ttl test']);
    const after = Date.now();

    const doc = await EmbeddingCacheModel.findOne({ model: 'Xenova/bge-small-en-v1.5' }).lean();
    expect(doc).not.toBeNull();

    const expectedMs = EMBEDDING_CACHE_TTL_SECONDS * 1000;
    const expiresMs = doc!.expiresAt.getTime();
    expect(expiresMs).toBeGreaterThanOrEqual(before + expectedMs - 1000);
    expect(expiresMs).toBeLessThanOrEqual(after + expectedMs + 1000);
  });

  it('returns correct vectors for mixed hit/miss batch', async () => {
    // Warm cache with 'alpha'
    await embedWithCache(['alpha']);
    mockEmbed.mockClear();

    // Second call: 'alpha' is a hit, 'beta' is a miss
    mockEmbed.mockResolvedValueOnce([new Float32Array([7, 7, 7])]);

    const [alphaVec, betaVec] = await embedWithCache(['alpha', 'beta']);
    expect(mockEmbed).toHaveBeenCalledTimes(1);
    expect(mockEmbed).toHaveBeenCalledWith(['beta']);
    expect(Array.from(alphaVec!)).toEqual([1, 0, 0]); // from first call
    expect(Array.from(betaVec!)).toEqual([7, 7, 7]);
  });

  it('empty input returns empty array without calling model', async () => {
    const result = await embedWithCache([]);
    expect(result).toEqual([]);
    expect(mockEmbed).not.toHaveBeenCalled();
  });
});
