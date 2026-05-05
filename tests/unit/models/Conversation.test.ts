import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ConversationModel } from '../../../src/infra/mongo/models/Conversation.js';

describe('Conversation model', () => {
  let mongod: MongoMemoryServer;
  const tenantA = new mongoose.Types.ObjectId();
  const tenantB = new mongoose.Types.ObjectId();
  const ticketId = new mongoose.Types.ObjectId();

  const base = () => ({
    tenantId: tenantA,
    ticketId,
    messages: [
      { role: 'user' as const, content: 'How do I export?', timestamp: new Date() },
      { role: 'assistant' as const, content: 'Click Settings → Export.', timestamp: new Date() },
    ],
    confidenceScores: [0.92],
  });

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
    await ConversationModel.syncIndexes();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongod.stop();
  });

  it('creates and round-trips a conversation', async () => {
    const conv = await ConversationModel.create(base());
    const found = await ConversationModel.findById(conv._id);
    expect(found).not.toBeNull();
    expect(found!.messages).toHaveLength(2);
    expect(found!.messages[0].role).toBe('user');
    expect(found!.messages[1].content).toBe('Click Settings → Export.');
    expect(found!.confidenceScores[0]).toBe(0.92);
  });

  it('creates conversation with empty messages', async () => {
    const conv = await ConversationModel.create({
      tenantId: tenantA,
      ticketId: new mongoose.Types.ObjectId(),
      messages: [],
      confidenceScores: [],
    });
    expect(conv.messages).toHaveLength(0);
  });

  it('stores agent role messages', async () => {
    const conv = await ConversationModel.create({
      ...base(),
      ticketId: new mongoose.Types.ObjectId(),
      messages: [{ role: 'agent' as const, content: 'Let me check that for you.', timestamp: new Date() }],
    });
    expect(conv.messages[0].role).toBe('agent');
  });

  it('forTenant() scopes to correct tenant', async () => {
    await ConversationModel.create({ ...base(), tenantId: tenantB, ticketId: new mongoose.Types.ObjectId() });

    const aConvs = await ConversationModel.forTenant(tenantA).find();
    const bConvs = await ConversationModel.forTenant(tenantB).find();

    expect(aConvs.every(c => c.tenantId.equals(tenantA))).toBe(true);
    expect(bConvs.every(c => c.tenantId.equals(tenantB))).toBe(true);
  });
});
