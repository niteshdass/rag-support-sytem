/**
 * Meilisearch integration tests.
 * Skipped automatically when MEILI_URL is not set or Meilisearch is unreachable.
 * Run locally after starting Meilisearch: ./meilisearch
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  addDocs,
  deleteDocs,
  dropIndex,
  ensureIndex,
  search,
} from '../../src/infra/meilisearch/client.js';

const MEILI_URL = process.env.MEILI_URL;
const TENANT = `test_tenant_${Date.now()}`;

async function isMeiliReachable(): Promise<boolean> {
  if (!MEILI_URL) return false;
  try {
    const res = await fetch(`${MEILI_URL}/health`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

describe.skipIf(!(await isMeiliReachable()))('meilisearch client', () => {
  beforeAll(async () => {
    await ensureIndex(TENANT);
    await addDocs(TENANT, [
      { id: 'doc-1', text: 'How to reset your password', documentId: 'doc-a', visibility: 'customer-facing' },
      { id: 'doc-2', text: 'Internal escalation playbook for password issues', documentId: 'doc-b', visibility: 'internal' },
      { id: 'doc-3', text: 'Billing refund policy', documentId: 'doc-c', visibility: 'customer-facing' },
    ]);
  });

  afterAll(async () => {
    await dropIndex(TENANT);
  });

  it('ensureIndex is idempotent', async () => {
    await expect(ensureIndex(TENANT)).resolves.toBeUndefined();
  });

  it('add + search roundtrip', async () => {
    const hits = await search(TENANT, 'password', {
      visibility: ['customer-facing', 'internal'],
      limit: 10,
    });
    expect(hits.length).toBeGreaterThanOrEqual(1);
    expect(hits.some(h => h.id === 'doc-1' || h.id === 'doc-2')).toBe(true);
  });

  it('visibility filter excludes wrong-visibility docs', async () => {
    const hits = await search(TENANT, 'password', {
      visibility: ['customer-facing'],
      limit: 10,
    });
    expect(hits.every(h => h.visibility === 'customer-facing')).toBe(true);
    expect(hits.find(h => h.id === 'doc-2')).toBeUndefined();
  });

  it('deleteDocs removes specific ids', async () => {
    await deleteDocs(TENANT, ['doc-3']);
    const hits = await search(TENANT, 'refund', {
      visibility: ['customer-facing'],
      limit: 10,
    });
    expect(hits.find(h => h.id === 'doc-3')).toBeUndefined();
  });

  it('dropIndex actually removes the index', async () => {
    const tmpTenant = `drop_test_${Date.now()}`;
    await ensureIndex(tmpTenant);
    await dropIndex(tmpTenant);
    await expect(
      search(tmpTenant, 'anything', { visibility: ['customer-facing'], limit: 1 }),
    ).rejects.toThrow();
  });
});
