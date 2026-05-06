import { Router, type NextFunction, type Request, type Response } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { apiKeyMiddleware } from '../middleware/apiKey.js';
import { getPipeline } from '../../domain/rag/pipeline.factory.js';
import { TenantModel } from '../../infra/mongo/models/Tenant.js';
import { TicketModel } from '../../infra/mongo/models/Ticket.js';
import { DraftModel } from '../../infra/mongo/models/Draft.js';
import { FeedbackModel } from '../../infra/mongo/models/Feedback.js';

const router = Router();

router.use((_req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  next();
});

router.options('*', (_req, res) => res.sendStatus(204));

const QuerySchema = z.object({
  query: z.string().min(1).max(2000),
  ticketId: z.string().optional(),
  history: z.array(z.string()).max(20).optional(),
});

router.post(
  '/query',
  apiKeyMiddleware,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const parsed = QuerySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const { query, ticketId, history } = parsed.data;
    const tenantId = req.tenantId!.toString();

    try {
      const tenant = await TenantModel.findById(tenantId).lean();
      if (!tenant) {
        res.status(401).json({ error: 'tenant not found' });
        return;
      }

      const answer = await getPipeline().answer(query, {
        tenantId,
        audience: 'internal-agent',
        autoResolveEnabled: tenant.autoResolveEnabled,
        confidenceThreshold: tenant.confidenceThreshold,
        recentMessages: history ?? [],
      });

      let ticketDoc = ticketId
        ? await TicketModel.findOne({ tenantId, channel: 'zendesk', externalId: ticketId }).lean()
        : null;

      if (!ticketDoc && ticketId) {
        ticketDoc = await TicketModel.create({
          tenantId: new mongoose.Types.ObjectId(tenantId),
          channel: 'zendesk',
          externalId: ticketId,
          subject: query.slice(0, 200),
          body: query,
          customer: {},
          status: 'new',
        });
      }

      const draft = ticketDoc
        ? await DraftModel.forTenant(tenantId).findOneAndUpdate(
            { ticketId: ticketDoc._id },
            {
              $set: {
                text: answer.text,
                citations: answer.citations.map(c => ({
                  documentId: new mongoose.Types.ObjectId(c.documentId),
                  chunkId: new mongoose.Types.ObjectId(c.chunkId),
                  score: c.score,
                  snippet: c.snippet,
                })),
                confidence: answer.confidence,
                route: answer.route,
              },
            },
            { new: true, upsert: true },
          )
        : null;

      res.json({
        draftId: draft?._id?.toString() ?? null,
        text: answer.text,
        citations: answer.citations,
        confidence: answer.confidence,
        route: answer.route,
      });
    } catch (err) {
      next(err);
    }
  },
);

const FeedbackSchema = z.discriminatedUnion('type', [
  z.object({
    draftId: z.string().min(1),
    type: z.literal('thumbs'),
    payload: z.object({ value: z.enum(['up', 'down']) }),
  }),
  z.object({
    draftId: z.string().min(1),
    type: z.literal('edit'),
    payload: z.object({ originalText: z.string().min(1), sentText: z.string().min(1) }),
  }),
  z.object({
    draftId: z.string().min(1),
    type: z.literal('rating'),
    payload: z.object({ score: z.number().int().min(1).max(5), comment: z.string().optional() }),
  }),
]);

router.post(
  '/feedback',
  apiKeyMiddleware,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const parsed = FeedbackSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const { draftId, type, payload } = parsed.data;
    const tenantId = req.tenantId!.toString();

    if (!mongoose.Types.ObjectId.isValid(draftId)) {
      res.status(404).json({ error: 'draft not found' });
      return;
    }

    try {
      const draft = await DraftModel.forTenant(tenantId).findOne({
        _id: new mongoose.Types.ObjectId(draftId),
      });

      if (!draft) {
        res.status(404).json({ error: 'draft not found' });
        return;
      }

      const feedback = await FeedbackModel.create({
        tenantId: new mongoose.Types.ObjectId(tenantId),
        draftId: new mongoose.Types.ObjectId(draftId),
        type,
        payload,
      });

      if (type === 'edit') {
        await DraftModel.findByIdAndUpdate(draft._id, {
          $set: {
            sentAt: new Date(),
            agentEdits: (payload as { sentText: string }).sentText,
          },
        });
      }

      res.status(201).json(feedback);
    } catch (err) {
      next(err);
    }
  },
);

export { router as copilotRouter };
