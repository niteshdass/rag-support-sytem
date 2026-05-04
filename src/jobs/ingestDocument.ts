import crypto from 'node:crypto';
import Agenda, { type Job } from 'agenda';
import mongoose from 'mongoose';
import { chunk } from '../domain/ingestion/chunker.js';
import { embedWithCache } from '../domain/embeddings/cachedEmbedder.js';
import { DocumentModel } from '../infra/mongo/models/Document.js';
import { ChunkModel } from '../infra/mongo/models/Chunk.js';
import * as qdrant from '../infra/qdrant/client.js';
import * as meili from '../infra/meilisearch/client.js';
import { logger } from '../observability/logger.js';

const QDRANT_COLLECTION = 'chunks';
const VECTOR_SIZE = 384; // Xenova/bge-small-en-v1.5 output dim

export function defineIngestDocument(agenda: Agenda): void {
  agenda.define('ingest-document', { concurrency: 3 }, async (job: Job) => {
    const { documentId } = job.attrs.data as { documentId: string };
    await runIngestDocument(documentId);
  });
}

export async function runIngestDocument(documentId: string): Promise<void> {
  const log = logger.child({ job: 'ingest-document', documentId });
  log.info('starting');

  const doc = await DocumentModel.findById(documentId);
  if (!doc) {
    throw new Error(`Document not found: ${documentId}`);
  }

  const tenantId = doc.tenantId.toString();

  try {
    // 1. Chunk
    const rawChunks = chunk(doc.content);
    if (rawChunks.length === 0) {
      throw new Error('Chunker produced 0 chunks');
    }
    log.info({ chunkCount: rawChunks.length }, 'chunked');

    // 2. Embed (with MongoDB-backed cache)
    const vectors = await embedWithCache(rawChunks.map(c => c.text));

    // 3. Ensure storage backends are ready
    await Promise.all([
      qdrant.ensureCollection(QDRANT_COLLECTION, VECTOR_SIZE),
      meili.ensureIndex(tenantId),
    ]);

    // 4. Remove stale chunks so re-ingesting a document is idempotent
    const stale = await ChunkModel.find({ tenantId: doc.tenantId, documentId: doc._id }).select('_id qdrantPointId');
    if (stale.length > 0) {
      const qdrantIds = stale.map(c => c.qdrantPointId).filter(Boolean) as string[];
      const meiliIds = stale.map(c => c._id.toString());
      await Promise.all([
        qdrantIds.length > 0 ? qdrant.deletePoints(QDRANT_COLLECTION, qdrantIds) : Promise.resolve(),
        meili.deleteDocs(tenantId, meiliIds),
        ChunkModel.deleteMany({ tenantId: doc.tenantId, documentId: doc._id }),
      ]);
    }

    // 5. Build chunk records — assign IDs up-front so we can cross-reference
    const chunkDocs = rawChunks.map(c => ({
      _id: new mongoose.Types.ObjectId(),
      tenantId: doc.tenantId,
      documentId: doc._id,
      text: c.text,
      position: c.position,
      qdrantPointId: crypto.randomUUID(),
      visibility: doc.visibility,
    }));

    // 6. Upsert vectors in Qdrant
    const qdrantPoints: qdrant.QdrantPoint[] = chunkDocs.map((c, i) => ({
      id: c.qdrantPointId,
      vector: Array.from(vectors[i]!),
      payload: {
        tenantId,
        documentId: doc._id.toString(),
        chunkId: c._id.toString(),
        visibility: doc.visibility,
      },
    }));
    await qdrant.upsertPoints(QDRANT_COLLECTION, qdrantPoints);

    // 7. Add to Meilisearch tenant index
    const meiliDocs: meili.MeiliDoc[] = chunkDocs.map(c => ({
      id: c._id.toString(),
      text: c.text,
      documentId: doc._id.toString(),
      visibility: doc.visibility,
    }));
    await meili.addDocs(tenantId, meiliDocs);

    // 8. Persist chunk rows in Mongo
    await ChunkModel.insertMany(chunkDocs);

    // 9. Mark document ready
    await DocumentModel.findByIdAndUpdate(documentId, {
      $set: { status: 'ready' },
      $unset: { processingError: 1 },
    });

    log.info({ chunkCount: chunkDocs.length }, 'ingest-document complete');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err }, 'ingest-document failed');
    await DocumentModel.findByIdAndUpdate(documentId, {
      $set: { status: 'failed', processingError: msg },
    });
    throw err;
  }
}
