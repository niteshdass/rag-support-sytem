import { z } from 'zod';

export const ActivityQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z
    .enum(['new', 'awaiting_agent', 'drafted', 'auto_resolved', 'escalated', 'closed'])
    .optional(),
  route: z.enum(['auto', 'draft']).optional(),
  confidenceMin: z.coerce.number().min(0).max(1).optional(),
  confidenceMax: z.coerce.number().min(0).max(1).optional(),
  q: z.string().optional(),
});

export type ActivityQuery = z.infer<typeof ActivityQuerySchema>;
