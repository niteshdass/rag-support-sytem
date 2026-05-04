import type { NextFunction, Request, Response } from 'express';
import { TenantModel } from '../../infra/mongo/models/Tenant.js';
import { UserModel } from '../../infra/mongo/models/User.js';
import { logger } from '../../observability/logger.js';

export async function tenantMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (!req.session.userId) {
    res.status(401).json({ error: 'not authenticated' });
    return;
  }

  const user = await UserModel.findById(req.session.userId);
  if (!user) {
    req.session.destroy(() => undefined);
    res.status(401).json({ error: 'session invalid' });
    return;
  }

  const tenant = await TenantModel.findById(user.tenantId).lean();
  if (!tenant) {
    logger.warn({ userId: user._id }, 'tenant missing for authenticated user');
    res.status(401).json({ error: 'tenant not found' });
    return;
  }

  req.user = user;
  req.tenantId = user.tenantId;
  next();
}
