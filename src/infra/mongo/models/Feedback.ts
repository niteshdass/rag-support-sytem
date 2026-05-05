import mongoose, { Schema, type Document } from 'mongoose';
import { z } from 'zod';
import {
  tenantScopePlugin,
  type WithTenantScope,
} from '../plugins/tenantScope.js';

export const FeedbackCreateSchema = z.object({
  tenantId: z.string().min(1),
  draftId: z.string().min(1),
  type: z.enum(['thumbs', 'edit', 'rating']),
  payload: z.record(z.unknown()).default({}),
  userId: z.string().optional(),
});

export type FeedbackCreate = z.infer<typeof FeedbackCreateSchema>;

export interface FeedbackDocument extends Document {
  tenantId: mongoose.Types.ObjectId;
  draftId: mongoose.Types.ObjectId;
  type: 'thumbs' | 'edit' | 'rating';
  payload: Record<string, unknown>;
  userId?: mongoose.Types.ObjectId;
}

const feedbackSchema = new Schema<FeedbackDocument>(
  {
    tenantId: { type: Schema.Types.ObjectId, required: true, index: true },
    draftId: { type: Schema.Types.ObjectId, required: true },
    type: { type: String, enum: ['thumbs', 'edit', 'rating'], required: true },
    payload: { type: Schema.Types.Mixed, default: {} },
    userId: { type: Schema.Types.ObjectId },
  },
  { timestamps: true },
);

feedbackSchema.index({ tenantId: 1, draftId: 1 });
feedbackSchema.index({ tenantId: 1, type: 1 });

feedbackSchema.plugin(tenantScopePlugin);

export const FeedbackModel: WithTenantScope<FeedbackDocument> = (
  mongoose.models['Feedback'] ??
  mongoose.model<FeedbackDocument>('Feedback', feedbackSchema)
) as WithTenantScope<FeedbackDocument>;
