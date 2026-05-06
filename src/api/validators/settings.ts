import { z } from 'zod';

export const PatchSettingsSchema = z
  .object({
    autoResolveEnabled: z.boolean().optional(),
    confidenceThreshold: z.number().min(0).max(1).optional(),
  })
  .refine(data => Object.keys(data).length > 0, {
    message: 'at least one field required',
  });
