import { z } from 'zod';
import { ChannelSettingsSchema } from '../../infra/mongo/models/Tenant.js';

export const PatchSettingsSchema = z
  .object({
    autoResolveEnabled: z.boolean().optional(),
    confidenceThreshold: z.number().min(0).max(1).optional(),
    channelSettings: ChannelSettingsSchema.optional(),
  })
  .refine(data => Object.keys(data).length > 0, {
    message: 'at least one field required',
  });
