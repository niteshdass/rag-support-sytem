/**
 * Qdrant integration tests.
 * Skipped automatically when QDRANT_URL is not set or Qdrant is unreachable.
 * Run locally after starting Qdrant: ./bin/qdrant --uri http://localhost:6333
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  deleteByFilter,
  deletePoints,
  ensureCollection,
  search,
  upsertPoints,
} from '../../src/infra/qdrant/client.js';

const QDRANT_URL = process.env.QDRANT_URL;
const VECTOR_SIZE = 4; // tiny vectors for tests
const COLLECTION = `test_chunks_${Date.now()}`;

async function isQdrantReachable(): Promise<boolean> {
  if (!QDRANT_URL) return false;
  try {
    const res = await fetch(`${QDRANT_URL}/healthz`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

describe.skipIf(!(await isQdrantReachable()))('qdrant client', () => {
  beforeAll(async () => {
    await ensureCollection(COLLECTION, VECTOR_SIZE);
  });

  afterAll(async () => {
    // cleanup: delete all points seeded during tests
    await deleteByFilter(COLLECTION, {
      must: [{ key: 'test_run', match: { value: true } }],
    });
  });

  it('ensureCollection is idempotent', async () => {
    // second call must not throw
    await expect(ensureCollection(COLLECTION, VECTOR_SIZE)).resolves.toBeUndefined();
  });

  it('upsert + search roundtrip with tenant filter', async () => {
    const tenantId = 'tenant-a';
    await upsertPoints(COLLECTION, [
      {
        id: 1,
        vector: [1, 0, 0, 0],
        payload: { tenantId, visibility: 'customer-facing', text: 'hello', test_run: true },
      },
      {
        id: 2,
        vector: [0.9, 0.1, 0, 0],
        payload: { tenantId, visibility: 'internal', text: 'world', test_run: true },
      },
    ]);

    const hits = await search(COLLECTION, [1, 0, 0, 0], {
      tenantId,
      visibility: ['customer-facing'],
      limit: 10,
    });

    expect(hits.length).toBeGreaterThanOrEqual(1);
    expect(hits[0]!.payload.tenantId).toBe(tenantId);
    // internal doc must not appear when filtering customer-facing only
    expect(hits.every(h => h.payload.visibility === 'customer-facing')).toBe(true);
  });

  it('search with mismatched tenantId returns nothing', async () => {
    const hits = await search(COLLECTION, [1, 0, 0, 0], {
      tenantId: 'tenant-other',
      visibility: ['customer-facing', 'internal'],
      limit: 10,
    });

    expect(hits.length).toBe(0);
  });

  it('deletePoints removes specific ids', async () => {
    await upsertPoints(COLLECTION, [
      {
        id: 99,
        vector: [0, 0, 0, 1],
        payload: { tenantId: 'tenant-del', visibility: 'internal', test_run: true },
      },
    ]);

    await deletePoints(COLLECTION, [99]);

    const hits = await search(COLLECTION, [0, 0, 0, 1], {
      tenantId: 'tenant-del',
      visibility: ['internal'],
      limit: 10,
    });

    expect(hits.find(h => h.id === 99)).toBeUndefined();
  });
});
