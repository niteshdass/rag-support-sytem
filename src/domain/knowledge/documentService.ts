import crypto from 'node:crypto';
import mongoose, { type HydratedDocument } from 'mongoose';
import { DocumentModel, type SupportDocument } from '../../infra/mongo/models/Document.js';

export interface JobQueue {
  enqueue(jobName: string, data: Record<string, unknown>): Promise<void>;
}

export interface DocumentAddInput {
  tenantId: string;
  sourceId: string;
  sourceType: 'connector' | 'upload' | 'paste' | 'crawl';
  title?: string;
  url?: string;
  content: string;
  fileKey?: string;
  fileMimeType?: string;
  externalId?: string;
  visibility: 'customer-facing' | 'internal' | 'draft';
  addedBy: string;
  tags?: string[];
}

export class DocumentService {
  constructor(private readonly jobQueue: JobQueue) {}

  async add(input: DocumentAddInput): Promise<HydratedDocument<SupportDocument>> {
    const contentHash = crypto.createHash('sha256').update(input.content).digest('hex');

    const tenantId = new mongoose.Types.ObjectId(input.tenantId);
    const sourceId = new mongoose.Types.ObjectId(input.sourceId);
    const addedBy = new mongoose.Types.ObjectId(input.addedBy);

    const fields = {
      tenantId,
      sourceId,
      sourceType: input.sourceType,
      title: input.title ?? 'Untitled',
      url: input.url,
      content: input.content,
      contentHash,
      fileKey: input.fileKey,
      fileMimeType: input.fileMimeType,
      visibility: input.visibility,
      addedBy,
      tags: input.tags ?? [],
      status: 'processing' as const,
    };

    let doc: HydratedDocument<SupportDocument>;

    if (input.externalId) {
      const result = await DocumentModel.findOneAndUpdate(
        { tenantId, sourceId, externalId: input.externalId },
        { ...fields, externalId: input.externalId },
        { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
      );
      doc = result as HydratedDocument<SupportDocument>;
    } else {
      doc = await DocumentModel.create(fields);
    }

    await this.jobQueue.enqueue('ingest-document', { documentId: doc._id.toString() });

    return doc;
  }
}
