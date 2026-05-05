import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TicketModel } from '../../../src/infra/mongo/models/Ticket.js';

describe('Ticket model', () => {
  let mongod: MongoMemoryServer;
  const tenantA = new mongoose.Types.ObjectId();
  const tenantB = new mongoose.Types.ObjectId();

  const base = () => ({
    tenantId: tenantA,
    channel: 'zendesk' as const,
    externalId: 'ZD-001',
    customer: { email: 'user@example.com', name: 'Alice' },
    subject: 'Cannot export data',
    body: 'I click export but nothing happens.',
    status: 'new' as const,
  });

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
    await TicketModel.syncIndexes();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongod.stop();
  });

  it('creates and round-trips a ticket', async () => {
    const ticket = await TicketModel.create(base());
    const found = await TicketModel.findById(ticket._id);
    expect(found).not.toBeNull();
    expect(found!.subject).toBe('Cannot export data');
    expect(found!.channel).toBe('zendesk');
    expect(found!.status).toBe('new');
    expect(found!.customer.email).toBe('user@example.com');
  });

  it('enforces unique (tenantId, channel, externalId)', async () => {
    await TicketModel.create({ ...base(), externalId: 'ZD-DUP' });
    await expect(
      TicketModel.create({ ...base(), externalId: 'ZD-DUP' }),
    ).rejects.toThrow();
  });

  it('allows same externalId across different channels', async () => {
    await TicketModel.create({ ...base(), externalId: 'SHARED-001', channel: 'zendesk' });
    await TicketModel.create({ ...base(), externalId: 'SHARED-001', channel: 'email' });
  });

  it('allows same externalId across different tenants', async () => {
    await TicketModel.create({ ...base(), externalId: 'ZD-CROSS' });
    await TicketModel.create({ ...base(), tenantId: tenantB, externalId: 'ZD-CROSS' });
  });

  it('forTenant() scopes to correct tenant', async () => {
    await TicketModel.create({ ...base(), tenantId: tenantB, externalId: 'ZD-B-SCOPE' });

    const aTickets = await TicketModel.forTenant(tenantA).find();
    const bTickets = await TicketModel.forTenant(tenantB).find();

    expect(aTickets.every(t => t.tenantId.equals(tenantA))).toBe(true);
    expect(bTickets.every(t => t.tenantId.equals(tenantB))).toBe(true);
  });
});
