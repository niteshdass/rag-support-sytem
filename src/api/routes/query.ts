import { Router, type NextFunction, type Request, type Response } from 'express';
import { tenantMiddleware } from '../middleware/tenant.js';
import { QueryBodySchema } from '../validators/query.js';
import { getPipeline } from '../../domain/rag/pipeline.factory.js';
import { TenantModel } from '../../infra/mongo/models/Tenant.js';

const router = Router();

router.post(
  '/',
  tenantMiddleware,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const parsed = QueryBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const { query, history, audience } = parsed.data;

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
        recentMessages: history,
      });

      res.json(answer);
    } catch (err) {
      next(err);
    }
  },
);

export { router as queryRouter };
