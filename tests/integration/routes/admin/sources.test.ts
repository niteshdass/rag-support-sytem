import MongoStore from 'connect-mongo';
import express from 'express';
import session from 'express-session';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Infra mocks
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

const enqueueMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock('../../../../src/jobs/index.js', () => ({
  getJobQueue: vi.fn().mockReturnValue({ enqueue: enqueueMock }),
}));

import { adminRouter } from '../../../../src/api/routes/admin/index.js';
import { authRouter } from '../../../../src/api/routes/auth.js';
import { errorHandler } from '../../../../src/api/middleware/errorHandler.js';
import { DocumentModel } from '../../../../src/infra/mongo/models/Document.js';
import { SourceModel } from '../../../../src/infra/mongo/models/Source.js';
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
describe('Sources CRUD /admin/sources', () => {
  let mongod: MongoMemoryServer;
  let app: express.Express;
  const PASSWORD = 'demo1234';

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    const uri = mongod.getUri();
    await mongoose.connect(uri);
    app = buildApp(uri);

    const tenant = await TenantModel.create({ name: 'Acme', slug: 'acme' });
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
    await DocumentModel.deleteMany({});
    await SourceModel.deleteMany({});
    enqueueMock.mockClear();
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
  // GET /admin/sources
  // -------------------------------------------------------------------------
  it('401 when not authenticated on GET', async () => {
    const res = await request(app).get('/admin/sources');
    expect(res.status).toBe(401);
  });

  it('GET returns empty list initially', async () => {
    const agent = await loginAgent();
    const res = await agent.get('/admin/sources');
    expect(res.status).toBe(200);
    expect(res.body.results).toHaveLength(0);
    expect(res.body.total).toBe(0);
  });

  // -------------------------------------------------------------------------
  // POST /admin/sources
  // -------------------------------------------------------------------------
  it('401 when not authenticated on POST', async () => {
    const res = await request(app).post('/admin/sources').send({
      type: 'connector',
      subtype: 'zendesk',
    });
    expect(res.status).toBe(401);
  });

  it('400 on missing type', async () => {
    const agent = await loginAgent();
    const res = await agent.post('/admin/sources').send({ subtype: 'zendesk' });
    expect(res.status).toBe(400);
  });

  it('400 on unknown subtype', async () => {
    const agent = await loginAgent();
    const res = await agent.post('/admin/sources').send({
      type: 'connector',
      subtype: 'unknown-tool',
    });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain('unknown subtype');
  });

  it('201 — source created', async () => {
    const agent = await loginAgent();
    const res = await agent.post('/admin/sources').send({
      type: 'connector',
      subtype: 'zendesk',
      config: { subdomain: 'acme.zendesk.com' },
    });
    expect(res.status).toBe(201);
    expect(res.body._id).toBeDefined();
    expect(res.body.type).toBe('connector');
    expect(res.body.subtype).toBe('zendesk');
    expect(res.body.status).toBe('active');
  });

  // -------------------------------------------------------------------------
  // CRUD roundtrip
  // -------------------------------------------------------------------------
  it('CRUD roundtrip — create then list', async () => {
    const agent = await loginAgent();

    await agent.post('/admin/sources').send({ type: 'crawl', subtype: 'web', config: { url: 'https://docs.acme.com' } });
    await agent.post('/admin/sources').send({ type: 'connector', subtype: 'notion' });

    const listRes = await agent.get('/admin/sources');
    expect(listRes.status).toBe(200);
    expect(listRes.body.total).toBe(2);
    expect(listRes.body.results.map((s: { type: string }) => s.type).sort()).toEqual(['connector', 'crawl']);
  });

  it('GET filters by type', async () => {
    const agent = await loginAgent();
    await agent.post('/admin/sources').send({ type: 'crawl', subtype: 'web' });
    await agent.post('/admin/sources').send({ type: 'connector', subtype: 'github' });

    const res = await agent.get('/admin/sources?type=crawl');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.results[0].type).toBe('crawl');
  });

  // -------------------------------------------------------------------------
  // DELETE /admin/sources/:id
  // -------------------------------------------------------------------------
  it('404 on delete of non-existent source', async () => {
    const agent = await loginAgent();
    const fakeId = new mongoose.Types.ObjectId().toString();
    const res = await agent.delete(`/admin/sources/${fakeId}`);
    expect(res.status).toBe(404);
  });

  it('404 on delete with invalid ObjectId', async () => {
    const agent = await loginAgent();
    const res = await agent.delete('/admin/sources/not-an-id');
    expect(res.status).toBe(404);
  });

  it('DELETE soft-deletes source (status=disabled)', async () => {
    const agent = await loginAgent();
    const createRes = await agent.post('/admin/sources').send({ type: 'connector', subtype: 'slack' });
    const sourceId = createRes.body._id;

    const delRes = await agent.delete(`/admin/sources/${sourceId}`);
    expect(delRes.status).toBe(200);
    expect(delRes.body.ok).toBe(true);

    const source = await SourceModel.findById(sourceId);
    expect(source!.status).toBe('disabled');
  });

  it('DELETE cascades — purges all related documents', async () => {
    const agent = await loginAgent();
    const createRes = await agent.post('/admin/sources').send({ type: 'connector', subtype: 'notion' });
    const sourceId = createRes.body._id;
    const tenant = await TenantModel.findOne({ slug: 'acme' });

    // Create 2 docs linked to this source
    await DocumentModel.create([
      {
        tenantId: tenant!._id,
        sourceId: new mongoose.Types.ObjectId(sourceId),
        sourceType: 'connector',
        title: 'Doc A',
        content: 'Content A',
        contentHash: 'hash-a',
        visibility: 'customer-facing',
        addedBy: tenant!._id,
        status: 'ready',
      },
      {
        tenantId: tenant!._id,
        sourceId: new mongoose.Types.ObjectId(sourceId),
        sourceType: 'connector',
        title: 'Doc B',
        content: 'Content B',
        contentHash: 'hash-b',
        visibility: 'internal',
        addedBy: tenant!._id,
        status: 'ready',
      },
    ]);

    const delRes = await agent.delete(`/admin/sources/${sourceId}`);
    expect(delRes.status).toBe(200);
    expect(delRes.body.purged).toBe(2);

    const docs = await DocumentModel.find({ sourceId: new mongoose.Types.ObjectId(sourceId) });
    expect(docs.every(d => d.status === 'purged')).toBe(true);
  });

  it('DELETE skips already-purged docs', async () => {
    const agent = await loginAgent();
    const createRes = await agent.post('/admin/sources').send({ type: 'connector', subtype: 'github' });
    const sourceId = createRes.body._id;
    const tenant = await TenantModel.findOne({ slug: 'acme' });

    await DocumentModel.create({
      tenantId: tenant!._id,
      sourceId: new mongoose.Types.ObjectId(sourceId),
      sourceType: 'connector',
      title: 'Already gone',
      content: 'Content',
      contentHash: 'hash-gone',
      visibility: 'draft',
      addedBy: tenant!._id,
      status: 'purged',
    });

    const delRes = await agent.delete(`/admin/sources/${sourceId}`);
    expect(delRes.status).toBe(200);
    expect(delRes.body.purged).toBe(0);
  });

  // -------------------------------------------------------------------------
  // POST /admin/sources/:id/sync
  // -------------------------------------------------------------------------
  it('404 on sync of non-existent source', async () => {
    const agent = await loginAgent();
    const fakeId = new mongoose.Types.ObjectId().toString();
    const res = await agent.post(`/admin/sources/${fakeId}/sync`);
    expect(res.status).toBe(404);
  });

  it('POST /:id/sync enqueues sync-source job', async () => {
    const agent = await loginAgent();
    const createRes = await agent.post('/admin/sources').send({ type: 'connector', subtype: 'intercom' });
    const sourceId = createRes.body._id;

    const res = await agent.post(`/admin/sources/${sourceId}/sync`);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(enqueueMock).toHaveBeenCalledWith('sync-source', expect.objectContaining({ sourceId }));
  });
});
