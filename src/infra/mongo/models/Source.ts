import mongoose, { Schema, type Document } from 'mongoose';
import { z } from 'zod';
import {
  tenantScopePlugin,
  type WithTenantScope,
} from '../plugins/tenantScope.js';

export const SourceCreateSchema = z.object({
  tenantId: z.string().min(1),
  type: z.enum(['connector', 'upload', 'paste', 'crawl']),
  subtype: z.string().min(1),
  config: z.record(z.unknown()).default({}),
  lastSyncedAt: z.date().optional(),
  status: z.enum(['active', 'syncing', 'error', 'disabled']).default('active'),
  addedBy: z.string().min(1),
});

export const SourceUpdateSchema = z.object({
  config: z.record(z.unknown()).optional(),
  lastSyncedAt: z.date().optional(),
  status: z.enum(['active', 'syncing', 'error', 'disabled']).optional(),
});

export type SourceCreate = z.infer<typeof SourceCreateSchema>;
export type SourceUpdate = z.infer<typeof SourceUpdateSchema>;

export interface SourceDocument extends Document {
  tenantId: mongoose.Types.ObjectId;
  type: 'connector' | 'upload' | 'paste' | 'crawl';
  subtype: string;
  config: Record<string, unknown>;
  lastSyncedAt?: Date;
  status: 'active' | 'syncing' | 'error' | 'disabled';
  addedBy: mongoose.Types.ObjectId;
}

const sourceSchema = new Schema<SourceDocument>(
  {
    tenantId: { type: Schema.Types.ObjectId, required: true, index: true },
    type: {
      type: String,
      enum: ['connector', 'upload', 'paste', 'crawl'],
      required: true,
    },
    subtype: { type: String, required: true },
    config: { type: Schema.Types.Mixed, default: {} },
    lastSyncedAt: { type: Date },
    status: {
      type: String,
      enum: ['active', 'syncing', 'error', 'disabled'],
      required: true,
      default: 'active',
    },
    addedBy: { type: Schema.Types.ObjectId, required: true },
  },
  { timestamps: true },
);

sourceSchema.index({ tenantId: 1, type: 1 });
sourceSchema.index({ tenantId: 1, status: 1 });
sourceSchema.plugin(tenantScopePlugin);

export const SourceModel: WithTenantScope<SourceDocument> = (
  mongoose.models['Source'] ??
  mongoose.model<SourceDocument>('Source', sourceSchema)
) as WithTenantScope<SourceDocument>;
