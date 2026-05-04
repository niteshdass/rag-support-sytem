import { faker } from '@faker-js/faker';
import mongoose from 'mongoose';
import { UserModel, type UserDocument } from '../../src/infra/mongo/models/User.js';
import { logger } from '../../src/observability/logger.js';

const SEED_PASSWORD = 'demo1234';

type TenantRef = { _id: mongoose.Types.ObjectId; slug: string };

export async function seedUsers(tenants: TenantRef[]): Promise<void> {
  faker.seed(42);

  for (const tenant of tenants) {
    const defs: Array<{ email: string; role: UserDocument['role']; name: string }> = [
      { email: `admin@${tenant.slug}.com`, role: 'admin', name: faker.person.fullName() },
      { email: `agent1@${tenant.slug}.com`, role: 'agent', name: faker.person.fullName() },
      { email: `agent2@${tenant.slug}.com`, role: 'agent', name: faker.person.fullName() },
      { email: `agent3@${tenant.slug}.com`, role: 'agent', name: faker.person.fullName() },
    ];

    for (const def of defs) {
      const existing = await UserModel.findOne({ tenantId: tenant._id, email: def.email });
      if (!existing) {
        await UserModel.create({
          tenantId: tenant._id,
          email: def.email,
          passwordHash: SEED_PASSWORD,
          role: def.role,
          name: def.name,
        });
        logger.info({ email: def.email, tenantSlug: tenant.slug }, 'user created');
      } else {
        logger.info({ email: def.email }, 'user exists — skipping');
      }
    }
  }
}
