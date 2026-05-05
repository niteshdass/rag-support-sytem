import { Router, type NextFunction, type Request, type Response } from 'express';
import mongoose from 'mongoose';
import { DocumentService } from '../../../domain/knowledge/documentService.js';
import { SourceModel } from '../../../infra/mongo/models/Source.js';
import { getJobQueue } from '../../../jobs/index.js';
import { tenantMiddleware } from '../../middleware/tenant.js';
import { PasteBodySchema } from '../../validators/paste.js';

const router = Router();

router.post(
  '/',
  tenantMiddleware,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const parsed = PasteBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const { title, content, visibility, tags } = parsed.data;
    const tenantId = req.tenantId!.toString();
    const userId = req.user!._id.toString();

    try {
      // Upsert the shared paste source for this tenant
      const source = await SourceModel.findOneAndUpdate(
        {
          tenantId: new mongoose.Types.ObjectId(tenantId),
          type: 'paste',
          subtype: 'text',
        },
        {
          $setOnInsert: {
            tenantId: new mongoose.Types.ObjectId(tenantId),
            type: 'paste',
            subtype: 'text',
            config: { name: 'paste-default' },
            status: 'active',
            addedBy: new mongoose.Types.ObjectId(userId),
          },
        },
        { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
      );

      const documentService = new DocumentService(getJobQueue());

      const doc = await documentService.add({
        tenantId,
        sourceId: source!._id.toString(),
        sourceType: 'paste',
        ...(title !== undefined && { title }),
        content,
        visibility,
        addedBy: userId,
        ...(tags !== undefined && { tags }),
      });

      res.status(201).json({ documentId: doc._id.toString(), status: doc.status });
    } catch (err) {
      next(err);
    }
  },
);

export { router as pasteRouter };
