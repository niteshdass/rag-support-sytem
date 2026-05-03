---
name: p1-backend-foundation
description: Implement backend/src/env.ts (Zod env validation), logger.ts (Pino), and config.ts (typed config object). Per CLAUDE.md Phase 1 strict rules — no any, explicit return types, fail-fast on boot.
---

# P1-02 — Backend Env + Logger + Config

Implement three foundation files in `backend/src/`. These must exist before any other backend code.

## 1. `backend/src/env.ts`

- Use `zod` to define a schema for ALL env vars in CLAUDE.md backend `.env.example`
- Parse with `z.object({...}).parse(process.env)` at module load time
- On failure: print `z.ZodError.errors` to stderr and `process.exit(1)` — fail fast
- Export a single `env` object typed from the schema
- No `process.env` access anywhere else in the codebase

Required vars to validate:
```
DATABASE_URL         z.string().url()
DATABASE_POOL_SIZE   z.coerce.number().int().positive().default(20)
REDIS_URL            z.string().url()
ANTHROPIC_API_KEY    z.string().min(1)
VOYAGE_API_KEY       z.string().min(1)
COHERE_API_KEY       z.string().min(1)
NODE_ENV             z.enum(['development', 'test', 'production']).default('development')
LOG_LEVEL            z.enum(['fatal','error','warn','info','debug','trace']).default('info')
API_PORT             z.coerce.number().int().positive().default(3000)
CHUNK_SIZE           z.coerce.number().int().positive().default(1024)
CHUNK_OVERLAP        z.coerce.number().int().nonnegative().default(200)
RATE_LIMIT_WINDOW_MS z.coerce.number().int().positive().default(60000)
RATE_LIMIT_MAX_REQUESTS z.coerce.number().int().positive().default(100)
INGESTION_RATE_LIMIT_MAX z.coerce.number().int().positive().default(5)
LLM_TIMEOUT_MS       z.coerce.number().int().positive().default(30000)
LLM_MAX_RETRIES      z.coerce.number().int().nonnegative().default(3)
LLM_TEMPERATURE      z.coerce.number().min(0).max(2).default(0.7)
LLM_MODEL            z.string().default('claude-sonnet-4-6')
EMBEDDING_TIMEOUT_MS z.coerce.number().int().positive().default(10000)
EMBEDDING_MAX_RETRIES z.coerce.number().int().nonnegative().default(3)
EMBEDDING_MODEL      z.string().default('voyage-3')
RERANKER_MODEL       z.string().default('rerank-3')
RERANKER_TOP_N       z.coerce.number().int().positive().default(5)
SENTRY_DSN           z.string().optional()
LOG_SINK_URL         z.string().url().optional()
```

## 2. `backend/src/logger.ts`

- Import `env` from `./env.ts`
- Use `pino` — pretty-print in development (`pino-pretty` transport), JSON in production
- Export single `logger` instance with level from `env.LOG_LEVEL`
- No `console.log` anywhere in backend — use this logger

```typescript
import pino from 'pino';
import { env } from './env.js';

export const logger = pino({
  level: env.LOG_LEVEL,
  transport: env.NODE_ENV === 'development'
    ? { target: 'pino-pretty', options: { colorize: true } }
    : undefined,
});
```

## 3. `backend/src/config.ts`

- Import `env` from `./env.ts`
- Export single `config` object — all values from `env`, never from `process.env`
- Explicit type annotation on the export

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
```

## 4. Wire into `backend/src/index.ts`

Add at top of index.ts (before Fastify init) so env validation runs on boot:
```typescript
import './env.js'; // fail fast if env invalid
import { logger } from './logger.js';
```

Pass logger to Fastify:
```typescript
const app = Fastify({ logger });
```

## Rules
- All imports use `.js` extension (NodeNext module resolution)
- Explicit return types on every function
- No `any`, no `// @ts-ignore`
- No `console.log` — use `logger`
- `env` is the single source of truth — `config` reads from it, nothing else reads `process.env`
