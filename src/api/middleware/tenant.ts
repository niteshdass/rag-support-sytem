import type { NextFunction, Request, Response } from 'express';
import mongoose from 'mongoose';
import { env } from '../../config/env.js';
import { TenantModel } from '../../infra/mongo/models/Tenant.js';
import { UserModel } from '../../infra/mongo/models/User.js';
import { logger } from '../../observability/logger.js';

export async function tenantMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (env.NODE_ENV === 'production') {
    // Real session-based auth added in prompt 10
    res.status(501).json({ error: 'production auth not yet implemented' });
    return;
  }

  const rawTenantId = req.headers['x-tenant-id'];
  const rawUserId = req.headers['x-user-id'];

  if (!rawTenantId || !rawUserId) {
    res.status(401).json({ error: 'missing X-Tenant-Id or X-User-Id header' });
    return;
  }

  let tenantOid: mongoose.Types.ObjectId;
  let userOid: mongoose.Types.ObjectId;

  try {
    tenantOid = new mongoose.Types.ObjectId(rawTenantId as string);
    userOid = new mongoose.Types.ObjectId(rawUserId as string);
  } catch {
    res.status(404).json({ error: 'invalid id format' });
    return;
  }

  const tenant = await TenantModel.findById(tenantOid).lean();
  if (!tenant) {
    res.status(404).json({ error: 'tenant not found' });
    return;
  }

  // Raw findById intentional here — we need to verify the user's tenantId
  // before we know which tenant to scope to (admin tooling pattern).
  const user = await UserModel.findById(userOid);
  if (!user) {
    res.status(404).json({ error: 'user not found' });
    return;
  }

  if (!user.tenantId.equals(tenantOid)) {
    logger.warn(
      { userId: userOid, tenantId: tenantOid },
      'cross-tenant access attempt',
    );
    res.status(403).json({ error: 'user does not belong to this tenant' });
    return;
  }

  req.tenantId = tenantOid;
  req.user = user;
  next();
}
