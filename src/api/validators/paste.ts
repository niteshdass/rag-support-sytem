import { z } from 'zod';

export const PasteBodySchema = z.object({
  title: z.string().min(1).optional(),
  content: z.string().min(10),
  visibility: z.enum(['customer-facing', 'internal', 'draft']).default('customer-facing'),
  tags: z.array(z.string()).optional(),
});

export type PasteBody = z.infer<typeof PasteBodySchema>;
