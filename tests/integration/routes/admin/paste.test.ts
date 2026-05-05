import MongoStore from 'connect-mongo';
import express from 'express';
import session from 'express-session';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Infra mocks — declared before any import that transitively loads them
// ---------------------------------------------------------------------------
vi.mock('../../../../src/domain/embeddings/cachedEmbedder.js', () => ({
  embedWithCache: vi.fn().mockResolvedValue([new Float32Array([0.1, 0.2, 0.3])]),
}));

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
}));

vi.mock('../../../../src/domain/ingestion/chunker.js', () => ({
  chunk: vi.fn().mockReturnValue([{ text: 'snippet chunk', position: 0 }]),
}));

// Mock Agenda so getJobQueue() doesn't need a real MongoDB URI
vi.mock('../../../../src/jobs/index.js', () => ({
  getJobQueue: vi.fn().mockReturnValue({
    enqueue: vi.fn().mockResolvedValue(undefined),
  }),
}));

import { adminRouter } from '../../../../src/api/routes/admin/index.js';
import { authRouter } from '../../../../src/api/routes/auth.js';
import { errorHandler } from '../../../../src/api/middleware/errorHandler.js';
import { DocumentModel } from '../../../../src/infra/mongo/models/Document.js';
import { SourceModel } from '../../../../src/infra/mongo/models/Source.js';
import { TenantModel } from '../../../../src/infra/mongo/models/Tenant.js';
import { UserModel } from '../../../../src/infra/mongo/models/User.js';
import { runIngestDocument } from '../../../../src/jobs/ingestDocument.js';

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
describe('POST /admin/paste', () => {
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
  });

  // -------------------------------------------------------------------------
  // helpers
  // -------------------------------------------------------------------------
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
  // Tests
  // -------------------------------------------------------------------------
  it('401 when not authenticated', async () => {
    const res = await request(app).post('/admin/paste').send({
      content: 'This is a long enough snippet for the validator.',
    });
    expect(res.status).toBe(401);
  });

  it('400 on missing content', async () => {
    const agent = await loginAgent();
    const res = await agent.post('/admin/paste').send({ title: 'No content' });
    expect(res.status).toBe(400);
  });

  it('400 when content is shorter than 10 chars', async () => {
    const agent = await loginAgent();
    const res = await agent.post('/admin/paste').send({ content: 'short' });
    expect(res.status).toBe(400);
  });

  it('201 — document created with status=processing', async () => {
    const agent = await loginAgent();
    const res = await agent.post('/admin/paste').send({
      title: 'Refund policy',
      content: 'Our refund policy covers 30 days from purchase.',
      visibility: 'internal',
      tags: ['policy'],
    });

    expect(res.status).toBe(201);
    expect(res.body.documentId).toBeDefined();
    expect(res.body.status).toBe('processing');

    const doc = await DocumentModel.findById(res.body.documentId);
    expect(doc).not.toBeNull();
    expect(doc!.status).toBe('processing');
    expect(doc!.sourceType).toBe('paste');
    expect(doc!.visibility).toBe('internal');
    expect(doc!.tags).toContain('policy');
  });

  it('reuses the same paste-default source on repeated calls', async () => {
    const agent = await loginAgent();

    await agent.post('/admin/paste').send({ content: 'First snippet, long enough.' });
    await agent.post('/admin/paste').send({ content: 'Second snippet, also long.' });

    const sources = await SourceModel.find({ type: 'paste', subtype: 'text' });
    expect(sources).toHaveLength(1);

    const docs = await DocumentModel.find({ sourceType: 'paste' });
    expect(docs).toHaveLength(2);
  });

  it('after ingest job runs — status=ready and chunk exists', async () => {
    const agent = await loginAgent();
    const res = await agent.post('/admin/paste').send({
      content: 'Our API supports OAuth 2.0 and API keys for authentication.',
    });

    expect(res.status).toBe(201);
    const { documentId } = res.body;

    // Drive the job inline (infra is mocked above)
    await runIngestDocument(documentId);

    const doc = await DocumentModel.findById(documentId);
    expect(doc!.status).toBe('ready');

    // Verify chunk exists in Mongo (meaning the snippet was indexed)
    const { ChunkModel } = await import('../../../../src/infra/mongo/models/Chunk.js');
    const chunks = await ChunkModel.find({ documentId: new mongoose.Types.ObjectId(documentId) });
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0]!.text).toBe('snippet chunk'); // from mocked chunker
  });
});
