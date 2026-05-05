import express from 'express';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../src/jobs/index.js', () => ({
  getJobQueue: vi.fn().mockReturnValue({
    enqueue: vi.fn().mockResolvedValue(undefined),
  }),
}));

import { zendeskWebhookRouter } from '../../../../src/api/routes/webhooks/zendesk.js';
import { TenantModel } from '../../../../src/infra/mongo/models/Tenant.js';
import { TicketModel } from '../../../../src/infra/mongo/models/Ticket.js';
import { ConversationModel } from '../../../../src/infra/mongo/models/Conversation.js';
import { getJobQueue } from '../../../../src/jobs/index.js';

const API_KEY = 'test-api-key-abc123';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/webhooks/zendesk', zendeskWebhookRouter);
  return app;
}

describe('POST /webhooks/zendesk/ticket', () => {
  let mongod: MongoMemoryServer;
  let app: express.Express;
  let tenantId: string;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
    app = buildApp();

    const tenant = await TenantModel.create({
      name: 'Acme',
      slug: 'acme',
      apiKeys: [API_KEY],
    });
    tenantId = tenant._id.toString();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongod.stop();
  });

  beforeEach(async () => {
    await Promise.all([
      TicketModel.deleteMany({ tenantId: new mongoose.Types.ObjectId(tenantId) }),
      ConversationModel.deleteMany({ tenantId: new mongoose.Types.ObjectId(tenantId) }),
    ]);
    vi.mocked(getJobQueue().enqueue).mockClear();
  });

  const VALID_PAYLOAD = {
    externalId: 'zd-12345',
    subject: 'Cannot export CSV',
    body: 'Hi, I cannot find the export button anywhere in the dashboard.',
    customer: { email: 'user@example.com', name: 'Jane Doe' },
  };

  describe('auth', () => {
    it('401 when no x-api-key header', async () => {
      const res = await request(app).post('/webhooks/zendesk/ticket').send(VALID_PAYLOAD);
      expect(res.status).toBe(401);
    });

    it('401 when api key not found', async () => {
      const res = await request(app)
        .post('/webhooks/zendesk/ticket')
        .set('x-api-key', 'wrong-key')
        .send(VALID_PAYLOAD);
      expect(res.status).toBe(401);
    });
  });

  describe('validation', () => {
    it('400 on missing externalId', async () => {
      const { externalId: _skip, ...rest } = VALID_PAYLOAD;
      const res = await request(app)
        .post('/webhooks/zendesk/ticket')
        .set('x-api-key', API_KEY)
        .send(rest);
      expect(res.status).toBe(400);
    });

    it('400 on missing subject', async () => {
      const res = await request(app)
        .post('/webhooks/zendesk/ticket')
        .set('x-api-key', API_KEY)
        .send({ externalId: 'x', body: 'hello' });
      expect(res.status).toBe(400);
    });
  });

  describe('happy path', () => {
    it('creates ticket and conversation, enqueues job, returns 201', async () => {
      const res = await request(app)
        .post('/webhooks/zendesk/ticket')
        .set('x-api-key', API_KEY)
        .send(VALID_PAYLOAD);

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('ticketId');
      expect(res.body).toHaveProperty('conversationId');

      const ticket = await TicketModel.findById(res.body.ticketId).lean();
      expect(ticket).not.toBeNull();
      expect(ticket!.channel).toBe('zendesk');
      expect(ticket!.externalId).toBe(VALID_PAYLOAD.externalId);
      expect(ticket!.status).toBe('new');
      expect(ticket!.conversationId?.toString()).toBe(res.body.conversationId);

      const conv = await ConversationModel.findById(res.body.conversationId).lean();
      expect(conv).not.toBeNull();
      expect(conv!.messages).toHaveLength(1);
      expect(conv!.messages[0]!.role).toBe('user');
      expect(conv!.messages[0]!.content).toBe(VALID_PAYLOAD.body);

      expect(vi.mocked(getJobQueue().enqueue)).toHaveBeenCalledOnce();
      expect(vi.mocked(getJobQueue().enqueue)).toHaveBeenCalledWith(
        'generate-draft',
        { ticketId: res.body.ticketId },
      );
    });

    it('same externalId twice → second returns 200 with duplicate:true, no second ticket', async () => {
      await request(app)
        .post('/webhooks/zendesk/ticket')
        .set('x-api-key', API_KEY)
        .send(VALID_PAYLOAD)
        .expect(201);

      const second = await request(app)
        .post('/webhooks/zendesk/ticket')
        .set('x-api-key', API_KEY)
        .send(VALID_PAYLOAD)
        .expect(200);

      expect(second.body.duplicate).toBe(true);

      const count = await TicketModel.countDocuments({
        tenantId: new mongoose.Types.ObjectId(tenantId),
        channel: 'zendesk',
        externalId: VALID_PAYLOAD.externalId,
      });
      expect(count).toBe(1);

      expect(vi.mocked(getJobQueue().enqueue)).toHaveBeenCalledOnce();
    });
  });
});
