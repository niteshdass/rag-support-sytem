import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TenantModel, TenantZodSchema } from '../../../src/infra/mongo/models/Tenant.js';

describe('Tenant model', () => {
  let mongod: MongoMemoryServer;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongod.stop();
  });

  it('create + find roundtrip', async () => {
    await TenantModel.create({ name: 'acme-saas', plan: 'pro' });
    const found = await TenantModel.findOne({ name: 'acme-saas' });
    expect(found).not.toBeNull();
    expect(found!.name).toBe('acme-saas');
    expect(found!.plan).toBe('pro');
  });

  it('rejects duplicate name', async () => {
    await TenantModel.create({ name: 'bytestore' });
    await expect(TenantModel.create({ name: 'bytestore' })).rejects.toThrow();
  });

  it('applies defaults correctly', async () => {
    const tenant = await TenantModel.create({ name: 'defaults-test' });
    expect(tenant.autoResolveEnabled).toBe(false);
    expect(tenant.confidenceThreshold).toBe(0.85);
    expect(tenant.apiKeys).toEqual([]);
    expect(tenant.settings).toEqual({});
    expect(tenant.plan).toBe('free');
  });

  it('Zod schema validates and derives correct type', () => {
    const result = TenantZodSchema.safeParse({ name: 'test-tenant' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.autoResolveEnabled).toBe(false);
      expect(result.data.confidenceThreshold).toBe(0.85);
    }
  });
});
