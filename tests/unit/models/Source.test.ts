import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SourceModel } from '../../../src/infra/mongo/models/Source.js';

describe('Source model', () => {
  let mongod: MongoMemoryServer;
  const tenantA = new mongoose.Types.ObjectId();
  const tenantB = new mongoose.Types.ObjectId();
  const addedBy = new mongoose.Types.ObjectId();

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongod.stop();
  });

  it('creates and round-trips a source', async () => {
    const source = await SourceModel.create({
      tenantId: tenantA,
      type: 'connector',
      subtype: 'zendesk',
      config: { subdomain: 'acme', apiKey: 'key123' },
      status: 'active',
      addedBy,
    });

    const found = await SourceModel.findById(source._id);
    expect(found).not.toBeNull();
    expect(found!.type).toBe('connector');
    expect(found!.subtype).toBe('zendesk');
    expect(found!.status).toBe('active');
    expect((found!.config as Record<string, unknown>).subdomain).toBe('acme');
  });

  it('defaults status to active', async () => {
    const source = await SourceModel.create({
      tenantId: tenantA,
      type: 'upload',
      subtype: 'pdf-upload',
      addedBy,
    });
    expect(source.status).toBe('active');
  });

  it('forTenant() scopes to correct tenant', async () => {
    await SourceModel.create({
      tenantId: tenantB,
      type: 'crawl',
      subtype: 'web',
      config: { url: 'https://help.bytestore.io' },
      addedBy,
    });

    const tenantASources = await SourceModel.forTenant(tenantA).find();
    const tenantBSources = await SourceModel.forTenant(tenantB).find();

    expect(tenantASources.every(s => s.tenantId.equals(tenantA))).toBe(true);
    expect(tenantBSources.every(s => s.tenantId.equals(tenantB))).toBe(true);
    expect(tenantASources.length).toBeGreaterThan(0);
    expect(tenantBSources.length).toBe(1);
  });

  it('forTenant() countDocuments respects scoping', async () => {
    const countA = await SourceModel.forTenant(tenantA).countDocuments();
    const countB = await SourceModel.forTenant(tenantB).countDocuments();
    expect(countA).toBeGreaterThan(countB);
  });
});
