import mongoose from 'mongoose';
import { AuditLogModel } from '../../infra/mongo/models/AuditLog.js';
import { ChunkModel } from '../../infra/mongo/models/Chunk.js';
import { DocumentModel } from '../../infra/mongo/models/Document.js';
import { ResponseCacheModel } from '../../infra/mongo/models/ResponseCache.js';
import * as meili from '../../infra/meilisearch/client.js';
import * as qdrant from '../../infra/qdrant/client.js';
import { getStorage } from '../../infra/storage/index.js';
import { logger } from '../../observability/logger.js';

const QDRANT_COLLECTION = 'chunks';

export class PurgeService {
  async purge(tenantId: string, documentId: string, actorId: string): Promise<void> {
    const log = logger.child({ service: 'purge', tenantId, documentId });

    const tenantOid = new mongoose.Types.ObjectId(tenantId);
    const docOid = new mongoose.Types.ObjectId(documentId);

    const doc = await DocumentModel.forTenant(tenantId).findOne({ _id: docOid });
    if (!doc) {
      throw new Error(`Document not found: ${documentId}`);
    }
    if (doc.status === 'purged') {
      log.info('already purged, no-op');
      return;
    }

    // Step 1: mark purging so retriever skips immediately
    await DocumentModel.findByIdAndUpdate(docOid, { $set: { status: 'purging' } });

    // Step 2: delete Qdrant points by filter
    await qdrant.deleteByFilter(QDRANT_COLLECTION, {
      must: [
        { key: 'tenantId', match: { value: tenantId } },
        { key: 'documentId', match: { value: documentId } },
      ],
    });
    log.info('qdrant points deleted');

    // Step 3: delete Meilisearch docs (by chunk mongo IDs)
    const chunks = await ChunkModel.forTenant(tenantId)
      .find({ documentId: docOid })
      .select('_id');
    const meiliIds = chunks.map(c => c._id.toString());
    await meili.deleteDocs(tenantId, meiliIds);
    log.info({ count: meiliIds.length }, 'meili docs deleted');

    // Step 4: delete Chunk rows
    await ChunkModel.deleteMany({ tenantId: tenantOid, documentId: docOid });

    // Step 5: invalidate response cache entries that cited this doc
    await ResponseCacheModel.deleteMany({
      tenantId: tenantOid,
      'citations.documentId': documentId,
    });

    // Step 6: delete file if present
    if (doc.fileKey) {
      try {
        await getStorage().delete(tenantId, doc.fileKey);
        log.info({ fileKey: doc.fileKey }, 'file deleted');
      } catch (err) {
        log.warn({ err, fileKey: doc.fileKey }, 'file delete failed — continuing purge');
      }
    }

    // Step 7: mark purged (keep row for audit)
    await DocumentModel.findByIdAndUpdate(docOid, { $set: { status: 'purged' } });

    // Step 8: write audit log
    await AuditLogModel.create({
      tenantId: tenantOid,
      actor: new mongoose.Types.ObjectId(actorId),
      action: 'purge_document',
      target: documentId,
    });

    log.info('purge complete');
  }
}

export const purgeService = new PurgeService();
