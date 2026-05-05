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

describe('POST /admin/feedback', () => {
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

    const tenantA = await TenantModel.create({ name: 'Acme', slug: 'acme-fb' });
    tenantAId = tenantA._id.toString();

    const tenantB = await TenantModel.create({ name: 'Other', slug: 'other-fb' });
    tenantBId = tenantB._id.toString();

    await UserModel.create({
      tenantId: tenantA._id,
      email: 'agent@acme-fb.com',
      passwordHash: PASSWORD,
      role: 'agent',
      name: 'Agent A',
    });

    await UserModel.create({
      tenantId: tenantB._id,
      email: 'agent@other-fb.com',
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
    await FeedbackModel.deleteMany({});
  });

  async function loginAs(email: string) {
    const agent = request.agent(app);
    const slug = email.includes('other') ? 'other-fb' : 'acme-fb';
    await agent.post('/auth/login').send({ email, password: PASSWORD, tenantSlug: slug });
    return agent;
  }

  async function makeDraft(tenantId: string) {
    return DraftModel.create({
      tenantId: new mongoose.Types.ObjectId(tenantId),
      ticketId: new mongoose.Types.ObjectId(),
      text: 'Here is your answer.',
      citations: [
        {
          documentId: new mongoose.Types.ObjectId(),
          chunkId: new mongoose.Types.ObjectId(),
          score: 0.9,
          snippet: 'relevant snippet',
        },
      ],
      confidence: 0.85,
      route: 'draft',
    });
  }

  it('401 when not authenticated', async () => {
    const res = await request(app).post('/admin/feedback').send({});
    expect(res.status).toBe(401);
  });

  it('400 when body is missing required fields', async () => {
    const agent = await loginAs('agent@acme-fb.com');
    const res = await agent.post('/admin/feedback').send({ type: 'thumbs' });
    expect(res.status).toBe(400);
  });

  it('400 when thumbs payload is invalid', async () => {
    const draft = await makeDraft(tenantAId);
    const agent = await loginAs('agent@acme-fb.com');
    const res = await agent.post('/admin/feedback').send({
      draftId: draft._id.toString(),
      type: 'thumbs',
      payload: { value: 'sideways' },
    });
    expect(res.status).toBe(400);
  });

  it('400 when rating score out of range', async () => {
    const draft = await makeDraft(tenantAId);
    const agent = await loginAs('agent@acme-fb.com');
    const res = await agent.post('/admin/feedback').send({
      draftId: draft._id.toString(),
      type: 'rating',
      payload: { score: 10 },
    });
    expect(res.status).toBe(400);
  });

  it('404 for invalid draftId format', async () => {
    const agent = await loginAs('agent@acme-fb.com');
    const res = await agent.post('/admin/feedback').send({
      draftId: 'not-an-id',
      type: 'thumbs',
      payload: { value: 'up' },
    });
    expect(res.status).toBe(404);
  });

  it('404 for unknown draftId', async () => {
    const agent = await loginAs('agent@acme-fb.com');
    const res = await agent.post('/admin/feedback').send({
      draftId: new mongoose.Types.ObjectId().toString(),
      type: 'thumbs',
      payload: { value: 'up' },
    });
    expect(res.status).toBe(404);
  });

  it('201 creates thumbs-up feedback', async () => {
    const draft = await makeDraft(tenantAId);
    const agent = await loginAs('agent@acme-fb.com');

    const res = await agent.post('/admin/feedback').send({
      draftId: draft._id.toString(),
      type: 'thumbs',
      payload: { value: 'up' },
    });

    expect(res.status).toBe(201);
    expect(res.body.type).toBe('thumbs');
    expect(res.body.payload.value).toBe('up');
    expect(res.body.draftId).toBe(draft._id.toString());

    const saved = await FeedbackModel.findById(res.body._id);
    expect(saved).not.toBeNull();
    expect(saved!.type).toBe('thumbs');
  });

  it('201 creates rating feedback with optional comment', async () => {
    const draft = await makeDraft(tenantAId);
    const agent = await loginAs('agent@acme-fb.com');

    const res = await agent.post('/admin/feedback').send({
      draftId: draft._id.toString(),
      type: 'rating',
      payload: { score: 4, comment: 'pretty good' },
    });

    expect(res.status).toBe(201);
    expect(res.body.payload.score).toBe(4);
    expect(res.body.payload.comment).toBe('pretty good');
  });

  it('201 edit feedback → creates Feedback row and sets draft.sentAt + agentEdits', async () => {
    const draft = await makeDraft(tenantAId);
    const agent = await loginAs('agent@acme-fb.com');

    const res = await agent.post('/admin/feedback').send({
      draftId: draft._id.toString(),
      type: 'edit',
      payload: {
        originalText: 'Here is your answer.',
        sentText: 'Here is your improved answer!',
      },
    });

    expect(res.status).toBe(201);
    expect(res.body.type).toBe('edit');

    // Feedback row created
    const feedback = await FeedbackModel.findById(res.body._id);
    expect(feedback).not.toBeNull();
    expect(feedback!.type).toBe('edit');

    // Draft updated with sentAt and agentEdits
    const updatedDraft = await DraftModel.findById(draft._id);
    expect(updatedDraft!.sentAt).toBeInstanceOf(Date);
    expect(updatedDraft!.agentEdits).toBe('Here is your improved answer!');
  });

  it('thumbs feedback does NOT set draft.sentAt', async () => {
    const draft = await makeDraft(tenantAId);
    const agent = await loginAs('agent@acme-fb.com');

    await agent.post('/admin/feedback').send({
      draftId: draft._id.toString(),
      type: 'thumbs',
      payload: { value: 'down' },
    });

    const updatedDraft = await DraftModel.findById(draft._id);
    expect(updatedDraft!.sentAt).toBeUndefined();
  });

  it('cross-tenant: cannot leave feedback on another tenant draft', async () => {
    const draft = await makeDraft(tenantBId);
    const agent = await loginAs('agent@acme-fb.com');

    const res = await agent.post('/admin/feedback').send({
      draftId: draft._id.toString(),
      type: 'thumbs',
      payload: { value: 'up' },
    });

    expect(res.status).toBe(404);

    const count = await FeedbackModel.countDocuments({ draftId: draft._id });
    expect(count).toBe(0);
  });
});
