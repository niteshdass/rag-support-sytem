import { Router, type NextFunction, type Request, type Response } from 'express';
import mongoose from 'mongoose';
import { DraftModel } from '../../../infra/mongo/models/Draft.js';
import { FeedbackModel } from '../../../infra/mongo/models/Feedback.js';
import { tenantMiddleware } from '../../middleware/tenant.js';
import { FeedbackBodySchema } from '../../validators/feedback.js';

const router = Router();

router.post(
  '/',
  tenantMiddleware,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const parsed = FeedbackBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const { draftId, type, payload } = parsed.data;
    const tenantId = req.tenantId!.toString();
    const userId = req.user!._id.toString();

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
        userId: new mongoose.Types.ObjectId(userId),
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

export { router as feedbackRouter };
