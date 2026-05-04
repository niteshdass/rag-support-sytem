import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seedTenants } from '../../../scripts/seed/tenants.js';
import { seedUsers } from '../../../scripts/seed/users.js';
import { TenantModel } from '../../../src/infra/mongo/models/Tenant.js';
import { UserModel } from '../../../src/infra/mongo/models/User.js';

describe('seeder integration', () => {
  let mongod: MongoMemoryServer;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());

    // run twice to verify idempotency
    const t1 = await seedTenants();
    await seedUsers(t1);
    const t2 = await seedTenants();
    await seedUsers(t2);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongod.stop();
  });

  it('exactly 3 tenants after two seed runs', async () => {
    expect(await TenantModel.countDocuments()).toBe(3);
  });

  it('exactly 12 users after two seed runs (4 per tenant)', async () => {
    expect(await UserModel.countDocuments()).toBe(12);
  });

  it('seeded slugs are acme-saas, bytestore, internal', async () => {
    const slugs = (await TenantModel.find().select('slug').lean()).map((t) => t.slug).sort();
    expect(slugs).toEqual(['acme-saas', 'bytestore', 'internal']);
  });

  it('admin@acme-saas.com authenticates with demo1234', async () => {
    const tenant = await TenantModel.findOne({ slug: 'acme-saas' });
    expect(tenant).not.toBeNull();

    const admin = await UserModel.findOne({ tenantId: tenant!._id, email: 'admin@acme-saas.com' });
    expect(admin).not.toBeNull();
    expect(admin!.role).toBe('admin');

    const ok = await admin!.comparePassword('demo1234');
    expect(ok).toBe(true);
  });

  it('each tenant has 1 admin and 3 agents', async () => {
    const tenants = await TenantModel.find();
    for (const tenant of tenants) {
      const adminCount = await UserModel.countDocuments({ tenantId: tenant._id, role: 'admin' });
      const agentCount = await UserModel.countDocuments({ tenantId: tenant._id, role: 'agent' });
      expect(adminCount).toBe(1);
      expect(agentCount).toBe(3);
    }
  });
});
