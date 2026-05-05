import MongoStore from 'connect-mongo';
import express from 'express';
import session from 'express-session';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the pipeline factory before any imports that resolve it
vi.mock('../../../src/domain/rag/pipeline.factory.js', () => ({
  getPipeline: vi.fn(),
  setPipeline: vi.fn(),
}));

// Mock the LLM factory so env.ts doesn't need OLLAMA_URL to be reachable
vi.mock('../../../src/infra/llm/factory.js', () => ({
  getLLMClient: vi.fn(),
}));

import { getPipeline } from '../../../src/domain/rag/pipeline.factory.js';
import { authRouter } from '../../../src/api/routes/auth.js';
import { queryRouter } from '../../../src/api/routes/query.js';
import { TenantModel } from '../../../src/infra/mongo/models/Tenant.js';
import { UserModel } from '../../../src/infra/mongo/models/User.js';
import type { TenantContext, PipelineAnswer } from '../../../src/domain/rag/pipeline.js';

const FIXED_ANSWER: PipelineAnswer = {
  text: 'Here is the answer. [1]',
  citations: [{ chunkId: 'c1', documentId: 'd1', snippet: 'snippet', score: 0.9 }],
  confidence: 0.88,
  route: 'auto',
  traceId: 'trace-abc',
};

function buildApp(mongoUri: string) {
  const app = express();
  app.use(express.json());
  app.use(
    session({
      secret: 'test-secret-that-is-long-enough-for-query-tests',
      resave: false,
      saveUninitialized: false,
      store: MongoStore.create({ mongoUrl: mongoUri }),
      cookie: { httpOnly: true },
    }),
  );
  app.use('/auth', authRouter);
  app.use('/query', queryRouter);
  return app;
}

describe('POST /query', () => {
  let mongod: MongoMemoryServer;
  let app: express.Express;
  const PASSWORD = 'securePass456';

  let tenant1Id: string;
  let tenant2Id: string;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    const uri = mongod.getUri();
    await mongoose.connect(uri);
    app = buildApp(uri);

    const t1 = await TenantModel.create({
      name: 'Acme',
      slug: 'acme',
      confidenceThreshold: 0.75,
    });
    tenant1Id = t1._id.toString();

    const t2 = await TenantModel.create({
      name: 'ByteStore',
      slug: 'bytestore',
      confidenceThreshold: 0.80,
    });
    tenant2Id = t2._id.toString();

    await UserModel.create({
      tenantId: t1._id,
      email: 'agent@acme.com',
      passwordHash: PASSWORD,
      role: 'agent',
      name: 'Acme Agent',
    });

    await UserModel.create({
      tenantId: t2._id,
      email: 'agent@bytestore.com',
      passwordHash: PASSWORD,
      role: 'agent',
      name: 'ByteStore Agent',
    });
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongod.stop();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getPipeline).mockReturnValue({
      answer: vi.fn().mockResolvedValue(FIXED_ANSWER),
    } as unknown as ReturnType<typeof getPipeline>);
  });

  async function loginAs(email: string, slug: string): Promise<string[]> {
    const res = await request(app).post('/auth/login').send({
      email,
      password: PASSWORD,
      tenantSlug: slug,
    });
    expect(res.status).toBe(200);
    return res.headers['set-cookie'] as string[];
  }

  describe('auth enforcement', () => {
    it('401 when not authenticated', async () => {
      const res = await request(app)
        .post('/query')
        .send({ query: 'hello', audience: 'agent' });
      expect(res.status).toBe(401);
    });
  });

  describe('validation', () => {
    it('400 on missing query', async () => {
      const cookies = await loginAs('agent@acme.com', 'acme');
      const res = await request(app)
        .post('/query')
        .set('Cookie', cookies)
        .send({ audience: 'agent' });
      expect(res.status).toBe(400);
    });

    it('400 on invalid audience', async () => {
      const cookies = await loginAs('agent@acme.com', 'acme');
      const res = await request(app)
        .post('/query')
        .set('Cookie', cookies)
        .send({ query: 'hello', audience: 'superuser' });
      expect(res.status).toBe(400);
    });

    it('400 on empty query string', async () => {
      const cookies = await loginAs('agent@acme.com', 'acme');
      const res = await request(app)
        .post('/query')
        .set('Cookie', cookies)
        .send({ query: '', audience: 'agent' });
      expect(res.status).toBe(400);
    });
  });

  describe('audience mapping', () => {
    it('agent audience maps to internal-agent in pipeline ctx', async () => {
      const cookies = await loginAs('agent@acme.com', 'acme');
      const mockAnswer = vi.fn().mockResolvedValue(FIXED_ANSWER);
      vi.mocked(getPipeline).mockReturnValue({ answer: mockAnswer } as unknown as ReturnType<typeof getPipeline>);

      await request(app)
        .post('/query')
        .set('Cookie', cookies)
        .send({ query: 'how do I reset my password?', audience: 'agent' })
        .expect(200);

      const ctx: TenantContext = mockAnswer.mock.calls[0][1];
      expect(ctx.audience).toBe('internal-agent');
    });

    it('end-user audience maps to end-user in pipeline ctx', async () => {
      const cookies = await loginAs('agent@acme.com', 'acme');
      const mockAnswer = vi.fn().mockResolvedValue(FIXED_ANSWER);
      vi.mocked(getPipeline).mockReturnValue({ answer: mockAnswer } as unknown as ReturnType<typeof getPipeline>);

      await request(app)
        .post('/query')
        .set('Cookie', cookies)
        .send({ query: 'how do I reset my password?', audience: 'end-user' })
        .expect(200);

      const ctx: TenantContext = mockAnswer.mock.calls[0][1];
      expect(ctx.audience).toBe('end-user');
    });
  });

  describe('tenant isolation', () => {
    it('ctx.tenantId is always the session tenant, never another tenant', async () => {
      const cookies = await loginAs('agent@acme.com', 'acme');
      const mockAnswer = vi.fn().mockResolvedValue(FIXED_ANSWER);
      vi.mocked(getPipeline).mockReturnValue({ answer: mockAnswer } as unknown as ReturnType<typeof getPipeline>);

      await request(app)
        .post('/query')
        .set('Cookie', cookies)
        .send({ query: 'billing question', audience: 'agent' })
        .expect(200);

      const ctx: TenantContext = mockAnswer.mock.calls[0][1];
      expect(ctx.tenantId).toBe(tenant1Id);
      expect(ctx.tenantId).not.toBe(tenant2Id);
    });

    it('bytestore session uses bytestore tenantId', async () => {
      const cookies = await loginAs('agent@bytestore.com', 'bytestore');
      const mockAnswer = vi.fn().mockResolvedValue(FIXED_ANSWER);
      vi.mocked(getPipeline).mockReturnValue({ answer: mockAnswer } as unknown as ReturnType<typeof getPipeline>);

      await request(app)
        .post('/query')
        .set('Cookie', cookies)
        .send({ query: 'shipping policy', audience: 'end-user' })
        .expect(200);

      const ctx: TenantContext = mockAnswer.mock.calls[0][1];
      expect(ctx.tenantId).toBe(tenant2Id);
      expect(ctx.tenantId).not.toBe(tenant1Id);
    });

    it('confidenceThreshold comes from the session tenant', async () => {
      const cookies = await loginAs('agent@acme.com', 'acme');
      const mockAnswer = vi.fn().mockResolvedValue(FIXED_ANSWER);
      vi.mocked(getPipeline).mockReturnValue({ answer: mockAnswer } as unknown as ReturnType<typeof getPipeline>);

      await request(app)
        .post('/query')
        .set('Cookie', cookies)
        .send({ query: 'export data', audience: 'agent' })
        .expect(200);

      const ctx: TenantContext = mockAnswer.mock.calls[0][1];
      expect(ctx.confidenceThreshold).toBe(0.75);
    });
  });

  describe('response shape', () => {
    it('returns text, citations, confidence, route, traceId', async () => {
      const cookies = await loginAs('agent@acme.com', 'acme');

      const res = await request(app)
        .post('/query')
        .set('Cookie', cookies)
        .send({ query: 'how do I export?', audience: 'end-user' })
        .expect(200);

      expect(res.body).toMatchObject({
        text: FIXED_ANSWER.text,
        citations: FIXED_ANSWER.citations,
        confidence: FIXED_ANSWER.confidence,
        route: FIXED_ANSWER.route,
        traceId: FIXED_ANSWER.traceId,
      });
    });

    it('forwards optional history to pipeline ctx', async () => {
      const cookies = await loginAs('agent@acme.com', 'acme');
      const mockAnswer = vi.fn().mockResolvedValue(FIXED_ANSWER);
      vi.mocked(getPipeline).mockReturnValue({ answer: mockAnswer } as unknown as ReturnType<typeof getPipeline>);

      const history = ['User: earlier question', 'Agent: earlier answer'];
      await request(app)
        .post('/query')
        .set('Cookie', cookies)
        .send({ query: 'follow-up question', audience: 'agent', history })
        .expect(200);

      const ctx: TenantContext = mockAnswer.mock.calls[0][1];
      expect(ctx.recentMessages).toEqual(history);
    });
  });
});
