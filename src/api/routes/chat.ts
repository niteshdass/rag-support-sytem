import { Router, type NextFunction, type Request, type Response } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { apiKeyMiddleware } from '../middleware/apiKey.js';
import { getPipeline } from '../../domain/rag/pipeline.factory.js';
import { TicketModel } from '../../infra/mongo/models/Ticket.js';
import { ConversationModel } from '../../infra/mongo/models/Conversation.js';
import { DraftModel } from '../../infra/mongo/models/Draft.js';
import { getTenantSettings, channelAutoResolveEnabled } from '../../domain/tenancy/settingsCache.js';
import { notifyEscalation } from '../../infra/notifications/slack.js';

const router = Router();

router.use((_req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  next();
});
router.options('*', (_req, res) => res.sendStatus(204));

// POST /chat/sessions — start a new widget session
router.post(
  '/sessions',
  apiKeyMiddleware,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const tenantId = req.tenantId!.toString();
    try {
      const ticket = await TicketModel.create({
        tenantId: new mongoose.Types.ObjectId(tenantId),
        channel: 'chat',
        externalId: crypto.randomUUID(),
        customer: {},
        subject: 'Chat widget session',
        body: 'Chat widget session started',
        status: 'new',
      });

      const conversation = await ConversationModel.create({
        tenantId: new mongoose.Types.ObjectId(tenantId),
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

// POST /chat/messages — send a message, get AI answer
const MessageSchema = z.object({
  sessionId: z.string().min(1),
  message: z.string().min(1).max(2000),
});

router.post(
  '/messages',
  apiKeyMiddleware,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const parsed = MessageSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const { sessionId, message } = parsed.data;
    const tenantId = req.tenantId!.toString();

    if (!mongoose.Types.ObjectId.isValid(sessionId)) {
      res.status(404).json({ error: 'session not found' });
      return;
    }

    try {
      const conversation = await ConversationModel.forTenant(tenantId).findOne({
        _id: new mongoose.Types.ObjectId(sessionId),
      });
      if (!conversation) {
        res.status(404).json({ error: 'session not found' });
        return;
      }

      const settings = await getTenantSettings(tenantId);
      if (!settings) {
        res.status(401).json({ error: 'tenant not found' });
        return;
      }

      const history = conversation.messages
        .slice(-10)
        .map(m => `${m.role}: ${m.content}`);

      // audience="end-user" — never exposes internal-only docs
      const answer = await getPipeline().answer(message, {
        tenantId,
        audience: 'end-user',
        autoResolveEnabled: channelAutoResolveEnabled(settings, 'chat'),
        confidenceThreshold: settings.confidenceThreshold,
        recentMessages: history,
      });

      conversation.messages.push({ role: 'user', content: message, timestamp: new Date() });
      conversation.messages.push({
        role: 'assistant',
        content: answer.text,
        timestamp: new Date(),
      });
      conversation.confidenceScores.push(answer.confidence);
      await conversation.save();

      // Persist draft so Activity feed can display this chat turn with citations
      const ticket = await TicketModel.forTenant(tenantId).findOne({ _id: conversation.ticketId });
      if (ticket) {
        // Use first user message as ticket subject
        if (ticket.subject === 'Chat widget session') {
          await TicketModel.forTenant(tenantId).findOneAndUpdate(
            { _id: ticket._id },
            { $set: { subject: message.slice(0, 120) } },
          );
        }
        const citations = answer.citations.map(c => ({
          documentId: new mongoose.Types.ObjectId(c.documentId),
          chunkId: new mongoose.Types.ObjectId(c.chunkId),
          score: c.score,
          snippet: c.snippet,
        }));
        if (citations.length > 0) {
          await DraftModel.create({
            tenantId: new mongoose.Types.ObjectId(tenantId),
            ticketId: ticket._id,
            text: answer.text,
            citations,
            confidence: answer.confidence,
            route: answer.route,
            ...(answer.route === 'auto' ? { sentAt: new Date() } : {}),
          });
          const nextStatus = answer.route === 'auto' ? 'auto_resolved' : 'drafted';
          await TicketModel.forTenant(tenantId).findOneAndUpdate(
            { _id: ticket._id },
            { $set: { status: nextStatus } },
          );
        }
      }

      res.json({
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

// POST /chat/escalate — "this didn't help" → route to human agent
const EscalateSchema = z.object({
  sessionId: z.string().min(1),
});

router.post(
  '/escalate',
  apiKeyMiddleware,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const parsed = EscalateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const { sessionId } = parsed.data;
    const tenantId = req.tenantId!.toString();

    if (!mongoose.Types.ObjectId.isValid(sessionId)) {
      res.status(404).json({ error: 'session not found' });
      return;
    }

    try {
      const conversation = await ConversationModel.forTenant(tenantId)
        .findOne({ _id: new mongoose.Types.ObjectId(sessionId) })
        .lean();
      if (!conversation) {
        res.status(404).json({ error: 'session not found' });
        return;
      }

      const ticket = await TicketModel.forTenant(tenantId).findOneAndUpdate(
        { _id: conversation.ticketId },
        { $set: { status: 'escalated' } },
        { new: true, lean: true },
      );

      if (ticket) {
        const settings = await getTenantSettings(tenantId);
        if (settings?.slackEscalationWebhookUrl) {
          await notifyEscalation({
            tenantId,
            ticketId: (ticket._id as mongoose.Types.ObjectId).toString(),
            channel: 'chat',
            subject: ticket.subject,
            customerEmail: ticket.customer?.email,
            webhookUrl: settings.slackEscalationWebhookUrl,
          });
        }
      }

      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);

export { router as chatRouter };
