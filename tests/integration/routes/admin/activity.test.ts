import MongoStore from 'connect-mongo';
import express from 'express';
import session from 'express-session';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Infra mocks — prevent pdf-parse / pdfjs-dist from loading in test env
// ---------------------------------------------------------------------------
vi.mock('../../../../src/infra/qdrant/client.js', () => ({
  ensureCollection: vi.fn().mockResolvedValue(undefined),
  upsertPoints: vi.fn().mockResolvedValue(undefined),
  deletePoints: vi.fn().mockResolvedValue(undefined),
  deleteByFilter: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../../src/infra/meilisearch/client.js', () => ({
  ensureIndex: vi.fn().mockResolvedValue(undefined),
  addDocs: vi.fn().mockResolvedValue(undefined),
  deleteDocs: vi.fn().mockResolvedValue(undefined),
  search: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../../../src/infra/storage/index.js', () => ({
  getStorage: vi.fn().mockReturnValue({ delete: vi.fn().mockResolvedValue(undefined) }),
}));

vi.mock('../../../../src/jobs/index.js', () => ({
  getJobQueue: vi.fn().mockReturnValue({ enqueue: vi.fn().mockResolvedValue(undefined) }),
}));

import { adminRouter } from '../../../../src/api/routes/admin/index.js';
import { authRouter } from '../../../../src/api/routes/auth.js';
import { errorHandler } from '../../../../src/api/middleware/errorHandler.js';
import { DraftModel } from '../../../../src/infra/mongo/models/Draft.js';
import { FeedbackModel } from '../../../../src/infra/mongo/models/Feedback.js';
import { TenantModel } from '../../../../src/infra/mongo/models/Tenant.js';
import { TicketModel } from '../../../../src/infra/mongo/models/Ticket.js';
import { UserModel } from '../../../../src/infra/mongo/models/User.js';

function buildApp(mongoUri: string) {
  const app = express();
  app.use(express.json());
  app.use(
    session({
      secret: 'test-secret-long-enough',
      resave: false,
      saveUninitialized: false,
      store: MongoStore.create({ mongoUrl: mongoUri }),
      cookie: { httpOnly: true },
    }),
  );
  app.use('/auth', authRouter);
  app.use('/admin', adminRouter);
  app.use(errorHandler);
  return app;
}

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------
function makeTicket(tenantId: string, overrides: Record<string, unknown> = {}) {
  return {
    tenantId: new mongoose.Types.ObjectId(tenantId),
    channel: 'zendesk',
    externalId: `zd-${Math.random()}`,
    customer: { email: 'user@example.com', name: 'Jane' },
    subject: 'How do I export?',
    body: 'I cannot find the export button.',
    status: 'new',
    ...overrides,
  };
}

function makeDraft(tenantId: string, ticketId: mongoose.Types.ObjectId, overrides: Record<string, unknown> = {}) {
  return {
    tenantId: new mongoose.Types.ObjectId(tenantId),
    ticketId,
    text: 'Click the export button in settings.',
    citations: [
      {
        documentId: new mongoose.Types.ObjectId(),
        chunkId: new mongoose.Types.ObjectId(),
        score: 0.88,
        snippet: 'export button',
      },
    ],
    confidence: 0.8,
    route: 'draft',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------
describe('GET /admin/activity', () => {
  let mongod: MongoMemoryServer;
  let app: express.Express;
  const PASSWORD = 'demo1234';

  let tenantAId: string;
  let tenantBId: string;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    const uri = mongod.getUri();
    await mongoose.connect(uri);
    app = buildApp(uri);

    const tenantA = await TenantModel.create({ name: 'Acme', slug: 'acme-act' });
    tenantAId = tenantA._id.toString();

    const tenantB = await TenantModel.create({ name: 'Other', slug: 'other-act' });
    tenantBId = tenantB._id.toString();

    await UserModel.create({
      tenantId: tenantA._id,
      email: 'agent@acme-act.com',
      passwordHash: PASSWORD,
      role: 'agent',
      name: 'Agent A',
    });

    await UserModel.create({
      tenantId: tenantB._id,
      email: 'agent@other-act.com',
      passwordHash: PASSWORD,
      role: 'agent',
      name: 'Agent B',
    });
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongod.stop();
  });

  beforeEach(async () => {
    await DraftModel.deleteMany({});
    await TicketModel.deleteMany({});
    await FeedbackModel.deleteMany({});
  });

  async function loginAs(email: string) {
    const agent = request.agent(app);
    const slug = email.includes('other') ? 'other-act' : 'acme-act';
    await agent.post('/auth/login').send({ email, password: PASSWORD, tenantSlug: slug });
    return agent;
  }

  // -------------------------------------------------------------------------
  it('401 when not authenticated', async () => {
    const res = await request(app).get('/admin/activity');
    expect(res.status).toBe(401);
  });

  it('400 for invalid query params', async () => {
    const agent = await loginAs('agent@acme-act.com');
    const res = await agent.get('/admin/activity?page=0');
    expect(res.status).toBe(400);
  });

  it('returns empty when no drafts', async () => {
    const agent = await loginAs('agent@acme-act.com');
    const res = await agent.get('/admin/activity');
    expect(res.status).toBe(200);
    expect(res.body.results).toHaveLength(0);
    expect(res.body.total).toBe(0);
  });

  it('returns seeded items with ticket + draft shape', async () => {
    const ticket = await TicketModel.create(makeTicket(tenantAId));
    await DraftModel.create(makeDraft(tenantAId, ticket._id));

    const agent = await loginAs('agent@acme-act.com');
    const res = await agent.get('/admin/activity');

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.results).toHaveLength(1);

    const item = res.body.results[0];
    expect(item.subject).toBe('How do I export?');
    expect(item.channel).toBe('zendesk');
    expect(item.customer.email).toBe('user@example.com');
    expect(item.draft).toBeDefined();
    expect(item.draft.citations).toHaveLength(1);
    expect(item.draft.confidence).toBe(0.8);
    expect(item.draft.route).toBe('draft');
  });

  it('filter by route=auto only returns auto-resolved drafts', async () => {
    const t1 = await TicketModel.create(makeTicket(tenantAId));
    const t2 = await TicketModel.create(makeTicket(tenantAId));
    await DraftModel.create(makeDraft(tenantAId, t1._id, { route: 'auto', confidence: 0.95 }));
    await DraftModel.create(makeDraft(tenantAId, t2._id, { route: 'draft', confidence: 0.5 }));

    const agent = await loginAs('agent@acme-act.com');
    const res = await agent.get('/admin/activity?route=auto');

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.results[0].draft.route).toBe('auto');
  });

  it('filter by route=draft excludes auto-resolved', async () => {
    const t1 = await TicketModel.create(makeTicket(tenantAId));
    const t2 = await TicketModel.create(makeTicket(tenantAId));
    await DraftModel.create(makeDraft(tenantAId, t1._id, { route: 'auto' }));
    await DraftModel.create(makeDraft(tenantAId, t2._id, { route: 'draft' }));

    const agent = await loginAs('agent@acme-act.com');
    const res = await agent.get('/admin/activity?route=draft');

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.results[0].draft.route).toBe('draft');
  });

  it('filter by ticket status', async () => {
    const t1 = await TicketModel.create(makeTicket(tenantAId, { status: 'closed' }));
    const t2 = await TicketModel.create(makeTicket(tenantAId, { status: 'new' }));
    await DraftModel.create(makeDraft(tenantAId, t1._id));
    await DraftModel.create(makeDraft(tenantAId, t2._id));

    const agent = await loginAs('agent@acme-act.com');
    const res = await agent.get('/admin/activity?status=closed');

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.results[0].status).toBe('closed');
  });

  it('filter by q searches subject', async () => {
    const t1 = await TicketModel.create(makeTicket(tenantAId, { subject: 'SSO login broken' }));
    const t2 = await TicketModel.create(makeTicket(tenantAId, { subject: 'How to export CSV' }));
    await DraftModel.create(makeDraft(tenantAId, t1._id));
    await DraftModel.create(makeDraft(tenantAId, t2._id));

    const agent = await loginAs('agent@acme-act.com');
    const res = await agent.get('/admin/activity?q=SSO');

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.results[0].subject).toBe('SSO login broken');
  });

  it('filter by q searches body', async () => {
    const t1 = await TicketModel.create(makeTicket(tenantAId, { body: 'The webhook signature is invalid' }));
    const t2 = await TicketModel.create(makeTicket(tenantAId, { body: 'I cannot log in' }));
    await DraftModel.create(makeDraft(tenantAId, t1._id));
    await DraftModel.create(makeDraft(tenantAId, t2._id));

    const agent = await loginAs('agent@acme-act.com');
    const res = await agent.get('/admin/activity?q=webhook');

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
  });

  it('filter by confidenceMin', async () => {
    const t1 = await TicketModel.create(makeTicket(tenantAId));
    const t2 = await TicketModel.create(makeTicket(tenantAId));
    await DraftModel.create(makeDraft(tenantAId, t1._id, { confidence: 0.9 }));
    await DraftModel.create(makeDraft(tenantAId, t2._id, { confidence: 0.4 }));

    const agent = await loginAs('agent@acme-act.com');
    const res = await agent.get('/admin/activity?confidenceMin=0.8');

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.results[0].draft.confidence).toBeGreaterThanOrEqual(0.8);
  });

  it('filter by confidenceMax', async () => {
    const t1 = await TicketModel.create(makeTicket(tenantAId));
    const t2 = await TicketModel.create(makeTicket(tenantAId));
    await DraftModel.create(makeDraft(tenantAId, t1._id, { confidence: 0.9 }));
    await DraftModel.create(makeDraft(tenantAId, t2._id, { confidence: 0.3 }));

    const agent = await loginAs('agent@acme-act.com');
    const res = await agent.get('/admin/activity?confidenceMax=0.5');

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.results[0].draft.confidence).toBeLessThanOrEqual(0.5);
  });

  it('paginates correctly', async () => {
    for (let i = 0; i < 5; i++) {
      const t = await TicketModel.create(makeTicket(tenantAId));
      await DraftModel.create(makeDraft(tenantAId, t._id));
    }

    const agent = await loginAs('agent@acme-act.com');
    const res = await agent.get('/admin/activity?page=2&pageSize=2');

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(5);
    expect(res.body.results).toHaveLength(2);
    expect(res.body.page).toBe(2);
    expect(res.body.pageSize).toBe(2);
  });

  it('includes feedback on the item when present', async () => {
    const ticket = await TicketModel.create(makeTicket(tenantAId));
    const draft = await DraftModel.create(makeDraft(tenantAId, ticket._id));

    await FeedbackModel.create({
      tenantId: new mongoose.Types.ObjectId(tenantAId),
      draftId: draft._id,
      type: 'thumbs',
      payload: { value: 'up' },
      userId: new mongoose.Types.ObjectId(),
    });

    const agent = await loginAs('agent@acme-act.com');
    const res = await agent.get('/admin/activity');

    expect(res.status).toBe(200);
    expect(res.body.results[0].feedback).toHaveLength(1);
    expect(res.body.results[0].feedback[0].type).toBe('thumbs');
  });

  it('cross-tenant isolation: tenant B agent sees no tenant A items', async () => {
    const ticket = await TicketModel.create(makeTicket(tenantAId));
    await DraftModel.create(makeDraft(tenantAId, ticket._id));

    const agent = await loginAs('agent@other-act.com');
    const res = await agent.get('/admin/activity');

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(0);
    expect(res.body.results).toHaveLength(0);
  });

  it('sorted by createdAt desc (newest first)', async () => {
    const t1 = await TicketModel.create(makeTicket(tenantAId, { subject: 'Older' }));
    const t2 = await TicketModel.create(makeTicket(tenantAId, { subject: 'Newer' }));
    const d1 = await DraftModel.create(makeDraft(tenantAId, t1._id));
    // Small delay to ensure different createdAt
    await new Promise(r => setTimeout(r, 10));
    await DraftModel.create(makeDraft(tenantAId, t2._id));

    // Force t1's draft createdAt to be older
    await DraftModel.findByIdAndUpdate(d1._id, { $set: { createdAt: new Date(Date.now() - 10000) } });

    const agent = await loginAs('agent@acme-act.com');
    const res = await agent.get('/admin/activity');

    expect(res.status).toBe(200);
    expect(res.body.results[0].subject).toBe('Newer');
    expect(res.body.results[1].subject).toBe('Older');
  });
});
