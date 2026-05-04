import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { TenantModel } from '../../infra/mongo/models/Tenant.js';
import { UserModel } from '../../infra/mongo/models/User.js';

const router = Router();

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  tenantSlug: z.string().min(1),
});

router.post(
  '/login',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const parsed = LoginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const { email, password, tenantSlug } = parsed.data;

    const tenant = await TenantModel.findOne({ slug: tenantSlug }).lean();
    if (!tenant) {
      res.status(401).json({ error: 'invalid credentials' });
      return;
    }

    const user = await UserModel.findOne({ tenantId: tenant._id, email });
    if (!user) {
      res.status(401).json({ error: 'invalid credentials' });
      return;
    }

    const valid = await user.comparePassword(password);
    if (!valid) {
      res.status(401).json({ error: 'invalid credentials' });
      return;
    }

    req.session.userId = user._id.toString();

    const { passwordHash: _omit, ...safeUser } = user.toObject();
    res.json({ user: safeUser });
  },
);

router.post(
  '/logout',
  (req: Request, res: Response, next: NextFunction): void => {
    req.session.destroy((err) => {
      if (err) {
        next(err);
        return;
      }
      res.clearCookie('connect.sid');
      res.json({ ok: true });
    });
  },
);

router.get(
  '/me',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.session.userId) {
      res.status(401).json({ error: 'not authenticated' });
      return;
    }

    const user = await UserModel.findById(req.session.userId);
    if (!user) {
      res.status(401).json({ error: 'session invalid' });
      return;
    }

    const tenant = await TenantModel.findById(user.tenantId).lean();
    if (!tenant) {
      res.status(401).json({ error: 'tenant not found' });
      return;
    }

    const { passwordHash: _omit, ...safeUser } = user.toObject();
    res.json({ user: safeUser, tenant });
  },
);

export { router as authRouter };
