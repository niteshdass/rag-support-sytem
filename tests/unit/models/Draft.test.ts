import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DraftModel } from '../../../src/infra/mongo/models/Draft.js';

describe('Draft model', () => {
  let mongod: MongoMemoryServer;
  const tenantA = new mongoose.Types.ObjectId();
  const tenantB = new mongoose.Types.ObjectId();
  const ticketId = new mongoose.Types.ObjectId();
  const docId = new mongoose.Types.ObjectId();
  const chunkId = new mongoose.Types.ObjectId();

  const baseCitation = () => ({
    documentId: docId,
    chunkId,
    score: 0.87,
    snippet: 'Click Settings → Export to download your data.',
  });

  const base = () => ({
    tenantId: tenantA,
    ticketId,
    text: 'To export your data, go to Settings → Export.',
    citations: [baseCitation()],
    confidence: 0.88,
    route: 'draft' as const,
  });

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
    await DraftModel.syncIndexes();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongod.stop();
  });

  it('creates and round-trips a draft', async () => {
    const draft = await DraftModel.create(base());
    const found = await DraftModel.findById(draft._id);
    expect(found).not.toBeNull();
    expect(found!.text).toBe('To export your data, go to Settings → Export.');
    expect(found!.confidence).toBe(0.88);
    expect(found!.route).toBe('draft');
    expect(found!.citations).toHaveLength(1);
    expect(found!.citations[0].score).toBe(0.87);
  });

  it('stores auto route', async () => {
    const draft = await DraftModel.create({
      ...base(),
      route: 'auto',
      confidence: 0.95,
    });
    expect(draft.route).toBe('auto');
  });

  it('stores agentEdits and sentAt', async () => {
    const sentAt = new Date();
    const draft = await DraftModel.create({
      ...base(),
      agentEdits: 'Agent changed tone to be more friendly.',
      sentAt,
    });
    expect(draft.agentEdits).toBe('Agent changed tone to be more friendly.');
    expect(draft.sentAt).toEqual(sentAt);
  });

  it('stores multiple citations', async () => {
    const draft = await DraftModel.create({
      ...base(),
      citations: [
        baseCitation(),
        { documentId: new mongoose.Types.ObjectId(), chunkId: new mongoose.Types.ObjectId(), score: 0.75, snippet: 'Another source.' },
      ],
    });
    expect(draft.citations).toHaveLength(2);
  });

  it('forTenant() scopes to correct tenant', async () => {
    await DraftModel.create({ ...base(), tenantId: tenantB });

    const aDrafts = await DraftModel.forTenant(tenantA).find();
    const bDrafts = await DraftModel.forTenant(tenantB).find();

    expect(aDrafts.every(d => d.tenantId.equals(tenantA))).toBe(true);
    expect(bDrafts.every(d => d.tenantId.equals(tenantB))).toBe(true);
  });
});
