import { Router, type NextFunction, type Request, type Response } from 'express';
import mongoose from 'mongoose';
import { purgeService } from '../../../domain/knowledge/purgeService.js';
import { DocumentModel } from '../../../infra/mongo/models/Document.js';
import { SourceModel } from '../../../infra/mongo/models/Source.js';
import { getJobQueue, schedulePeriodicSync, cancelPeriodicSync } from '../../../jobs/index.js';
import { tenantMiddleware } from '../../middleware/tenant.js';
import { SourceCreateBodySchema, SourceListQuerySchema } from '../../validators/sources.js';

const router = Router();

router.get(
  '/',
  tenantMiddleware,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const parsed = SourceListQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const tenantId = req.tenantId!.toString();
    const { type, status } = parsed.data;

    try {
      const filter: Record<string, unknown> = {};
      if (type) filter.type = type;
      if (status) filter.status = status;

      const sources = await SourceModel.forTenant(tenantId).find(filter).sort({ createdAt: -1 });
      res.json({ results: sources, total: sources.length });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/',
  tenantMiddleware,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const parsed = SourceCreateBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const { type, subtype, config } = parsed.data;
    const tenantId = req.tenantId!.toString();
    const userId = req.user!._id.toString();

    try {
      const source = await SourceModel.create({
        tenantId: new mongoose.Types.ObjectId(tenantId),
        type,
        subtype,
        config,
        status: 'active',
        addedBy: new mongoose.Types.ObjectId(userId),
      });

      if (type === 'connector' || type === 'crawl') {
        const syncCron = (config as Record<string, unknown>).syncCron as string | undefined;
        await schedulePeriodicSync(source._id.toString(), syncCron).catch(() => undefined);
      }

      res.status(201).json(source);
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
      res.status(404).json({ error: 'source not found' });
      return;
    }

    try {
      const source = await SourceModel.forTenant(tenantId).findOne({
        _id: new mongoose.Types.ObjectId(id),
      });

      if (!source) {
        res.status(404).json({ error: 'source not found' });
        return;
      }

      // Cancel periodic sync and soft-delete
      await cancelPeriodicSync(source._id.toString()).catch(() => undefined);
      await SourceModel.findByIdAndUpdate(source._id, { $set: { status: 'disabled' } });

      // Purge all related docs that aren't already purged/purging
      const docs = await DocumentModel.forTenant(tenantId)
        .find({ sourceId: source._id, status: { $nin: ['purged', 'purging'] } })
        .select('_id');

      await Promise.all(docs.map(doc => purgeService.purge(tenantId, doc._id.toString(), actorId)));

      res.json({ ok: true, purged: docs.length });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/:id/sync',
  tenantMiddleware,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const tenantId = req.tenantId!.toString();
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(404).json({ error: 'source not found' });
      return;
    }

    try {
      const source = await SourceModel.forTenant(tenantId).findOne({
        _id: new mongoose.Types.ObjectId(id),
      });

      if (!source) {
        res.status(404).json({ error: 'source not found' });
        return;
      }

      await getJobQueue().enqueue('sync-source', { sourceId: id, tenantId });

      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);

export { router as sourcesRouter };
