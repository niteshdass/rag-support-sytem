import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TenantModel, TenantZodSchema } from '../../../src/infra/mongo/models/Tenant.js';

describe('Tenant model', () => {
  let mongod: MongoMemoryServer;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
    await TenantModel.syncIndexes();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongod.stop();
  });

  it('create + find roundtrip', async () => {
    await TenantModel.create({ name: 'Acme SaaS', slug: 'acme-saas', plan: 'pro' });
    const found = await TenantModel.findOne({ slug: 'acme-saas' });
    expect(found).not.toBeNull();
    expect(found!.name).toBe('Acme SaaS');
    expect(found!.slug).toBe('acme-saas');
    expect(found!.plan).toBe('pro');
  });

  it('rejects duplicate name', async () => {
    await TenantModel.create({ name: 'Bytestore', slug: 'bytestore' });
    await expect(TenantModel.create({ name: 'Bytestore', slug: 'bytestore-2' })).rejects.toThrow();
  });

  it('rejects duplicate slug', async () => {
    await TenantModel.create({ name: 'Internal', slug: 'internal' });
    await expect(TenantModel.create({ name: 'Internal 2', slug: 'internal' })).rejects.toThrow();
  });

  it('applies defaults correctly', async () => {
    const tenant = await TenantModel.create({ name: 'Defaults Test', slug: 'defaults-test' });
    expect(tenant.autoResolveEnabled).toBe(false);
    expect(tenant.confidenceThreshold).toBe(0.85);
    expect(tenant.apiKeys).toEqual([]);
    expect(tenant.settings).toEqual({});
    expect(tenant.plan).toBe('free');
  });

  it('Zod schema validates and derives correct type', () => {
    const result = TenantZodSchema.safeParse({ name: 'Test Tenant', slug: 'test-tenant' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.autoResolveEnabled).toBe(false);
      expect(result.data.confidenceThreshold).toBe(0.85);
    }
  });

  it('Zod schema rejects invalid slug format', () => {
    const result = TenantZodSchema.safeParse({ name: 'Bad Slug', slug: 'Bad Slug!' });
    expect(result.success).toBe(false);
  });
});
