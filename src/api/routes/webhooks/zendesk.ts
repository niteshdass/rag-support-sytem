import { Router, type NextFunction, type Request, type Response } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { TenantModel } from '../../../infra/mongo/models/Tenant.js';
import { TicketModel } from '../../../infra/mongo/models/Ticket.js';
import { ConversationModel } from '../../../infra/mongo/models/Conversation.js';
import { getJobQueue } from '../../../jobs/index.js';
import { logger } from '../../../observability/logger.js';

const ZendeskWebhookSchema = z.object({
  externalId: z.string().min(1),
  subject: z.string().min(1),
  body: z.string().min(1),
  customer: z
    .object({
      email: z.string().email().optional(),
      name: z.string().optional(),
      externalId: z.string().optional(),
    })
    .optional(),
});

const router = Router();

router.post(
  '/ticket',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey || typeof apiKey !== 'string') {
      res.status(401).json({ error: 'missing x-api-key header' });
      return;
    }

    try {
      const tenant = await TenantModel.findOne({ apiKeys: apiKey }).lean();
      if (!tenant) {
        res.status(401).json({ error: 'invalid api key' });
        return;
      }

      const parsed = ZendeskWebhookSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.flatten() });
        return;
      }

      const { externalId, subject, body, customer } = parsed.data;
      const tenantId = tenant._id as mongoose.Types.ObjectId;

      const existing = await TicketModel.findOne({
        tenantId: tenantId.toString(),
        channel: 'zendesk',
        externalId,
      }).lean();

      if (existing) {
        logger.info({ tenantId: tenantId.toString(), externalId }, 'zendesk webhook: duplicate ticket, ignored');
        res.status(200).json({ ticketId: existing._id, duplicate: true });
        return;
      }

      const customerData: { email?: string; name?: string; externalId?: string } = {};
      if (customer?.email !== undefined) customerData.email = customer.email;
      if (customer?.name !== undefined) customerData.name = customer.name;
      if (customer?.externalId !== undefined) customerData.externalId = customer.externalId;

      const ticket = await TicketModel.create({
        tenantId,
        channel: 'zendesk',
        externalId,
        subject,
        body,
        customer: customerData,
        status: 'new',
      });

      const conversation = await ConversationModel.create({
        tenantId,
        ticketId: ticket._id,
        messages: [{ role: 'user', content: body, timestamp: new Date() }],
        confidenceScores: [],
      });

      await TicketModel.findByIdAndUpdate(ticket._id, {
        $set: { conversationId: conversation._id },
      });

      await getJobQueue().enqueue('generate-draft', { ticketId: ticket._id.toString() });

      logger.info({ tenantId: tenantId.toString(), ticketId: ticket._id.toString() }, 'zendesk webhook: ticket created, draft job enqueued');

      res.status(201).json({ ticketId: ticket._id, conversationId: conversation._id });
    } catch (err) {
      next(err);
    }
  },
);

export { router as zendeskWebhookRouter };
