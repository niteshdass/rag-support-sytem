import mongoose, { Schema, type Document } from 'mongoose';

const TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

export interface EmbeddingCache extends Document {
  contentHash: string;
  model: string;
  vector: number[];
  expiresAt: Date;
}

const embeddingCacheSchema = new Schema<EmbeddingCache>(
  {
    contentHash: { type: String, required: true },
    model: { type: String, required: true },
    vector: { type: [Number], required: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

embeddingCacheSchema.index({ contentHash: 1, model: 1 }, { unique: true });
embeddingCacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const EmbeddingCacheModel =
  (mongoose.models['EmbeddingCache'] as mongoose.Model<EmbeddingCache>) ??
  mongoose.model<EmbeddingCache>('EmbeddingCache', embeddingCacheSchema);

export { TTL_SECONDS as EMBEDDING_CACHE_TTL_SECONDS };
