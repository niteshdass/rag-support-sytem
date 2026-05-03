---
name: p1-db-schema
description: Set up Drizzle ORM, db client, full schema (organizations/api_keys/documents/chunks/queries/query_chunks), drizzle.config.ts, and generate first migration. Per CLAUDE.md Phase 1 strict rules.
---

# P1-03 — Database Schema + Drizzle Setup

Sets up `backend/src/db/` with typed client, full schema, pgvector support, and first migration.

## Prerequisites

- P1-02 complete (`env.ts`, `config.ts` exist)
- `drizzle-orm`, `drizzle-kit`, `pg`, `@types/pg` in `backend/package.json`

## 1. `backend/src/config.ts` — add `dbPoolSize`

Add `dbPoolSize: env.DATABASE_POOL_SIZE` to the config object (it's needed by the db client).

```typescript
export const config = {
  dbPoolSize: env.DATABASE_POOL_SIZE,
  // ... rest unchanged
} as const;
```

## 2. `backend/src/db/client.ts`

```typescript
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { env } from '../env.js';
import { config } from '../config.js';
import * as schema from './schema.js';

const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: config.dbPoolSize,
});

export const db = drizzle(pool, { schema });

export type Db = typeof db;
```

## 3. `backend/src/db/schema.ts`

Key decisions:
- `vector(1024)` via `customType` — pgvector column for `chunks.embedding`
- `pgEnum` for `document_status` — avoids magic strings
- Every table has `organization_id` FK → `organizations.id` with `onDelete: 'cascade'`
- All timestamps: `{ withTimezone: true }`
- All FKs cascade on delete

```typescript
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  real,
  jsonb,
  timestamp,
  customType,
} from 'drizzle-orm/pg-core';

const vector = (name: string, dimensions: number) =>
  customType<{ data: number[] }>({
    dataType() {
      return `vector(${dimensions})`;
    },
    toDriver(val: number[]): string {
      return `[${val.join(',')}]`;
    },
    fromDriver(val: unknown): number[] {
      if (typeof val === 'string') {
        return val.slice(1, -1).split(',').map(Number);
      }
      return val as number[];
    },
  })(name, {});

export const documentStatusEnum = pgEnum('document_status', [
  'pending',
  'processing',
  'ready',
  'failed',
]);

export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const apiKeys = pgTable('api_keys', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  keyHash: text('key_hash').notNull(),
  keyPrefix: text('key_prefix').notNull(),
  name: text('name').notNull(),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
});

export const documents = pgTable('documents', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  url: text('url').notNull(),
  title: text('title'),
  status: documentStatusEnum('status').notNull().default('pending'),
  error: text('error'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const chunks = pgTable('chunks', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  documentId: uuid('document_id')
    .notNull()
    .references(() => documents.id, { onDelete: 'cascade' }),
  content: text('content').notNull(),
  embedding: vector('embedding', 1024),
  tokenCount: integer('token_count').notNull(),
  chunkIndex: integer('chunk_index').notNull(),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const queries = pgTable('queries', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  question: text('question').notNull(),
  answer: text('answer'),
  model: text('model').notNull(),
  inputTokens: integer('input_tokens').notNull().default(0),
  outputTokens: integer('output_tokens').notNull().default(0),
  cacheReadTokens: integer('cache_read_tokens').notNull().default(0),
  cacheWriteTokens: integer('cache_write_tokens').notNull().default(0),
  costUsdCents: integer('cost_usd_cents').notNull().default(0),
  latencyMs: integer('latency_ms'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const queryChunks = pgTable('query_chunks', {
  id: uuid('id').primaryKey().defaultRandom(),
  queryId: uuid('query_id')
    .notNull()
    .references(() => queries.id, { onDelete: 'cascade' }),
  chunkId: uuid('chunk_id')
    .notNull()
    .references(() => chunks.id, { onDelete: 'cascade' }),
  rankPosition: integer('rank_position').notNull(),
  score: real('score').notNull(),
});

export type Organization = typeof organizations.$inferSelect;
export type NewOrganization = typeof organizations.$inferInsert;

export type ApiKey = typeof apiKeys.$inferSelect;
export type NewApiKey = typeof apiKeys.$inferInsert;

export type Document = typeof documents.$inferSelect;
export type NewDocument = typeof documents.$inferInsert;
export type DocumentStatus = (typeof documentStatusEnum.enumValues)[number];

export type Chunk = typeof chunks.$inferSelect;
export type NewChunk = typeof chunks.$inferInsert;

export type Query = typeof queries.$inferSelect;
export type NewQuery = typeof queries.$inferInsert;

export type QueryChunk = typeof queryChunks.$inferSelect;
export type NewQueryChunk = typeof queryChunks.$inferInsert;
```

## 4. `backend/drizzle.config.ts`

```typescript
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env['DATABASE_URL'] ?? '',
  },
});
```

## 5. `backend/package.json` — add scripts

```json
"db:generate": "drizzle-kit generate",
"db:migrate": "drizzle-kit migrate",
"db:studio": "drizzle-kit studio"
```

## 6. Generate first migration

```bash
cd backend && DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder" pnpm db:generate
```

Outputs `src/db/migrations/0000_*.sql`.

## 7. Before first `db:migrate` on a fresh Postgres

Run once to enable pgvector:
```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

Or prepend it to the first migration file.

## Rules

- All imports use `.js` extension (NodeNext resolution)
- No `any` — `customType` generic types explicit
- `organization_id` on every table — structural multi-tenancy, not bolted on
- Never hand-edit `src/db/migrations/` — always `pnpm db:generate`
- `drizzle.config.ts` reads `DATABASE_URL` directly from `process.env` (drizzle-kit CLI, not app runtime)
