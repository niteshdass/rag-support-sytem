import { Router, type NextFunction, type Request, type Response } from 'express';
import mongoose from 'mongoose';
import { ChunkModel } from '../../../infra/mongo/models/Chunk.js';
import { DocumentModel } from '../../../infra/mongo/models/Document.js';
import * as meili from '../../../infra/meilisearch/client.js';
import { type Visibility } from '../../../infra/meilisearch/client.js';
import { purgeService } from '../../../domain/knowledge/purgeService.js';
import { tenantMiddleware } from '../../middleware/tenant.js';
import { DocumentListQuerySchema } from '../../validators/documents.js';

const CONTENT_TRUNCATE = 5000;
const ALL_VISIBILITIES: [Visibility, Visibility, Visibility] = [
  'customer-facing',
  'internal',
  'draft',
];

const router = Router();

router.get(
  '/',
  tenantMiddleware,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const parsed = DocumentListQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const { q, visibility, sourceId, status, page, pageSize } = parsed.data;
    const tenantId = req.tenantId!.toString();

    try {
      if (q) {
        const visibilityFilter: [Visibility, ...Visibility[]] = visibility
          ? [visibility]
          : ALL_VISIBILITIES;

        const hits = await meili.search(tenantId, q, {
          visibility: visibilityFilter,
          limit: 200,
        });

        const seenIds = new Set<string>();
        const orderedIds: string[] = [];
        for (const hit of hits) {
          if (!seenIds.has(hit.documentId)) {
            seenIds.add(hit.documentId);
            orderedIds.push(hit.documentId);
          }
        }

        const mongoFilter: Record<string, unknown> = {
          _id: { $in: orderedIds.map(id => new mongoose.Types.ObjectId(id)) },
        };
        if (status) mongoFilter.status = status;
        if (sourceId) mongoFilter.sourceId = new mongoose.Types.ObjectId(sourceId);

        const docs = await DocumentModel.forTenant(tenantId)
          .find(mongoFilter)
          .select('-content');

        const docMap = new Map(docs.map(d => [d._id.toString(), d]));
        const results = orderedIds.map(id => docMap.get(id)).filter(Boolean);

        res.json({ results, total: results.length });
        return;
      }

      const mongoFilter: Record<string, unknown> = {};
      if (visibility) mongoFilter.visibility = visibility;
      if (sourceId) mongoFilter.sourceId = new mongoose.Types.ObjectId(sourceId);
      if (status) mongoFilter.status = status;

      const skip = (page - 1) * pageSize;

      const [results, total] = await Promise.all([
        DocumentModel.forTenant(tenantId)
          .find(mongoFilter)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(pageSize)
          .select('-content'),
        DocumentModel.forTenant(tenantId).countDocuments(mongoFilter),
      ]);

      res.json({ results, total, page, pageSize });
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/:id',
  tenantMiddleware,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const tenantId = req.tenantId!.toString();
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(404).json({ error: 'document not found' });
      return;
    }

    try {
      const doc = await DocumentModel.forTenant(tenantId).findOne({
        _id: new mongoose.Types.ObjectId(id),
      });

      if (!doc) {
        res.status(404).json({ error: 'document not found' });
        return;
      }

      const result = doc.toObject();
      if (typeof result.content === 'string' && result.content.length > CONTENT_TRUNCATE) {
        result.content = result.content.slice(0, CONTENT_TRUNCATE);
        result.contentTruncated = true;
      }

      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/:id/chunks',
  tenantMiddleware,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const tenantId = req.tenantId!.toString();
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(404).json({ error: 'document not found' });
      return;
    }

    try {
      const doc = await DocumentModel.forTenant(tenantId).findOne({
        _id: new mongoose.Types.ObjectId(id),
      });

      if (!doc) {
        res.status(404).json({ error: 'document not found' });
        return;
      }

      const chunks = await ChunkModel.forTenant(tenantId)
        .find({ documentId: doc._id })
        .sort({ position: 1 });

      res.json({ chunks, total: chunks.length });
    } catch (err) {
      next(err);
    }
  },
);

router.delete(
  '/:id',
  tenantMiddleware,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const tenantId = req.tenantId!.toString();
    const actorId = req.user!._id.toString();
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(404).json({ error: 'document not found' });
      return;
    }

    try {
      await purgeService.purge(tenantId, id, actorId);
      res.status(200).json({ ok: true });
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('Document not found')) {
        res.status(404).json({ error: 'document not found' });
        return;
      }
      next(err);
    }
  },
);

export { router as documentsRouter };
