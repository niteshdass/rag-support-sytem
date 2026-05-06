import { Router, type NextFunction, type Request, type Response } from 'express';
import { TenantModel } from '../../../infra/mongo/models/Tenant.js';
import { tenantMiddleware } from '../../middleware/tenant.js';
import { PatchSettingsSchema } from '../../validators/settings.js';

const router = Router();

router.get(
  '/',
  tenantMiddleware,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const tenant = await TenantModel.findById(req.tenantId).lean();
      if (!tenant) {
        res.status(404).json({ error: 'tenant not found' });
        return;
      }
      res.json({
        autoResolveEnabled: tenant.autoResolveEnabled,
        confidenceThreshold: tenant.confidenceThreshold,
      });
    } catch (err) {
      next(err);
    }
  },
);

router.patch(
  '/',
  tenantMiddleware,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const parsed = PatchSettingsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    try {
      const tenant = await TenantModel.findByIdAndUpdate(
        req.tenantId,
        { $set: parsed.data },
        { new: true, lean: true },
      );
      if (!tenant) {
        res.status(404).json({ error: 'tenant not found' });
        return;
      }
      res.json({
        autoResolveEnabled: tenant.autoResolveEnabled,
        confidenceThreshold: tenant.confidenceThreshold,
      });
    } catch (err) {
      next(err);
    }
  },
);

export { router as settingsRouter };
