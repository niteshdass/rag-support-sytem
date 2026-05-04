import mongoose, { Schema, type Document } from 'mongoose';

export const RESPONSE_CACHE_TTL_SECONDS = 24 * 60 * 60; // 1 day

export interface ResponseCacheCitation {
  documentId: string;
}

export interface ResponseCache extends Document {
  tenantId: mongoose.Types.ObjectId;
  queryHash: string;
  response: Record<string, unknown>;
  citations: ResponseCacheCitation[];
  expiresAt: Date;
}

const responseCacheSchema = new Schema<ResponseCache>(
  {
    tenantId: { type: Schema.Types.ObjectId, required: true },
    queryHash: { type: String, required: true },
    response: { type: Schema.Types.Mixed, required: true },
    citations: [{ documentId: { type: String, required: true } }],
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

responseCacheSchema.index({ tenantId: 1, queryHash: 1 }, { unique: true });
responseCacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
responseCacheSchema.index({ 'citations.documentId': 1 });

export const ResponseCacheModel =
  (mongoose.models['ResponseCache'] as mongoose.Model<ResponseCache>) ??
  mongoose.model<ResponseCache>('ResponseCache', responseCacheSchema);
