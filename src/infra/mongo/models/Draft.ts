import mongoose, { Schema, type Document } from 'mongoose';
import { z } from 'zod';
import {
  tenantScopePlugin,
  type WithTenantScope,
} from '../plugins/tenantScope.js';

export const CitationSchema = z.object({
  documentId: z.string().min(1),
  chunkId: z.string().min(1),
  score: z.number().min(0).max(1),
  snippet: z.string().min(1),
});

export const DraftCreateSchema = z.object({
  tenantId: z.string().min(1),
  ticketId: z.string().min(1),
  text: z.string().min(1),
  citations: z.array(CitationSchema).min(1),
  confidence: z.number().min(0).max(1),
  route: z.enum(['auto', 'draft']),
  agentEdits: z.string().optional(),
  sentAt: z.date().optional(),
});

export type DraftCreate = z.infer<typeof DraftCreateSchema>;

interface Citation {
  documentId: mongoose.Types.ObjectId;
  chunkId: mongoose.Types.ObjectId;
  score: number;
  snippet: string;
}

export interface DraftDocument extends Document {
  tenantId: mongoose.Types.ObjectId;
  ticketId: mongoose.Types.ObjectId;
  text: string;
  citations: Citation[];
  confidence: number;
  route: 'auto' | 'draft';
  agentEdits?: string;
  sentAt?: Date;
}

const citationSchema = new Schema<Citation>(
  {
    documentId: { type: Schema.Types.ObjectId, required: true },
    chunkId: { type: Schema.Types.ObjectId, required: true },
    score: { type: Number, required: true },
    snippet: { type: String, required: true },
  },
  { _id: false },
);

const draftSchema = new Schema<DraftDocument>(
  {
    tenantId: { type: Schema.Types.ObjectId, required: true, index: true },
    ticketId: { type: Schema.Types.ObjectId, required: true },
    text: { type: String, required: true },
    citations: { type: [citationSchema], required: true },
    confidence: { type: Number, required: true },
    route: { type: String, enum: ['auto', 'draft'], required: true },
    agentEdits: { type: String },
    sentAt: { type: Date },
  },
  { timestamps: true },
);

draftSchema.index({ tenantId: 1, ticketId: 1 });
draftSchema.index({ tenantId: 1, route: 1 });

draftSchema.plugin(tenantScopePlugin);

export const DraftModel: WithTenantScope<DraftDocument> = (
  mongoose.models['Draft'] ??
  mongoose.model<DraftDocument>('Draft', draftSchema)
) as WithTenantScope<DraftDocument>;
