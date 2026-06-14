import { Router, type NextFunction, type Request, type Response } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { tenantMiddleware } from '../../middleware/tenant.js';
import { TicketModel } from '../../../infra/mongo/models/Ticket.js';
import { ConversationModel } from '../../../infra/mongo/models/Conversation.js';
import { DraftModel } from '../../../infra/mongo/models/Draft.js';

const router = Router();

// GET /admin/inbox — list open chat sessions
router.get(
  '/',
  tenantMiddleware,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const tenantId = req.tenantId!.toString();
    const tenantOid = new mongoose.Types.ObjectId(tenantId);

    try {
      const [results] = await TicketModel.aggregate([
        {
          $match: {
            tenantId: tenantOid,
            channel: 'chat',
            status: { $nin: ['closed'] },
          },
        },
        { $sort: { updatedAt: -1 } },
        { $limit: 100 },
        {
          $lookup: {
            from: 'conversations',
            localField: 'conversationId',
            foreignField: '_id',
            as: 'conv',
          },
        },
        { $unwind: { path: '$conv', preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: 'drafts',
            let: { tid: '$_id' },
            pipeline: [
              { $match: { $expr: { $and: [{ $eq: ['$tenantId', tenantOid] }, { $eq: ['$ticketId', '$$tid'] }] } } },
              { $sort: { createdAt: -1 } },
              { $limit: 1 },
            ],
            as: 'drafts',
          },
        },
        {
          $project: {
            _id: 0,
            conversationId: '$conv._id',
            ticketId: '$_id',
            subject: 1,
            customer: 1,
            status: 1,
            updatedAt: 1,
            messageCount: { $size: { $ifNull: ['$conv.messages', []] } },
            lastMessage: { $last: { $ifNull: ['$conv.messages', []] } },
            latestDraft: {
              $let: {
                vars: { d: { $first: '$drafts' } },
                in: {
                  $cond: {
                    if: { $gt: ['$$d', null] },
                    then: {
                      id: '$$d._id',
                      text: '$$d.text',
                      confidence: '$$d.confidence',
                      route: '$$d.route',
                      citations: '$$d.citations',
                    },
                    else: null,
                  },
                },
              },
            },
          },
        },
      ]);

      res.json({ sessions: Array.isArray(results) ? results : [results].filter(Boolean) });
    } catch (err) {
      next(err);
    }
  },
);

// GET /admin/inbox/:conversationId — full thread + latest draft
router.get(
  '/:conversationId',
  tenantMiddleware,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const tenantId = req.tenantId!.toString();
    const { conversationId } = req.params;

    if (!conversationId || !mongoose.Types.ObjectId.isValid(conversationId)) {
      res.status(404).json({ error: 'not found' });
      return;
    }

    try {
      const conversation = await ConversationModel.forTenant(tenantId)
        .findOne({ _id: new mongoose.Types.ObjectId(conversationId) })
        .lean();

      if (!conversation) {
        res.status(404).json({ error: 'not found' });
        return;
      }

      const ticket = await TicketModel.forTenant(tenantId)
        .findOne({ _id: conversation.ticketId })
        .lean();

      if (!ticket) {
        res.status(404).json({ error: 'not found' });
        return;
      }

      const latestDraft = await DraftModel.forTenant(tenantId)
        .findOne({ ticketId: conversation.ticketId })
        .sort({ createdAt: -1 })
        .lean();

      res.json({
        conversationId,
        ticketId: (conversation.ticketId as mongoose.Types.ObjectId).toString(),
        subject: ticket.subject,
        customer: ticket.customer,
        status: ticket.status,
        messages: conversation.messages,
        latestDraft: latestDraft
          ? {
              id: (latestDraft._id as mongoose.Types.ObjectId).toString(),
              text: latestDraft.text,
              confidence: latestDraft.confidence,
              route: latestDraft.route,
              citations: latestDraft.citations,
            }
          : null,
      });
    } catch (err) {
      next(err);
    }
  },
);

// POST /admin/inbox/:conversationId/reply — agent sends a reply
const ReplySchema = z.object({
  text: z.string().min(1).max(10000),
  draftId: z.string().optional(),
});

router.post(
  '/:conversationId/reply',
  tenantMiddleware,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const tenantId = req.tenantId!.toString();
    const { conversationId } = req.params;

    if (!conversationId || !mongoose.Types.ObjectId.isValid(conversationId)) {
      res.status(404).json({ error: 'not found' });
      return;
    }

    const parsed = ReplySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const { text, draftId } = parsed.data;

    try {
      const conversation = await ConversationModel.forTenant(tenantId).findOne({
        _id: new mongoose.Types.ObjectId(conversationId),
      });

      if (!conversation) {
        res.status(404).json({ error: 'not found' });
        return;
      }

      conversation.messages.push({ role: 'agent', content: text, timestamp: new Date() });
      await conversation.save();

      await TicketModel.forTenant(tenantId).findOneAndUpdate(
        { _id: conversation.ticketId },
        { $set: { status: 'closed' } },
      );

      if (draftId && mongoose.Types.ObjectId.isValid(draftId)) {
        await DraftModel.forTenant(tenantId).findOneAndUpdate(
          { _id: new mongoose.Types.ObjectId(draftId) },
          { $set: { agentEdits: text, sentAt: new Date() } },
        );
      }

      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);

// POST /admin/inbox/:conversationId/escalate — mark escalated
router.post(
  '/:conversationId/escalate',
  tenantMiddleware,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const tenantId = req.tenantId!.toString();
    const { conversationId } = req.params;

    if (!conversationId || !mongoose.Types.ObjectId.isValid(conversationId)) {
      res.status(404).json({ error: 'not found' });
      return;
    }

    try {
      const conversation = await ConversationModel.forTenant(tenantId)
        .findOne({ _id: new mongoose.Types.ObjectId(conversationId) })
        .lean();

      if (!conversation) {
        res.status(404).json({ error: 'not found' });
        return;
      }

      await TicketModel.forTenant(tenantId).findOneAndUpdate(
        { _id: conversation.ticketId },
        { $set: { status: 'escalated' } },
      );

      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);

export { router as inboxRouter };
