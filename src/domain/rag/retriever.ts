import * as qdrantClient from '../../infra/qdrant/client.js';
import * as meiliClient from '../../infra/meilisearch/client.js';
import { ChunkModel } from '../../infra/mongo/models/Chunk.js';
import type { Visibility } from '../../infra/qdrant/client.js';

const QDRANT_COLLECTION = 'chunks';
const BACKEND_LIMIT = 30;
const RRF_K = 60;

export interface RetrieveParams {
  tenantId: string;
  query: string;
  queryVector: number[];
  visibility: [Visibility, ...Visibility[]];
  limit: number;
}

export interface RetrievedChunk {
  chunkId: string;
  documentId: string;
  text: string;
  visibility: Visibility;
  rrfScore: number;
}

function rrf(
  qdrantHits: qdrantClient.ScoredPoint[],
  meiliIds: string[],
  k: number,
): Map<string, number> {
  const scores = new Map<string, number>();

  for (let rank = 0; rank < qdrantHits.length; rank++) {
    const chunkId = qdrantHits[rank]!.payload['chunkId'] as string;
    scores.set(chunkId, (scores.get(chunkId) ?? 0) + 1 / (k + rank + 1));
  }

  for (let rank = 0; rank < meiliIds.length; rank++) {
    const chunkId = meiliIds[rank]!;
    scores.set(chunkId, (scores.get(chunkId) ?? 0) + 1 / (k + rank + 1));
  }

  return scores;
}

export async function retrieve(params: RetrieveParams): Promise<RetrievedChunk[]> {
  if (!params.visibility || params.visibility.length === 0) {
    throw new Error('visibility filter is required');
  }

  const [qdrantHits, meiliHits] = await Promise.all([
    qdrantClient.search(QDRANT_COLLECTION, params.queryVector, {
      tenantId: params.tenantId,
      visibility: params.visibility,
      limit: BACKEND_LIMIT,
    }),
    meiliClient.search(params.tenantId, params.query, {
      visibility: params.visibility,
      limit: BACKEND_LIMIT,
    }),
  ]);

  const rrfScores = rrf(qdrantHits, meiliHits.map(h => h.id), RRF_K);
  if (rrfScores.size === 0) return [];

  const ranked = [...rrfScores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, params.limit);

  const chunkIds = ranked.map(([id]) => id);

  const chunks = await ChunkModel.find({
    _id: { $in: chunkIds },
    tenantId: params.tenantId,
  }).lean();

  const byId = new Map(chunks.map(c => [c._id.toString(), c]));

  return ranked
    .map(([chunkId, rrfScore]) => {
      const c = byId.get(chunkId);
      if (!c) return null;
      return {
        chunkId,
        documentId: c.documentId.toString(),
        text: c.text,
        visibility: c.visibility,
        rrfScore,
      };
    })
    .filter((c): c is RetrievedChunk => c !== null);
}
