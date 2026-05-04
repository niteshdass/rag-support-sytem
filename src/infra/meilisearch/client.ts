import { Meilisearch } from 'meilisearch';
import { logger } from '../../observability/logger.js';

export type Visibility = 'customer-facing' | 'internal' | 'draft';

export interface MeiliDoc {
  id: string;
  text: string;
  documentId: string;
  visibility: Visibility;
}

export interface SearchParams {
  visibility: [Visibility, ...Visibility[]];
  limit: number;
}

let _client: Meilisearch | null = null;

function getClient(): Meilisearch {
  if (!_client) {
    const host = process.env.MEILI_URL ?? 'http://localhost:7700';
    const apiKey = process.env.MEILI_MASTER_KEY ?? '';
    _client = new Meilisearch({ host, apiKey });
    logger.info({ host }, 'meilisearch client initialised');
  }
  return _client;
}

function indexName(tenantId: string): string {
  return `docs_${tenantId}`;
}

export async function ensureIndex(tenantId: string): Promise<void> {
  const client = getClient();
  const name = indexName(tenantId);

  const existing = await client.getIndexes();
  const found = existing.results.some(i => i.uid === name);

  if (!found) {
    await client.createIndex(name, { primaryKey: 'id' }).waitTask();
    logger.info({ index: name }, 'meilisearch index created');
  }

  const index = client.index(name);

  await Promise.all([
    index.updateSearchableAttributes(['text']).waitTask(),
    index.updateFilterableAttributes(['visibility', 'documentId']).waitTask(),
  ]);
}

export async function addDocs(tenantId: string, docs: MeiliDoc[]): Promise<void> {
  if (docs.length === 0) return;
  const index = getClient().index(indexName(tenantId));
  await index.addDocuments(docs, { primaryKey: 'id' }).waitTask();
}

export async function search(
  tenantId: string,
  query: string,
  params: SearchParams,
): Promise<MeiliDoc[]> {
  const index = getClient().index(indexName(tenantId));
  const filter = params.visibility.map(v => `visibility = "${v}"`).join(' OR ');
  const result = await index.search<MeiliDoc>(query, {
    filter,
    limit: params.limit,
  });
  return result.hits;
}

export async function deleteDocs(tenantId: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const index = getClient().index(indexName(tenantId));
  await index.deleteDocuments(ids).waitTask();
}

export async function dropIndex(tenantId: string): Promise<void> {
  const client = getClient();
  await client.deleteIndex(indexName(tenantId)).waitTask();
  logger.info({ index: indexName(tenantId) }, 'meilisearch index dropped');
}
