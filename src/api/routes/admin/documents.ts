import { Router, type NextFunction, type Request, type Response } from 'express';
import mongoose from 'mongoose';
import { ChunkModel } from '../../../infra/mongo/models/Chunk.js';
import { DocumentModel } from '../../../infra/mongo/models/Document.js';
import * as meili from '../../../infra/meilisearch/client.js';
import { type Visibility } from '../../../infra/meilisearch/client.js';
import * as qdrant from '../../../infra/qdrant/client.js';
import { purgeService } from '../../../domain/knowledge/purgeService.js';
import { tenantMiddleware } from '../../middleware/tenant.js';
import { DocumentListQuerySchema, UpdateVisibilityBodySchema } from '../../validators/documents.js';

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

    const { q, visibility, sourceId, sourceType, status, page, pageSize } = parsed.data;
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
        else mongoFilter.status = { $ne: 'purged' };
        if (sourceType) mongoFilter.sourceType = sourceType;
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
      if (sourceType) mongoFilter.sourceType = sourceType;
      if (status) mongoFilter.status = status;
      else mongoFilter.status = { $ne: 'purged' };

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

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
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

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
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

router.patch(
  '/:id/visibility',
  tenantMiddleware,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const tenantId = req.tenantId!.toString();
    const { id } = req.params;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      res.status(404).json({ error: 'document not found' });
      return;
    }

    const parsed = UpdateVisibilityBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    try {
      const doc = await DocumentModel.forTenant(tenantId)
        .findOneAndUpdate(
          { _id: new mongoose.Types.ObjectId(id) },
          { $set: { visibility: parsed.data.visibility } },
          { new: true },
        )
        .select('-content');

      if (!doc) {
        res.status(404).json({ error: 'document not found' });
        return;
      }

      const newVisibility = parsed.data.visibility;
      const docObjectId = new mongoose.Types.ObjectId(id);

      // Sync chunk visibility across all stores
      const chunks = await ChunkModel.find({ tenantId, documentId: docObjectId }).lean();
      if (chunks.length > 0) {
        const qdrantIds = chunks.map(c => c.qdrantPointId).filter(Boolean) as string[];
        const meiliDocs = chunks.map(c => ({
          id: c._id.toString(),
          text: c.text,
          documentId: id,
          visibility: newVisibility,
        }));

        await Promise.all([
          ChunkModel.updateMany({ tenantId, documentId: docObjectId }, { $set: { visibility: newVisibility } }),
          qdrantIds.length > 0 ? qdrant.setPayloadForPoints('chunks', qdrantIds, { visibility: newVisibility }) : Promise.resolve(),
          meili.addDocs(tenantId, meiliDocs),
        ]);
      }

      res.json(doc);
    } catch (err) {
      next(err);
    }
  },
);

router.delete(
  '/',
  tenantMiddleware,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const tenantId = req.tenantId!.toString();
    const actorId = req.user!._id.toString();

    const ids: unknown = req.body?.ids;
    if (!Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ error: 'ids must be a non-empty array' });
      return;
    }

    const valid = (ids as unknown[]).filter(
      (id): id is string => typeof id === 'string' && mongoose.Types.ObjectId.isValid(id),
    );
    if (valid.length === 0) {
      res.status(400).json({ error: 'no valid document ids provided' });
      return;
    }

    try {
      const results = await Promise.allSettled(
        valid.map(id => purgeService.purge(tenantId, id, actorId)),
      );
      const deleted = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;
      res.json({ deleted, failed });
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

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
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
