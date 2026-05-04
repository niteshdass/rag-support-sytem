import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ChunkModel } from '../../../src/infra/mongo/models/Chunk.js';

describe('Chunk model', () => {
  let mongod: MongoMemoryServer;
  const tenantA = new mongoose.Types.ObjectId();
  const tenantB = new mongoose.Types.ObjectId();
  const documentId = new mongoose.Types.ObjectId();

  const base = () => ({
    tenantId: tenantA,
    documentId,
    text: 'How to export your data.',
    position: 0,
    visibility: 'customer-facing' as const,
  });

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
    await ChunkModel.syncIndexes();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongod.stop();
  });

  it('creates and round-trips a chunk', async () => {
    const chunk = await ChunkModel.create({
      ...base(),
      qdrantPointId: 'point-uuid-001',
    });

    const found = await ChunkModel.findById(chunk._id);
    expect(found).not.toBeNull();
    expect(found!.text).toBe('How to export your data.');
    expect(found!.position).toBe(0);
    expect(found!.visibility).toBe('customer-facing');
    expect(found!.qdrantPointId).toBe('point-uuid-001');
  });

  it('stores internal visibility', async () => {
    const chunk = await ChunkModel.create({
      ...base(),
      position: 1,
      visibility: 'internal',
    });
    expect(chunk.visibility).toBe('internal');
  });

  it('enforces unique (tenantId, documentId, position)', async () => {
    await ChunkModel.create({ ...base(), position: 2 });
    await expect(
      ChunkModel.create({ ...base(), position: 2 }),
    ).rejects.toThrow();
  });

  it('allows same position across different documents', async () => {
    const otherDoc = new mongoose.Types.ObjectId();
    await ChunkModel.create({ ...base(), position: 3 });
    await ChunkModel.create({ ...base(), documentId: otherDoc, position: 3 });
  });

  it('allows same position across different tenants', async () => {
    await ChunkModel.create({ ...base(), position: 4 });
    await ChunkModel.create({ ...base(), tenantId: tenantB, position: 4 });
  });

  it('forTenant() scopes to correct tenant', async () => {
    await ChunkModel.create({ ...base(), tenantId: tenantB, position: 99 });

    const aChunks = await ChunkModel.forTenant(tenantA).find();
    const bChunks = await ChunkModel.forTenant(tenantB).find();

    expect(aChunks.every(c => c.tenantId.equals(tenantA))).toBe(true);
    expect(bChunks.every(c => c.tenantId.equals(tenantB))).toBe(true);
  });
});
