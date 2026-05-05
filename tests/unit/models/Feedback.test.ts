import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FeedbackModel } from '../../../src/infra/mongo/models/Feedback.js';

describe('Feedback model', () => {
  let mongod: MongoMemoryServer;
  const tenantA = new mongoose.Types.ObjectId();
  const tenantB = new mongoose.Types.ObjectId();
  const draftId = new mongoose.Types.ObjectId();

  const base = () => ({
    tenantId: tenantA,
    draftId,
    type: 'thumbs' as const,
    payload: { value: 'up' },
  });

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
    await FeedbackModel.syncIndexes();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongod.stop();
  });

  it('creates and round-trips thumbs feedback', async () => {
    const fb = await FeedbackModel.create(base());
    const found = await FeedbackModel.findById(fb._id);
    expect(found).not.toBeNull();
    expect(found!.type).toBe('thumbs');
    expect(found!.payload).toEqual({ value: 'up' });
  });

  it('creates edit feedback with userId', async () => {
    const userId = new mongoose.Types.ObjectId();
    const fb = await FeedbackModel.create({
      ...base(),
      type: 'edit',
      payload: { before: 'old text', after: 'new text' },
      userId,
    });
    expect(fb.type).toBe('edit');
    expect(fb.userId!.equals(userId)).toBe(true);
  });

  it('creates rating feedback', async () => {
    const fb = await FeedbackModel.create({
      ...base(),
      type: 'rating',
      payload: { score: 4 },
    });
    expect(fb.type).toBe('rating');
    expect((fb.payload as { score: number }).score).toBe(4);
  });

  it('allows empty payload', async () => {
    const fb = await FeedbackModel.create({ ...base(), payload: {} });
    expect(fb.payload).toEqual({});
  });

  it('forTenant() scopes to correct tenant', async () => {
    await FeedbackModel.create({ ...base(), tenantId: tenantB });

    const aFb = await FeedbackModel.forTenant(tenantA).find();
    const bFb = await FeedbackModel.forTenant(tenantB).find();

    expect(aFb.every(f => f.tenantId.equals(tenantA))).toBe(true);
    expect(bFb.every(f => f.tenantId.equals(tenantB))).toBe(true);
  });
});
