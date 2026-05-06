import mongoose, { Schema, type Document, type Model } from 'mongoose';
import { z } from 'zod';

export const ChannelOverrideSchema = z.object({
  autoResolveEnabled: z.boolean().optional(),
});

export const ChannelSettingsSchema = z
  .object({
    chat: ChannelOverrideSchema.optional(),
    email: ChannelOverrideSchema.optional(),
    zendesk: ChannelOverrideSchema.optional(),
    slack: ChannelOverrideSchema.optional(),
  })
  .default({});

export const TenantZodSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/),
  plan: z.string().default('free'),
  settings: z.record(z.unknown()).default({}),
  apiKeys: z.array(z.string()).default([]),
  autoResolveEnabled: z.boolean().default(false),
  confidenceThreshold: z.number().min(0).max(1).default(0.85),
  channelSettings: ChannelSettingsSchema,
});

export type Tenant = z.infer<typeof TenantZodSchema>;
export type ChannelSettings = z.infer<typeof ChannelSettingsSchema>;

export interface TenantDocument extends Tenant, Document {}

const tenantSchema = new Schema<TenantDocument>(
  {
    name: { type: String, required: true, unique: true },
    slug: { type: String, required: true, unique: true },
    plan: { type: String, required: true, default: 'free' },
    settings: { type: Schema.Types.Mixed, default: {} },
    apiKeys: { type: [String], default: [] },
    autoResolveEnabled: { type: Boolean, default: false },
    confidenceThreshold: { type: Number, default: 0.85 },
    channelSettings: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

export const TenantModel: Model<TenantDocument> =
  mongoose.models['Tenant'] ?? mongoose.model<TenantDocument>('Tenant', tenantSchema);
