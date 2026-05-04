import { z } from 'zod';

const KNOWN_SUBTYPES: Record<string, string[]> = {
  connector: ['zendesk', 'intercom', 'notion', 'confluence', 'google-drive', 'github', 'slack'],
  upload: ['file'],
  paste: ['text'],
  crawl: ['web'],
};

export const SourceCreateBodySchema = z
  .object({
    type: z.enum(['connector', 'upload', 'paste', 'crawl']),
    subtype: z.string().min(1),
    config: z.record(z.unknown()).default({}),
  })
  .superRefine((data, ctx) => {
    const allowed = KNOWN_SUBTYPES[data.type] ?? [];
    if (!allowed.includes(data.subtype)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['subtype'],
        message: `unknown subtype "${data.subtype}" for type "${data.type}". Allowed: ${allowed.join(', ')}`,
      });
    }
  });

export const SourceListQuerySchema = z.object({
  type: z.enum(['connector', 'upload', 'paste', 'crawl']).optional(),
  status: z.enum(['active', 'syncing', 'error', 'disabled']).optional(),
});

export { KNOWN_SUBTYPES };
export type SourceCreateBody = z.infer<typeof SourceCreateBodySchema>;
export type SourceListQuery = z.infer<typeof SourceListQuerySchema>;
