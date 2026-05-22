import { Router, type NextFunction, type Request, type Response } from 'express';
import mongoose from 'mongoose';
import { tenantMiddleware } from '../middleware/tenant.js';
import { QueryBodySchema } from '../validators/query.js';
import { getPipeline } from '../../domain/rag/pipeline.factory.js';
import { TenantModel } from '../../infra/mongo/models/Tenant.js';
import { ConversationModel } from '../../infra/mongo/models/Conversation.js';
import { TicketModel } from '../../infra/mongo/models/Ticket.js';

const router = Router();

// POST /query/sessions — create a named admin chat session
router.post(
  '/sessions',
  tenantMiddleware,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const tenantId = req.tenantId!;
    try {
      const ticket = await TicketModel.create({
        tenantId,
        channel: 'chat',
        externalId: crypto.randomUUID(),
        customer: {},
        subject: 'Admin chat session',
        body: 'Admin chat session started',
        status: 'new',
      });

      const conversation = await ConversationModel.create({
        tenantId,
        ticketId: ticket._id,
        messages: [],
        confidenceScores: [],
      });

      await TicketModel.findByIdAndUpdate(ticket._id, {
        $set: { conversationId: conversation._id },
      });

      res.status(201).json({ sessionId: (conversation._id as mongoose.Types.ObjectId).toString() });
    } catch (err) {
      next(err);
    }
  },
);

// GET /query/sessions/:id — restore session messages
router.get(
  '/sessions/:id',
  tenantMiddleware,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const id = req.params['id'];
    const tenantId = req.tenantId!.toString();

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      res.status(404).json({ error: 'session not found' });
      return;
    }

    try {
      const conversation = await ConversationModel.forTenant(tenantId).findOne({
        _id: new mongoose.Types.ObjectId(id),
      });

      if (!conversation) {
        res.status(404).json({ error: 'session not found' });
        return;
      }

      res.json({ messages: conversation.messages, confidenceScores: conversation.confidenceScores });
    } catch (err) {
      next(err);
    }
  },
);

// POST /query — RAG query, optionally attached to a session
router.post(
  '/',
  tenantMiddleware,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const parsed = QueryBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const { query, history, audience, sessionId } = parsed.data;

    try {
      const tenant = await TenantModel.findById(req.tenantId).lean();
      if (!tenant) {
        res.status(401).json({ error: 'tenant not found' });
        return;
      }

      const answer = await getPipeline().answer(query, {
        tenantId: req.tenantId!.toString(),
        audience: audience === 'agent' ? 'internal-agent' : 'end-user',
        autoResolveEnabled: tenant.autoResolveEnabled,
        confidenceThreshold: tenant.confidenceThreshold,
        recentMessages: history ?? [],
      });

      if (sessionId && mongoose.Types.ObjectId.isValid(sessionId)) {
        const conversation = await ConversationModel.forTenant(req.tenantId!.toString()).findOne({
          _id: new mongoose.Types.ObjectId(sessionId),
        });
        if (conversation) {
          conversation.messages.push({ role: 'user', content: query, timestamp: new Date() });
          conversation.messages.push({ role: 'assistant', content: answer.text, timestamp: new Date() });
          conversation.confidenceScores.push(answer.confidence);
          await conversation.save();
        }
      }

      res.json(answer);
    } catch (err) {
      next(err);
    }
  },
);

export { router as queryRouter };
