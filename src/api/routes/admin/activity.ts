import { Router, type NextFunction, type Request, type Response } from 'express';
import mongoose from 'mongoose';
import { DraftModel } from '../../../infra/mongo/models/Draft.js';
import { tenantMiddleware } from '../../middleware/tenant.js';
import { ActivityQuerySchema } from '../../validators/activity.js';

const router = Router();

router.get(
  '/',
  tenantMiddleware,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const parsed = ActivityQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const { page, pageSize, status, route, confidenceMin, confidenceMax, q } = parsed.data;
    const tenantId = req.tenantId!.toString();
    const tenantOid = new mongoose.Types.ObjectId(tenantId);

    const draftMatch: Record<string, unknown> = { tenantId: tenantOid };
    if (route) draftMatch.route = route;
    if (confidenceMin !== undefined || confidenceMax !== undefined) {
      const range: Record<string, number> = {};
      if (confidenceMin !== undefined) range.$gte = confidenceMin;
      if (confidenceMax !== undefined) range.$lte = confidenceMax;
      draftMatch.confidence = range;
    }

    const ticketMatch: Record<string, unknown> = {};
    if (status) ticketMatch['ticket.status'] = status;
    if (q) {
      const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escaped, 'i');
      ticketMatch.$or = [{ 'ticket.subject': regex }, { 'ticket.body': regex }];
    }

    const skip = (page - 1) * pageSize;

    try {
      const [facetResult] = await DraftModel.aggregate([
        { $match: draftMatch },
        {
          $lookup: {
            from: 'tickets',
            localField: 'ticketId',
            foreignField: '_id',
            as: 'ticket',
          },
        },
        { $unwind: { path: '$ticket', preserveNullAndEmptyArrays: false } },
        ...(Object.keys(ticketMatch).length > 0 ? [{ $match: ticketMatch }] : []),
        {
          $lookup: {
            from: 'feedbacks',
            localField: '_id',
            foreignField: 'draftId',
            as: 'feedback',
          },
        },
        {
          $facet: {
            total: [{ $count: 'count' }],
            results: [
              { $sort: { createdAt: -1 } },
              { $skip: skip },
              { $limit: pageSize },
              {
                $project: {
                  _id: 0,
                  ticketId: '$ticket._id',
                  channel: '$ticket.channel',
                  subject: '$ticket.subject',
                  customer: '$ticket.customer',
                  status: '$ticket.status',
                  draft: {
                    id: '$_id',
                    text: '$text',
                    citations: '$citations',
                    confidence: '$confidence',
                    route: '$route',
                    agentEdits: '$agentEdits',
                    sentAt: '$sentAt',
                  },
                  feedback: 1,
                  createdAt: 1,
                  updatedAt: 1,
                },
              },
            ],
          },
        },
      ]);

      const total = (facetResult?.total?.[0]?.count as number | undefined) ?? 0;
      const results = (facetResult?.results ?? []) as unknown[];

      res.json({ results, total, page, pageSize });
    } catch (err) {
      next(err);
    }
  },
);

export { router as activityRouter };
