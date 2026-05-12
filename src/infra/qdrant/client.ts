import { QdrantClient } from '@qdrant/js-client-rest';
import { logger } from '../../observability/logger.js';

export type Visibility = 'customer-facing' | 'internal' | 'draft';

export interface QdrantPoint {
  id: string | number;
  vector: number[];
  payload: Record<string, unknown>;
}

export interface SearchParams {
  tenantId: string;
  visibility: [Visibility, ...Visibility[]];
  limit: number;
  filter?: Record<string, unknown>;
}

export interface ScoredPoint {
  id: string | number;
  score: number;
  payload: Record<string, unknown>;
}

let _client: QdrantClient | null = null;

function getClient(): QdrantClient {
  if (!_client) {
    const url = process.env.QDRANT_URL ?? 'http://localhost:6333';
    _client = new QdrantClient({ url, checkCompatibility: false });
    logger.info({ url }, 'qdrant client initialised');
  }
  return _client;
}

export async function ensureCollection(name: string, vectorSize: number): Promise<void> {
  const client = getClient();
  const exists = await client.collectionExists(name);
  if (exists.exists) return;

  await client.createCollection(name, {
    vectors: { size: vectorSize, distance: 'Cosine' },
  });
  logger.info({ collection: name, vectorSize }, 'qdrant collection created');
}

export async function upsertPoints(collection: string, points: QdrantPoint[]): Promise<void> {
  if (points.length === 0) return;
  const client = getClient();
  await client.upsert(collection, {
    wait: true,
    points: points.map(p => ({
      id: p.id,
      vector: p.vector,
      payload: p.payload,
    })),
  });
}

export async function search(
  collection: string,
  vector: number[],
  params: SearchParams,
): Promise<ScoredPoint[]> {
  const client = getClient();

  const mustClauses: Record<string, unknown>[] = [
    { key: 'tenantId', match: { value: params.tenantId } },
    { key: 'visibility', match: { any: params.visibility } },
  ];

  if (params.filter) {
    mustClauses.push(params.filter);
  }

  const results = await client.search(collection, {
    vector,
    limit: params.limit,
    filter: { must: mustClauses },
    with_payload: true,
  });

  return results.map(r => ({
    id: r.id,
    score: r.score,
    payload: (r.payload ?? {}) as Record<string, unknown>,
  }));
}

export async function deletePoints(collection: string, ids: (string | number)[]): Promise<void> {
  if (ids.length === 0) return;
  const client = getClient();
  await client.delete(collection, { wait: true, points: ids });
}

export async function deleteByFilter(
  collection: string,
  filter: Record<string, unknown>,
): Promise<void> {
  const client = getClient();
  await client.delete(collection, { wait: true, filter });
}

export async function setPayloadForPoints(
  collection: string,
  ids: string[],
  payload: Record<string, unknown>,
): Promise<void> {
  if (ids.length === 0) return;
  const client = getClient();
  await client.setPayload(collection, { payload, points: ids, wait: true });
}
