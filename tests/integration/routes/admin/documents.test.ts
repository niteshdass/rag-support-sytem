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
vi.mock('../../../../src/infra/meilisearch/client.js', () => ({
  ensureIndex: vi.fn().mockResolvedValue(undefined),
  addDocs: vi.fn().mockResolvedValue(undefined),
  deleteDocs: vi.fn().mockResolvedValue(undefined),
  search: vi.fn(),
}));

vi.mock('../../../../src/infra/qdrant/client.js', () => ({
  ensureCollection: vi.fn().mockResolvedValue(undefined),
  upsertPoints: vi.fn().mockResolvedValue(undefined),
  deletePoints: vi.fn().mockResolvedValue(undefined),
  deleteByFilter: vi.fn().mockResolvedValue(undefined),
}));

const mockStorageDelete = vi.fn().mockResolvedValue(undefined);
vi.mock('../../../../src/infra/storage/index.js', () => ({
  getStorage: () => ({ delete: mockStorageDelete }),
}));

import { adminRouter } from '../../../../src/api/routes/admin/index.js';
import { authRouter } from '../../../../src/api/routes/auth.js';
import { errorHandler } from '../../../../src/api/middleware/errorHandler.js';
import { AuditLogModel } from '../../../../src/infra/mongo/models/AuditLog.js';
import { ChunkModel } from '../../../../src/infra/mongo/models/Chunk.js';
import { DocumentModel } from '../../../../src/infra/mongo/models/Document.js';
import { ResponseCacheModel } from '../../../../src/infra/mongo/models/ResponseCache.js';
import { TenantModel } from '../../../../src/infra/mongo/models/Tenant.js';
import { UserModel } from '../../../../src/infra/mongo/models/User.js';
import * as meiliClient from '../../../../src/infra/meilisearch/client.js';
import * as qdrantClient from '../../../../src/infra/qdrant/client.js';

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
describe('GET /admin/documents', () => {
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

    const tenantA = await TenantModel.create({ name: 'Acme', slug: 'acme' });
    tenantAId = tenantA._id.toString();

    const tenantB = await TenantModel.create({ name: 'Other', slug: 'other' });
    tenantBId = tenantB._id.toString();

    await UserModel.create({
      tenantId: tenantA._id,
      email: 'admin@acme.com',
      passwordHash: PASSWORD,
      role: 'admin',
      name: 'Admin',
    });

    await UserModel.create({
      tenantId: tenantB._id,
      email: 'admin@other.com',
      passwordHash: PASSWORD,
      role: 'admin',
      name: 'Other Admin',
    });
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongod.stop();
  });

  beforeEach(async () => {
    await DocumentModel.deleteMany({ tenantId: new mongoose.Types.ObjectId(tenantAId) });
    await DocumentModel.deleteMany({ tenantId: new mongoose.Types.ObjectId(tenantBId) });
    await ChunkModel.deleteMany({});
    vi.clearAllMocks();
  });

  async function loginAs(email: string) {
    const agent = request.agent(app);
    await agent.post('/auth/login').send({ email, password: PASSWORD, tenantSlug: email.includes('other') ? 'other' : 'acme' });
    return agent;
  }

  function makeDoc(overrides: Record<string, unknown> = {}) {
    return {
      tenantId: new mongoose.Types.ObjectId(tenantAId),
      sourceId: new mongoose.Types.ObjectId(),
      sourceType: 'paste',
      title: 'Test doc',
      content: 'Some content here.',
      contentHash: 'hash-' + Math.random(),
      visibility: 'customer-facing',
      addedBy: new mongoose.Types.ObjectId(),
      status: 'ready',
      ...overrides,
    };
  }

  // -------------------------------------------------------------------------
  // Auth guard
  // -------------------------------------------------------------------------
  it('401 when not authenticated', async () => {
    const res = await request(app).get('/admin/documents');
    expect(res.status).toBe(401);
  });

  // -------------------------------------------------------------------------
  // List + filter by visibility
  // -------------------------------------------------------------------------
  it('returns all docs when no filter', async () => {
    await DocumentModel.create([
      makeDoc({ visibility: 'customer-facing' }),
      makeDoc({ visibility: 'internal' }),
      makeDoc({ visibility: 'draft' }),
    ]);

    const agent = await loginAs('admin@acme.com');
    const res = await agent.get('/admin/documents');
    expect(res.status).toBe(200);
    expect(res.body.results).toHaveLength(3);
    expect(res.body.total).toBe(3);
  });

  it('filters by visibility=internal', async () => {
    await DocumentModel.create([
      makeDoc({ visibility: 'customer-facing' }),
      makeDoc({ visibility: 'internal' }),
      makeDoc({ visibility: 'internal' }),
    ]);

    const agent = await loginAs('admin@acme.com');
    const res = await agent.get('/admin/documents?visibility=internal');
    expect(res.status).toBe(200);
    expect(res.body.results).toHaveLength(2);
    expect(res.body.results.every((d: { visibility: string }) => d.visibility === 'internal')).toBe(true);
  });

  it('filters by status', async () => {
    await DocumentModel.create([
      makeDoc({ status: 'ready' }),
      makeDoc({ status: 'failed' }),
      makeDoc({ status: 'processing' }),
    ]);

    const agent = await loginAs('admin@acme.com');
    const res = await agent.get('/admin/documents?status=failed');
    expect(res.status).toBe(200);
    expect(res.body.results).toHaveLength(1);
    expect(res.body.results[0].status).toBe('failed');
  });

  it('paginates correctly', async () => {
    await DocumentModel.create([
      makeDoc(),
      makeDoc(),
      makeDoc(),
    ]);

    const agent = await loginAs('admin@acme.com');
    const res = await agent.get('/admin/documents?page=1&pageSize=2');
    expect(res.status).toBe(200);
    expect(res.body.results).toHaveLength(2);
    expect(res.body.total).toBe(3);
    expect(res.body.page).toBe(1);
    expect(res.body.pageSize).toBe(2);
  });

  it('list result omits content field', async () => {
    await DocumentModel.create(makeDoc({ content: 'very long content here' }));
    const agent = await loginAs('admin@acme.com');
    const res = await agent.get('/admin/documents');
    expect(res.status).toBe(200);
    expect(res.body.results[0].content).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // Search via Meilisearch
  // -------------------------------------------------------------------------
  it('uses meilisearch when q is provided', async () => {
    const doc = await DocumentModel.create(makeDoc({ title: 'Refund policy' }));
    const docId = doc._id.toString();

    vi.mocked(meiliClient.search).mockResolvedValueOnce([
      { id: 'chunk-1', text: 'refund', documentId: docId, visibility: 'customer-facing' },
    ]);

    const agent = await loginAs('admin@acme.com');
    const res = await agent.get('/admin/documents?q=refund');
    expect(res.status).toBe(200);
    expect(meiliClient.search).toHaveBeenCalledOnce();
    expect(res.body.results).toHaveLength(1);
    expect(res.body.results[0]._id).toBe(docId);
  });

  it('search deduplicates docs when multiple chunks match', async () => {
    const doc = await DocumentModel.create(makeDoc({ title: 'API docs' }));
    const docId = doc._id.toString();

    vi.mocked(meiliClient.search).mockResolvedValueOnce([
      { id: 'chunk-1', text: 'api', documentId: docId, visibility: 'customer-facing' },
      { id: 'chunk-2', text: 'api key', documentId: docId, visibility: 'customer-facing' },
    ]);

    const agent = await loginAs('admin@acme.com');
    const res = await agent.get('/admin/documents?q=api');
    expect(res.status).toBe(200);
    expect(res.body.results).toHaveLength(1);
  });

  // -------------------------------------------------------------------------
  // GET /:id
  // -------------------------------------------------------------------------
  it('returns full document with content', async () => {
    const doc = await DocumentModel.create(makeDoc({ content: 'Hello world.' }));
    const agent = await loginAs('admin@acme.com');
    const res = await agent.get(`/admin/documents/${doc._id}`);
    expect(res.status).toBe(200);
    expect(res.body.content).toBe('Hello world.');
    expect(res.body.contentTruncated).toBeUndefined();
  });

  it('truncates content longer than 5000 chars', async () => {
    const longContent = 'x'.repeat(6000);
    const doc = await DocumentModel.create(makeDoc({ content: longContent }));
    const agent = await loginAs('admin@acme.com');
    const res = await agent.get(`/admin/documents/${doc._id}`);
    expect(res.status).toBe(200);
    expect(res.body.content).toHaveLength(5000);
    expect(res.body.contentTruncated).toBe(true);
  });

  it('404 for unknown id', async () => {
    const agent = await loginAs('admin@acme.com');
    const fakeId = new mongoose.Types.ObjectId().toString();
    const res = await agent.get(`/admin/documents/${fakeId}`);
    expect(res.status).toBe(404);
  });

  it('404 for invalid id format', async () => {
    const agent = await loginAs('admin@acme.com');
    const res = await agent.get('/admin/documents/not-an-id');
    expect(res.status).toBe(404);
  });

  // -------------------------------------------------------------------------
  // Cross-tenant access blocked
  // -------------------------------------------------------------------------
  it('cross-tenant /:id returns 404', async () => {
    const doc = await DocumentModel.create({
      ...makeDoc(),
      tenantId: new mongoose.Types.ObjectId(tenantBId),
    });

    const agent = await loginAs('admin@acme.com');
    const res = await agent.get(`/admin/documents/${doc._id}`);
    expect(res.status).toBe(404);
  });

  it('cross-tenant /:id/chunks returns 404', async () => {
    const doc = await DocumentModel.create({
      ...makeDoc(),
      tenantId: new mongoose.Types.ObjectId(tenantBId),
    });

    const agent = await loginAs('admin@acme.com');
    const res = await agent.get(`/admin/documents/${doc._id}/chunks`);
    expect(res.status).toBe(404);
  });

  // -------------------------------------------------------------------------
  // GET /:id/chunks
  // -------------------------------------------------------------------------
  it('returns chunks for a document ordered by position', async () => {
    const doc = await DocumentModel.create(makeDoc());
    const docOid = doc._id;

    await ChunkModel.create([
      { tenantId: new mongoose.Types.ObjectId(tenantAId), documentId: docOid, text: 'second', position: 1, visibility: 'customer-facing' },
      { tenantId: new mongoose.Types.ObjectId(tenantAId), documentId: docOid, text: 'first', position: 0, visibility: 'customer-facing' },
    ]);

    const agent = await loginAs('admin@acme.com');
    const res = await agent.get(`/admin/documents/${doc._id}/chunks`);
    expect(res.status).toBe(200);
    expect(res.body.chunks).toHaveLength(2);
    expect(res.body.chunks[0].position).toBe(0);
    expect(res.body.chunks[1].position).toBe(1);
    expect(res.body.total).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// DELETE /admin/documents/:id — purge / forget flow
// ---------------------------------------------------------------------------
describe('DELETE /admin/documents/:id', () => {
  let mongod: MongoMemoryServer;
  let app: express.Express;
  const PASSWORD = 'demo1234';

  let tenantAId: string;
  let tenantBId: string;
  let adminUserId: string;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    const uri = mongod.getUri();
    await mongoose.connect(uri);
    app = buildApp(uri);

    const tenantA = await TenantModel.create({ name: 'PurgeA', slug: 'purge-a' });
    tenantAId = tenantA._id.toString();

    const tenantB = await TenantModel.create({ name: 'PurgeB', slug: 'purge-b' });
    tenantBId = tenantB._id.toString();

    const adminUser = await UserModel.create({
      tenantId: tenantA._id,
      email: 'admin@purge-a.com',
      passwordHash: PASSWORD,
      role: 'admin',
      name: 'Admin',
    });
    adminUserId = adminUser._id.toString();

    await UserModel.create({
      tenantId: tenantB._id,
      email: 'admin@purge-b.com',
      passwordHash: PASSWORD,
      role: 'admin',
      name: 'Other Admin',
    });
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongod.stop();
  });

  beforeEach(async () => {
    await DocumentModel.deleteMany({});
    await ChunkModel.deleteMany({});
    await AuditLogModel.deleteMany({});
    await ResponseCacheModel.deleteMany({});
    vi.clearAllMocks();
  });

  async function loginAs(email: string) {
    const agent = request.agent(app);
    const slug = email.includes('purge-b') ? 'purge-b' : 'purge-a';
    await agent.post('/auth/login').send({ email, password: PASSWORD, tenantSlug: slug });
    return agent;
  }

  function makeDoc(overrides: Record<string, unknown> = {}) {
    return {
      tenantId: new mongoose.Types.ObjectId(tenantAId),
      sourceId: new mongoose.Types.ObjectId(),
      sourceType: 'paste',
      title: 'Test doc',
      content: 'Some content here.',
      contentHash: 'hash-' + Math.random(),
      visibility: 'customer-facing',
      addedBy: new mongoose.Types.ObjectId(adminUserId),
      status: 'ready',
      ...overrides,
    };
  }

  it('401 when not authenticated', async () => {
    const doc = await DocumentModel.create(makeDoc());
    const res = await request(app).delete(`/admin/documents/${doc._id}`);
    expect(res.status).toBe(401);
  });

  it('404 for invalid id format', async () => {
    const agent = await loginAs('admin@purge-a.com');
    const res = await agent.delete('/admin/documents/not-an-id');
    expect(res.status).toBe(404);
  });

  it('404 for unknown document', async () => {
    const agent = await loginAs('admin@purge-a.com');
    const fakeId = new mongoose.Types.ObjectId().toString();
    const res = await agent.delete(`/admin/documents/${fakeId}`);
    expect(res.status).toBe(404);
  });

  it('cross-tenant purge returns 404', async () => {
    const doc = await DocumentModel.create({
      ...makeDoc(),
      tenantId: new mongoose.Types.ObjectId(tenantBId),
    });
    const agent = await loginAs('admin@purge-a.com');
    const res = await agent.delete(`/admin/documents/${doc._id}`);
    expect(res.status).toBe(404);
  });

  it('purges doc: qdrant filter called, meili ids deleted, chunks removed, status=purged', async () => {
    const doc = await DocumentModel.create(makeDoc());
    const docId = doc._id.toString();

    await ChunkModel.create([
      { tenantId: new mongoose.Types.ObjectId(tenantAId), documentId: doc._id, text: 'chunk one', position: 0, visibility: 'customer-facing', qdrantPointId: 'uuid-1' },
      { tenantId: new mongoose.Types.ObjectId(tenantAId), documentId: doc._id, text: 'chunk two', position: 1, visibility: 'customer-facing', qdrantPointId: 'uuid-2' },
    ]);

    const chunksBefore = await ChunkModel.find({ documentId: doc._id });
    const chunkIds = chunksBefore.map(c => c._id.toString());

    const agent = await loginAs('admin@purge-a.com');
    const res = await agent.delete(`/admin/documents/${docId}`);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    // qdrant deleteByFilter called with correct payload
    expect(qdrantClient.deleteByFilter).toHaveBeenCalledWith('chunks', {
      must: [
        { key: 'tenantId', match: { value: tenantAId } },
        { key: 'documentId', match: { value: docId } },
      ],
    });

    // meilisearch deleteDocs called with chunk mongo IDs
    expect(meiliClient.deleteDocs).toHaveBeenCalledWith(tenantAId, expect.arrayContaining(chunkIds));

    // chunks removed from mongo
    const chunksAfter = await ChunkModel.find({ documentId: doc._id });
    expect(chunksAfter).toHaveLength(0);

    // doc status is purged (not hard-deleted)
    const updated = await DocumentModel.findById(doc._id);
    expect(updated).not.toBeNull();
    expect(updated!.status).toBe('purged');
  });

  it('creates audit log entry', async () => {
    const doc = await DocumentModel.create(makeDoc());
    const agent = await loginAs('admin@purge-a.com');
    await agent.delete(`/admin/documents/${doc._id}`);

    const log = await AuditLogModel.findOne({ target: doc._id.toString() });
    expect(log).not.toBeNull();
    expect(log!.action).toBe('purge_document');
    expect(log!.tenantId.toString()).toBe(tenantAId);
    expect(log!.actor.toString()).toBe(adminUserId);
  });

  it('deletes file from storage when fileKey present', async () => {
    const doc = await DocumentModel.create(makeDoc({ fileKey: 'uploads/some-file.pdf' }));
    const agent = await loginAs('admin@purge-a.com');
    await agent.delete(`/admin/documents/${doc._id}`);

    expect(mockStorageDelete).toHaveBeenCalledWith(tenantAId, 'uploads/some-file.pdf');
  });

  it('invalidates response cache entries citing the document', async () => {
    const doc = await DocumentModel.create(makeDoc());
    const docId = doc._id.toString();

    await ResponseCacheModel.create({
      tenantId: new mongoose.Types.ObjectId(tenantAId),
      queryHash: 'hash-abc',
      response: { text: 'cached answer' },
      citations: [{ documentId: docId }],
      expiresAt: new Date(Date.now() + 86400_000),
    });

    const agent = await loginAs('admin@purge-a.com');
    await agent.delete(`/admin/documents/${docId}`);

    const remaining = await ResponseCacheModel.findOne({ 'citations.documentId': docId });
    expect(remaining).toBeNull();
  });

  it('re-purging an already-purged doc is a no-op (200, no second audit log)', async () => {
    const doc = await DocumentModel.create(makeDoc({ status: 'purged' }));
    const agent = await loginAs('admin@purge-a.com');

    const res = await agent.delete(`/admin/documents/${doc._id}`);
    expect(res.status).toBe(200);

    // no audit log created for a no-op
    const logs = await AuditLogModel.find({ target: doc._id.toString() });
    expect(logs).toHaveLength(0);
  });
});
