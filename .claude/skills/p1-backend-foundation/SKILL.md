---
name: p1-backend-foundation
description: Implement backend/src/env.ts (Zod env validation), logger.ts (Pino), and config.ts (typed config object). Per CLAUDE.md Phase 1 strict rules — no any, explicit return types, fail-fast on boot.
---

# P1-02 — Backend Env + Logger + Config

Implement three foundation files in `backend/src/`. These must exist before any other backend code.

## 1. `backend/src/env.ts`

- Use `zod` with `safeParse` — on failure write to `process.stderr` and `process.exit(1)`
- Export typed `env` object and `Env` type
- No `process.env` access anywhere else in the codebase
- **Critical:** empty string in `.env` file (`KEY=`) is `""` not `undefined` — use preprocessors for optional fields

```typescript
import { z } from 'zod';

const optionalUrl = z.preprocess(
  (val) => (val === '' ? undefined : val),
  z.string().url().optional()
);

const optionalStr = z.preprocess(
  (val) => (val === '' ? undefined : val),
  z.string().optional()
);

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  DATABASE_POOL_SIZE: z.coerce.number().int().positive().default(20),
  REDIS_URL: z.string().url(),
  ANTHROPIC_API_KEY: z.string().min(1),
  VOYAGE_API_KEY: z.string().min(1),
  COHERE_API_KEY: z.string().min(1),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  API_PORT: z.coerce.number().int().positive().default(3000),
  CHUNK_SIZE: z.coerce.number().int().positive().default(1024),
  CHUNK_OVERLAP: z.coerce.number().int().nonnegative().default(200),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(100),
  INGESTION_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(5),
  LLM_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
  LLM_MAX_RETRIES: z.coerce.number().int().nonnegative().default(3),
  LLM_TEMPERATURE: z.coerce.number().min(0).max(2).default(0.7),
  LLM_MODEL: z.string().default('claude-sonnet-4-6'),
  EMBEDDING_TIMEOUT_MS: z.coerce.number().int().positive().default(10000),
  EMBEDDING_MAX_RETRIES: z.coerce.number().int().nonnegative().default(3),
  EMBEDDING_MODEL: z.string().default('voyage-3'),
  RERANKER_MODEL: z.string().default('rerank-3'),
  RERANKER_TOP_N: z.coerce.number().int().positive().default(5),
  SENTRY_DSN: optionalStr,
  LOG_SINK_URL: optionalUrl,
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
  process.stderr.write('Invalid environment variables:\n');
  process.stderr.write(JSON.stringify(result.error.errors, null, 2) + '\n');
  process.exit(1);
}

export const env = result.data;

export type Env = typeof env;
```

## 2. `backend/src/logger.ts`

```typescript
import pino from 'pino';
import { env } from './env.js';

export const logger = pino({
  level: env.LOG_LEVEL,
  transport:
    env.NODE_ENV === 'development'
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
});
```

## 3. `backend/src/config.ts`

```typescript
import { env } from './env.js';

export const config = {
  chunkSize: env.CHUNK_SIZE,
  chunkOverlap: env.CHUNK_OVERLAP,
  rateLimitWindowMs: env.RATE_LIMIT_WINDOW_MS,
  rateLimitMax: env.RATE_LIMIT_MAX_REQUESTS,
  ingestionRateLimitMax: env.INGESTION_RATE_LIMIT_MAX,
  llmTimeoutMs: env.LLM_TIMEOUT_MS,
  llmMaxRetries: env.LLM_MAX_RETRIES,
  llmTemperature: env.LLM_TEMPERATURE,
  llmModel: env.LLM_MODEL,
  embeddingTimeoutMs: env.EMBEDDING_TIMEOUT_MS,
  embeddingMaxRetries: env.EMBEDDING_MAX_RETRIES,
  embeddingModel: env.EMBEDDING_MODEL,
  rerankerModel: env.RERANKER_MODEL,
  rerankerTopN: env.RERANKER_TOP_N,
} as const;

export type Config = typeof config;
```

## 4. `backend/src/index.ts` — wire it all together

**`import 'dotenv/config'` must be the very first import** — tsx watch does not auto-load `.env`, dotenv must run before env.ts parses `process.env`.

```typescript
import 'dotenv/config';
import './env.js';
import Fastify from 'fastify';
import { logger } from './logger.js';
import { env } from './env.js';

const app = Fastify({ logger });

app.get('/health', async () => ({
  status: 'ok',
  timestamp: new Date().toISOString(),
}));

const start = async (): Promise<void> => {
  await app.listen({ port: env.API_PORT, host: '0.0.0.0' });
};

start().catch((err: unknown) => {
  logger.error(err);
  process.exit(1);
});
```

## 5. Create `backend/.env` from `.env.example`

```bash
cp backend/.env.example backend/.env
```

Fill in placeholder API keys — they just need to be non-empty strings for local dev:
```
ANTHROPIC_API_KEY=sk-ant-placeholder
VOYAGE_API_KEY=pa-placeholder
COHERE_API_KEY=placeholder
```

Leave `SENTRY_DSN=` and `LOG_SINK_URL=` empty — the preprocessors convert `""` → `undefined`.

## Rules
- All imports use `.js` extension (NodeNext module resolution)
- Explicit return types on every function
- No `any`, no `// @ts-ignore`
- No `console.log` — use `logger`
- `env` is single source of truth — `config` reads from it, nothing touches `process.env` directly
- `dotenv/config` import always first in entry point
