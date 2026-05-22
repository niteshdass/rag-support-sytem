import { z } from 'zod';

export const QueryBodySchema = z.object({
  query: z.string().min(1).max(2000),
  history: z.array(z.string()).max(20).optional(),
  audience: z.enum(['end-user', 'agent']),
  sessionId: z.string().optional(),
});

export type QueryBody = z.infer<typeof QueryBodySchema>;
