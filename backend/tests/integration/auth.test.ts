import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';

vi.mock('../../src/env.js', () => ({
  env: {
    DATABASE_URL:
      process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/rag_test',
    DATABASE_POOL_SIZE: 2,
    REDIS_URL: 'redis://localhost:6379',
    ANTHROPIC_API_KEY: 'test',
    VOYAGE_API_KEY: 'test',
    COHERE_API_KEY: 'test',
    NODE_ENV: 'test',
    LOG_LEVEL: 'error',
    API_PORT: 3001,
    CHUNK_SIZE: 1024,
    CHUNK_OVERLAP: 200,
    RATE_LIMIT_WINDOW_MS: 60000,
    RATE_LIMIT_MAX_REQUESTS: 100,
    INGESTION_RATE_LIMIT_MAX: 5,
    LLM_TIMEOUT_MS: 30000,
    LLM_MAX_RETRIES: 3,
    LLM_TEMPERATURE: 0.7,
    LLM_MODEL: 'claude-sonnet-4-6',
    EMBEDDING_TIMEOUT_MS: 10000,
    EMBEDDING_MAX_RETRIES: 3,
    EMBEDDING_MODEL: 'voyage-3',
    RERANKER_MODEL: 'rerank-3',
    RERANKER_TOP_N: 5,
    SENTRY_DSN: undefined,
    LOG_SINK_URL: undefined,
  },
}));

vi.mock('../../src/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import Fastify from 'fastify';
import { registerErrorHandler } from '../../src/middleware/error.js';
import { adminRoutes } from '../../src/routes/admin.js';
import { authMiddleware } from '../../src/middleware/auth.js';
import { db, pool } from '../../src/db/client.js';
import { organizations, apiKeys } from '../../src/db/schema.js';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';

async function buildTestApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  registerErrorHandler(app);
  await app.register(adminRoutes);

  app.get(
    '/api/test/protected',
    { preHandler: authMiddleware },
    async (request) => ({
      success: true,
      organizationId: request.organizationId,
    }),
  );

  await app.ready();
  return app;
}

describe('auth integration', () => {
  let app: FastifyInstance;
  const createdOrgIds: string[] = [];

  beforeAll(async () => {
    app = await buildTestApp();
  });

  afterAll(async () => {
    for (const orgId of createdOrgIds) {
      await db.delete(apiKeys).where(eq(apiKeys.organizationId, orgId));
      await db.delete(organizations).where(eq(organizations.id, orgId));
    }
    await app.close();
    await pool.end();
  });

  it('creates org and returns api key once', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/orgs',
      payload: { name: 'Test Org' },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json<{ success: boolean; data: { organization: { id: string }; apiKey: string } }>();
    expect(body.success).toBe(true);
    expect(body.data.apiKey).toMatch(/^sk_live_/);
    createdOrgIds.push(body.data.organization.id);
  });

  it('valid key hits protected route — expect 200', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/admin/orgs',
      payload: { name: 'Auth Test Org' },
    });
    const { data } = createRes.json<{ data: { organization: { id: string }; apiKey: string } }>();
    createdOrgIds.push(data.organization.id);

    const res = await app.inject({
      method: 'GET',
      url: '/api/test/protected',
      headers: { authorization: `Bearer ${data.apiKey}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<{ organizationId: string }>();
    expect(body.organizationId).toBe(data.organization.id);
  });

  it('invalid key — expect 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/test/protected',
      headers: { authorization: 'Bearer sk_live_invalid_key_that_does_not_exist' },
    });

    expect(res.statusCode).toBe(401);
    const body = res.json<{ code: string }>();
    expect(body.code).toBe('UNAUTHORIZED');
  });

  it('missing key — expect 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/test/protected',
    });

    expect(res.statusCode).toBe(401);
    const body = res.json<{ code: string }>();
    expect(body.code).toBe('UNAUTHORIZED');
  });

  it('adds key to existing org', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/admin/orgs',
      payload: { name: 'Multi-key Org' },
    });
    const { data } = createRes.json<{ data: { organization: { id: string }; apiKey: string } }>();
    createdOrgIds.push(data.organization.id);

    const addKeyRes = await app.inject({
      method: 'POST',
      url: `/api/admin/orgs/${data.organization.id}/keys`,
      payload: { name: 'second-key' },
    });

    expect(addKeyRes.statusCode).toBe(201);
    const keyBody = addKeyRes.json<{ data: { apiKey: string } }>();
    expect(keyBody.data.apiKey).toMatch(/^sk_live_/);

    const res = await app.inject({
      method: 'GET',
      url: '/api/test/protected',
      headers: { authorization: `Bearer ${keyBody.data.apiKey}` },
    });
    expect(res.statusCode).toBe(200);
  });
});
