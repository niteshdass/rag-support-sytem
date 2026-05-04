import mongoose, { Schema, type Document } from 'mongoose';
import { z } from 'zod';
import {
  tenantScopePlugin,
  type WithTenantScope,
} from '../plugins/tenantScope.js';

export const ChunkCreateSchema = z.object({
  tenantId: z.string().min(1),
  documentId: z.string().min(1),
  text: z.string().min(1),
  position: z.number().int().nonnegative(),
  qdrantPointId: z.string().optional(),
  visibility: z.enum(['customer-facing', 'internal', 'draft']),
});

export type ChunkCreate = z.infer<typeof ChunkCreateSchema>;

export interface Chunk extends Document {
  tenantId: mongoose.Types.ObjectId;
  documentId: mongoose.Types.ObjectId;
  text: string;
  position: number;
  qdrantPointId?: string;
  visibility: 'customer-facing' | 'internal' | 'draft';
}

const chunkSchema = new Schema<Chunk>(
  {
    tenantId: { type: Schema.Types.ObjectId, required: true, index: true },
    documentId: { type: Schema.Types.ObjectId, required: true },
    text: { type: String, required: true },
    position: { type: Number, required: true },
    qdrantPointId: { type: String },
    visibility: {
      type: String,
      enum: ['customer-facing', 'internal', 'draft'],
      required: true,
    },
  },
  { timestamps: true },
);

chunkSchema.index(
  { tenantId: 1, documentId: 1, position: 1 },
  { unique: true },
);
chunkSchema.index({ qdrantPointId: 1 });
chunkSchema.index({ tenantId: 1, visibility: 1 });

chunkSchema.plugin(tenantScopePlugin);

export const ChunkModel: WithTenantScope<Chunk> = (
  mongoose.models['Chunk'] ??
  mongoose.model<Chunk>('Chunk', chunkSchema)
) as WithTenantScope<Chunk>;
