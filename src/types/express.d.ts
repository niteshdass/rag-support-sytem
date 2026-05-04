import type { TenantDocument } from '../infra/mongo/models/Tenant.js';
import type { UserDocument } from '../infra/mongo/models/User.js';
import type mongoose from 'mongoose';

declare global {
  namespace Express {
    interface Request {
      id?: string;
      tenantId?: mongoose.Types.ObjectId;
      user?: UserDocument;
    }
  }
}

export {};
