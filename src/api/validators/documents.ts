import { z } from 'zod';

export const DocumentListQuerySchema = z.object({
  q: z.string().min(1).optional(),
  visibility: z.enum(['customer-facing', 'internal', 'draft']).optional(),
  sourceId: z.string().optional(),
  sourceType: z.enum(['connector', 'upload', 'paste', 'crawl']).optional(),
  status: z.enum(['processing', 'ready', 'failed', 'purged']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type DocumentListQuery = z.infer<typeof DocumentListQuerySchema>;

export const UpdateVisibilityBodySchema = z.object({
  visibility: z.enum(['customer-facing', 'internal', 'draft']),
});

export type UpdateVisibilityBody = z.infer<typeof UpdateVisibilityBodySchema>;
