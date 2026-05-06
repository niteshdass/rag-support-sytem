import MongoStore from 'connect-mongo';
import express from 'express';
import session from 'express-session';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

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
  schedulePeriodicSync: vi.fn().mockResolvedValue(undefined),
  cancelPeriodicSync: vi.fn().mockResolvedValue(undefined),
}));

import { adminRouter } from '../../../../src/api/routes/admin/index.js';
import { authRouter } from '../../../../src/api/routes/auth.js';
import { errorHandler } from '../../../../src/api/middleware/errorHandler.js';
import { TenantModel } from '../../../../src/infra/mongo/models/Tenant.js';
import { UserModel } from '../../../../src/infra/mongo/models/User.js';

// ---------------------------------------------------------------------------
// App factory
// ---------------------------------------------------------------------------
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
// Suite
// ---------------------------------------------------------------------------
describe('Settings /admin/settings', () => {
  let mongod: MongoMemoryServer;
  let app: express.Express;
  const PASSWORD = 'demo1234';

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    const uri = mongod.getUri();
    await mongoose.connect(uri);
    app = buildApp(uri);

    const tenant = await TenantModel.create({
      name: 'Acme',
      slug: 'acme',
      autoResolveEnabled: false,
      confidenceThreshold: 0.85,
    });
    await UserModel.create({
      tenantId: tenant._id,
      email: 'admin@acme.com',
      passwordHash: PASSWORD,
      role: 'admin',
      name: 'Admin',
    });
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongod.stop();
  });

  beforeEach(async () => {
    await TenantModel.updateOne(
      { slug: 'acme' },
      { $set: { autoResolveEnabled: false, confidenceThreshold: 0.85 } },
    );
  });

  async function loginAgent() {
    const agent = request.agent(app);
    await agent.post('/auth/login').send({
      email: 'admin@acme.com',
      password: PASSWORD,
      tenantSlug: 'acme',
    });
    return agent;
  }

  // -------------------------------------------------------------------------
  // Auth
  // -------------------------------------------------------------------------
  it('401 GET when not authenticated', async () => {
    const res = await request(app).get('/admin/settings');
    expect(res.status).toBe(401);
  });

  it('401 PATCH when not authenticated', async () => {
    const res = await request(app)
      .patch('/admin/settings')
      .send({ autoResolveEnabled: true });
    expect(res.status).toBe(401);
  });

  // -------------------------------------------------------------------------
  // GET
  // -------------------------------------------------------------------------
  it('GET returns current settings', async () => {
    const agent = await loginAgent();
    const res = await agent.get('/admin/settings');
    expect(res.status).toBe(200);
    expect(res.body.autoResolveEnabled).toBe(false);
    expect(res.body.confidenceThreshold).toBe(0.85);
  });

  // -------------------------------------------------------------------------
  // PATCH
  // -------------------------------------------------------------------------
  it('400 on empty body', async () => {
    const agent = await loginAgent();
    const res = await agent.patch('/admin/settings').send({});
    expect(res.status).toBe(400);
  });

  it('400 on confidenceThreshold out of range', async () => {
    const agent = await loginAgent();
    const res = await agent.patch('/admin/settings').send({ confidenceThreshold: 1.5 });
    expect(res.status).toBe(400);
  });

  it('PATCH updates autoResolveEnabled', async () => {
    const agent = await loginAgent();
    const res = await agent.patch('/admin/settings').send({ autoResolveEnabled: true });
    expect(res.status).toBe(200);
    expect(res.body.autoResolveEnabled).toBe(true);
    expect(res.body.confidenceThreshold).toBe(0.85);

    const tenant = await TenantModel.findOne({ slug: 'acme' }).lean();
    expect(tenant?.autoResolveEnabled).toBe(true);
  });

  it('PATCH updates confidenceThreshold', async () => {
    const agent = await loginAgent();
    const res = await agent.patch('/admin/settings').send({ confidenceThreshold: 0.99 });
    expect(res.status).toBe(200);
    expect(res.body.confidenceThreshold).toBe(0.99);
    expect(res.body.autoResolveEnabled).toBe(false);
  });

  it('PATCH updates both fields', async () => {
    const agent = await loginAgent();
    const res = await agent
      .patch('/admin/settings')
      .send({ autoResolveEnabled: true, confidenceThreshold: 0.7 });
    expect(res.status).toBe(200);
    expect(res.body.autoResolveEnabled).toBe(true);
    expect(res.body.confidenceThreshold).toBe(0.7);
  });

  // -------------------------------------------------------------------------
  // Behaviour contracts
  // -------------------------------------------------------------------------
  it('threshold 0.99 — GET reflects the high threshold', async () => {
    const agent = await loginAgent();
    await agent.patch('/admin/settings').send({ confidenceThreshold: 0.99 });

    const res = await agent.get('/admin/settings');
    expect(res.status).toBe(200);
    expect(res.body.confidenceThreshold).toBe(0.99);
  });

  it('disabling autoResolveEnabled persists correctly', async () => {
    const agent = await loginAgent();
    await agent.patch('/admin/settings').send({ autoResolveEnabled: true });
    await agent.patch('/admin/settings').send({ autoResolveEnabled: false });

    const res = await agent.get('/admin/settings');
    expect(res.status).toBe(200);
    expect(res.body.autoResolveEnabled).toBe(false);

    const tenant = await TenantModel.findOne({ slug: 'acme' }).lean();
    expect(tenant?.autoResolveEnabled).toBe(false);
  });
});
