import type { NextFunction, Request, Response } from 'express';
import mongoose from 'mongoose';
import { TenantModel } from '../../infra/mongo/models/Tenant.js';

export async function apiKeyMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey || typeof apiKey !== 'string') {
    res.status(401).json({ error: 'missing x-api-key header' });
    return;
  }

  const tenant = await TenantModel.findOne({ apiKeys: apiKey }).lean();
  if (!tenant) {
    res.status(401).json({ error: 'invalid api key' });
    return;
  }

  req.tenantId = tenant._id as mongoose.Types.ObjectId;
  next();
}
