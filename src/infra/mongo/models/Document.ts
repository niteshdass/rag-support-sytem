import mongoose, { Schema, type Document } from 'mongoose';
import { z } from 'zod';
import {
  tenantScopePlugin,
  type WithTenantScope,
} from '../plugins/tenantScope.js';

export const DocumentCreateSchema = z.object({
  tenantId: z.string().min(1),
  sourceId: z.string().min(1),
  sourceType: z.enum(['connector', 'upload', 'paste', 'crawl']),
  externalId: z.string().optional(),
  fileKey: z.string().optional(),
  fileMimeType: z.string().optional(),
  title: z.string().min(1),
  url: z.string().optional(),
  content: z.string().min(1),
  contentHash: z.string().min(1),
  visibility: z.enum(['customer-facing', 'internal', 'draft']).default('draft'),
  tags: z.array(z.string()).default([]),
  metadata: z.record(z.unknown()).default({}),
  addedBy: z.string().min(1),
  status: z
    .enum(['processing', 'ready', 'failed', 'purging', 'purged'])
    .default('processing'),
  processingError: z.string().optional(),
});

export const DocumentUpdateSchema = z.object({
  title: z.string().optional(),
  content: z.string().optional(),
  contentHash: z.string().optional(),
  visibility: z.enum(['customer-facing', 'internal', 'draft']).optional(),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
  status: z.enum(['processing', 'ready', 'failed', 'purging', 'purged']).optional(),
  processingError: z.string().optional(),
});

export type DocumentCreate = z.infer<typeof DocumentCreateSchema>;
export type DocumentUpdate = z.infer<typeof DocumentUpdateSchema>;

export interface SupportDocument extends Document {
  tenantId: mongoose.Types.ObjectId;
  sourceId: mongoose.Types.ObjectId;
  sourceType: 'connector' | 'upload' | 'paste' | 'crawl';
  externalId?: string;
  fileKey?: string;
  fileMimeType?: string;
  title: string;
  url?: string;
  content: string;
  contentHash: string;
  visibility: 'customer-facing' | 'internal' | 'draft';
  tags: string[];
  metadata: Record<string, unknown>;
  addedBy: mongoose.Types.ObjectId;
  status: 'processing' | 'ready' | 'failed' | 'purging' | 'purged';
  processingError?: string;
}

const documentSchema = new Schema<SupportDocument>(
  {
    tenantId: { type: Schema.Types.ObjectId, required: true, index: true },
    sourceId: { type: Schema.Types.ObjectId, required: true },
    sourceType: {
      type: String,
      enum: ['connector', 'upload', 'paste', 'crawl'],
      required: true,
    },
    externalId: { type: String },
    fileKey: { type: String },
    fileMimeType: { type: String },
    title: { type: String, required: true },
    url: { type: String },
    content: { type: String, required: true },
    contentHash: { type: String, required: true },
    visibility: {
      type: String,
      enum: ['customer-facing', 'internal', 'draft'],
      required: true,
      default: 'draft',
    },
    tags: { type: [String], default: [] },
    metadata: { type: Schema.Types.Mixed, default: {} },
    addedBy: { type: Schema.Types.ObjectId, required: true },
    status: {
      type: String,
      enum: ['processing', 'ready', 'failed', 'purging', 'purged'],
      required: true,
      default: 'processing',
    },
    processingError: { type: String },
  },
  { timestamps: true },
);

documentSchema.index(
  { tenantId: 1, sourceId: 1, externalId: 1 },
  { unique: true, partialFilterExpression: { externalId: { $exists: true } } },
);
documentSchema.index({ tenantId: 1, visibility: 1 });
documentSchema.index({ contentHash: 1 });

documentSchema.plugin(tenantScopePlugin);

export const DocumentModel: WithTenantScope<SupportDocument> = (
  mongoose.models['Document'] ??
  mongoose.model<SupportDocument>('Document', documentSchema)
) as WithTenantScope<SupportDocument>;
