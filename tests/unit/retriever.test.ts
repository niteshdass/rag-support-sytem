import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/infra/qdrant/client.js', () => ({ search: vi.fn() }));
vi.mock('../../src/infra/meilisearch/client.js', () => ({ search: vi.fn() }));
vi.mock('../../src/infra/mongo/models/Chunk.js', () => ({
  ChunkModel: { find: vi.fn() },
}));

import * as qdrantClient from '../../src/infra/qdrant/client.js';
import * as meiliClient from '../../src/infra/meilisearch/client.js';
import { ChunkModel } from '../../src/infra/mongo/models/Chunk.js';
import { retrieve } from '../../src/domain/rag/retriever.js';
import type { Visibility } from '../../src/infra/qdrant/client.js';

const TENANT = 'tenant-1';
const VEC = [0.1, 0.2, 0.3];
const QUERY = 'test query';
const VIS: [Visibility] = ['customer-facing'];

function makeQdrantHit(chunkId: string, rank: number) {
  return {
    id: `qp-${chunkId}`,
    score: 1 - rank * 0.1,
    payload: { chunkId, documentId: `doc-${chunkId}`, tenantId: TENANT, visibility: 'customer-facing' },
  };
}

function makeMeiliHit(chunkId: string) {
  return { id: chunkId, text: `text-${chunkId}`, documentId: `doc-${chunkId}`, visibility: 'customer-facing' as Visibility };
}

function makeMongoChunk(chunkId: string) {
  return {
    _id: { toString: () => chunkId },
    documentId: { toString: () => `doc-${chunkId}` },
    text: `text-${chunkId}`,
    visibility: 'customer-facing' as Visibility,
    tenantId: TENANT,
  };
}

function mockFind(chunkIds: string[]) {
  vi.mocked(ChunkModel.find).mockReturnValue({
    lean: () => Promise.resolve(chunkIds.map(makeMongoChunk)),
  } as ReturnType<typeof ChunkModel.find>);
}

beforeEach(() => vi.clearAllMocks());

describe('retrieve', () => {
  it('throws when visibility is empty array', async () => {
    await expect(
      retrieve({ tenantId: TENANT, query: QUERY, queryVector: VEC, visibility: [] as never, limit: 10 }),
    ).rejects.toThrow('visibility filter is required');
  });

  it('returns empty array when both backends return nothing', async () => {
    vi.mocked(qdrantClient.search).mockResolvedValue([]);
    vi.mocked(meiliClient.search).mockResolvedValue([]);
    mockFind([]);

    const results = await retrieve({ tenantId: TENANT, query: QUERY, queryVector: VEC, visibility: VIS, limit: 10 });
    expect(results).toEqual([]);
  });

  it('returns hits from qdrant only', async () => {
    vi.mocked(qdrantClient.search).mockResolvedValue([makeQdrantHit('chunk-A', 0)]);
    vi.mocked(meiliClient.search).mockResolvedValue([]);
    mockFind(['chunk-A']);

    const results = await retrieve({ tenantId: TENANT, query: QUERY, queryVector: VEC, visibility: VIS, limit: 10 });
    expect(results).toHaveLength(1);
    expect(results[0]!.chunkId).toBe('chunk-A');
    expect(results[0]!.text).toBe('text-chunk-A');
  });

  it('returns hits from meilisearch only', async () => {
    vi.mocked(qdrantClient.search).mockResolvedValue([]);
    vi.mocked(meiliClient.search).mockResolvedValue([makeMeiliHit('chunk-B')]);
    mockFind(['chunk-B']);

    const results = await retrieve({ tenantId: TENANT, query: QUERY, queryVector: VEC, visibility: VIS, limit: 10 });
    expect(results).toHaveLength(1);
    expect(results[0]!.chunkId).toBe('chunk-B');
  });

  it('RRF: chunk ranking high in both backends is ranked first', async () => {
    // chunk-A: rank 0 in qdrant, rank 1 in meili → highest combined RRF
    // chunk-B: rank 1 in qdrant only
    // chunk-C: rank 0 in meili only
    vi.mocked(qdrantClient.search).mockResolvedValue([
      makeQdrantHit('chunk-A', 0),
      makeQdrantHit('chunk-B', 1),
    ]);
    vi.mocked(meiliClient.search).mockResolvedValue([
      makeMeiliHit('chunk-C'),
      makeMeiliHit('chunk-A'),
    ]);
    mockFind(['chunk-A', 'chunk-B', 'chunk-C']);

    const results = await retrieve({ tenantId: TENANT, query: QUERY, queryVector: VEC, visibility: VIS, limit: 10 });
    expect(results[0]!.chunkId).toBe('chunk-A');
  });

  it('RRF score for dual-ranked chunk exceeds single-ranked chunks', async () => {
    vi.mocked(qdrantClient.search).mockResolvedValue([
      makeQdrantHit('chunk-A', 0),
      makeQdrantHit('chunk-B', 1),
    ]);
    vi.mocked(meiliClient.search).mockResolvedValue([
      makeMeiliHit('chunk-C'),
      makeMeiliHit('chunk-A'),
    ]);
    mockFind(['chunk-A', 'chunk-B', 'chunk-C']);

    const results = await retrieve({ tenantId: TENANT, query: QUERY, queryVector: VEC, visibility: VIS, limit: 10 });
    const aScore = results.find(r => r.chunkId === 'chunk-A')!.rrfScore;
    const bScore = results.find(r => r.chunkId === 'chunk-B')!.rrfScore;
    const cScore = results.find(r => r.chunkId === 'chunk-C')!.rrfScore;
    expect(aScore).toBeGreaterThan(bScore);
    expect(aScore).toBeGreaterThan(cScore);
  });

  it('respects limit parameter', async () => {
    vi.mocked(qdrantClient.search).mockResolvedValue(
      ['A', 'B', 'C', 'D', 'E'].map((id, i) => makeQdrantHit(`chunk-${id}`, i)),
    );
    vi.mocked(meiliClient.search).mockResolvedValue([]);
    mockFind(['chunk-A', 'chunk-B', 'chunk-C']);

    const results = await retrieve({ tenantId: TENANT, query: QUERY, queryVector: VEC, visibility: VIS, limit: 3 });
    expect(results).toHaveLength(3);
  });

  it('passes visibility filter to both backends', async () => {
    const vis: [Visibility, Visibility] = ['customer-facing', 'internal'];
    vi.mocked(qdrantClient.search).mockResolvedValue([]);
    vi.mocked(meiliClient.search).mockResolvedValue([]);
    mockFind([]);

    await retrieve({ tenantId: TENANT, query: QUERY, queryVector: VEC, visibility: vis, limit: 10 });

    expect(vi.mocked(qdrantClient.search)).toHaveBeenCalledWith(
      'chunks',
      VEC,
      expect.objectContaining({ visibility: vis }),
    );
    expect(vi.mocked(meiliClient.search)).toHaveBeenCalledWith(
      TENANT,
      QUERY,
      expect.objectContaining({ visibility: vis }),
    );
  });

  it('drops chunks not found in mongo (cross-tenant guard)', async () => {
    vi.mocked(qdrantClient.search).mockResolvedValue([
      makeQdrantHit('chunk-X', 0),
      makeQdrantHit('chunk-Y', 1),
    ]);
    vi.mocked(meiliClient.search).mockResolvedValue([]);
    // Mongo returns only chunk-Y (chunk-X filtered out by tenantId)
    mockFind(['chunk-Y']);

    const results = await retrieve({ tenantId: TENANT, query: QUERY, queryVector: VEC, visibility: VIS, limit: 10 });
    expect(results).toHaveLength(1);
    expect(results[0]!.chunkId).toBe('chunk-Y');
  });
});
