import { z } from 'zod';

const ThumbsPayload = z.object({ value: z.enum(['up', 'down']) });
const EditPayload = z.object({
  originalText: z.string().min(1),
  sentText: z.string().min(1),
});
const RatingPayload = z.object({
  score: z.number().int().min(1).max(5),
  comment: z.string().optional(),
});

export const FeedbackBodySchema = z.discriminatedUnion('type', [
  z.object({ draftId: z.string().min(1), type: z.literal('thumbs'), payload: ThumbsPayload }),
  z.object({ draftId: z.string().min(1), type: z.literal('edit'), payload: EditPayload }),
  z.object({ draftId: z.string().min(1), type: z.literal('rating'), payload: RatingPayload }),
]);

export type FeedbackBody = z.infer<typeof FeedbackBodySchema>;
