# prompts.md

> A sequenced list of micro-task prompts for building SupportPilot with Claude Code.
> Run them in order. Each prompt = one Claude Code session.
> Commit after every successful prompt. Restart the session for the next one.

---

## How to use this file

1. **Open a fresh Claude Code session** for each prompt.
2. **Paste the prompt verbatim.** Don't combine prompts.
3. **Wait for the plan.** Every prompt asks Claude Code to propose before coding. Read the plan, push back if it's wrong, then say "go ahead."
4. **Review the diff.** Run the acceptance check. Run the tests.
5. **Commit.** Use the suggested commit message at the end of each prompt.
6. **Move on.** Don't let one session do two prompts.

If a session goes off the rails (40+ messages, code getting weirder), `git reset --hard` and restart. Sunk cost is the enemy.

---

## The standard preamble

Every prompt starts with this — it's already baked in. The point: force Claude Code to load CLAUDE.md and plan before writing.

```
Read /CLAUDE.md fully before doing anything. We are working on a single
micro-task. Constraints from CLAUDE.md are non-negotiable (multi-tenancy,
visibility filtering, no console.log, no Docker, no Redis, MongoDB only,
all domain logic pure, Zod for all external inputs).

Before writing any code:
1. Summarize the task in your own words.
2. List the files you will create or change.
3. List the tests you will write.
4. Flag anything ambiguous and ask me.

Wait for me to say "go ahead" before writing code.
```

---

# Phase 0 — Foundation

## Prompt 1 — Repo scaffold

**Goal:** Empty repo → working `npm run dev` with `/health`.

**Prompt:**
```
[Standard preamble]

Task: Scaffold the SupportPilot repo.

Create:
- package.json with scripts: dev, build, start, lint, format, test, seed
- tsconfig.json (strict mode, ESM, target ES2022)
- .eslintrc + .prettierrc + .editorconfig
- .gitignore (node_modules, dist, .env, data/)
- .nvmrc with "20"
- src/index.ts — Express bootstrap on PORT, single GET /health route
- src/config/env.ts — Zod-validated env with PORT, NODE_ENV, MONGODB_URI
- README.md — one paragraph + how to run

Use:
- express, typescript, tsx (for dev), zod, pino, pino-pretty
- vitest, @types/node, @types/express
- eslint, prettier

Acceptance:
- `npm install` succeeds
- `npm run dev` starts the server
- curl http://localhost:3000/health returns { ok: true }
- `npm run lint` and `npm run test` exit 0 (no tests yet but command must work)

Commit message: "chore: initial repo scaffold"
```

---

## Prompt 2 — Pino logger

**Goal:** Structured logging everywhere. No console.log allowed from here on.

**Prompt:**
```
[Standard preamble]

Task: Set up the Pino logger.

Create:
- src/observability/logger.ts — exports a configured pino instance
  - pretty in dev, JSON in prod
  - base fields: app="supportpilot", env=NODE_ENV
  - redacts: req.headers.authorization, "*.password", "*.apiKey"
- Wire it into src/index.ts to log "server started" on boot

Add an ESLint rule that errors on console.log/info/warn/error usage in src/.

Acceptance:
- Booting the app logs structured JSON in prod, pretty in dev
- ESLint flags any console.log
- Test: import the logger in a vitest, assert it's a function with `info`, `error`, `warn`

Commit: "feat(obs): pino logger + console.log lint rule"
```

---

## Prompt 3 — MongoDB connection

**Goal:** Reliable Mongo connection with retries and graceful shutdown.

**Prompt:**
```
[Standard preamble]

Task: Add MongoDB connection.

Create:
- src/infra/mongo/client.ts — connect(), disconnect()
  - Uses MONGODB_URI from env
  - Logs connect/disconnect/error events via pino
  - Retries connect 5x with backoff
- Wire connect() into src/index.ts (await before app.listen)
- Wire disconnect() into SIGINT/SIGTERM handlers

Use mongoose. Do NOT define any models yet.

Acceptance:
- Server fails to start if Mongo is down (after retries)
- SIGINT logs "shutting down" and disconnects cleanly
- Test with mongodb-memory-server: connect, then disconnect, no errors

Commit: "feat(infra): mongo connection with retry + graceful shutdown"
```

---

## Prompt 4 — Vitest + mongodb-memory-server setup

**Goal:** Tests can run against a real Mongo without a real Mongo.

**Prompt:**
```
[Standard preamble]

Task: Configure Vitest with mongodb-memory-server.

Create:
- vitest.config.ts
- tests/setup.ts — starts an in-memory Mongo before all tests, stops after,
  exposes the URI via process.env.MONGODB_URI
- tests/unit/sample.test.ts — one passing test that connects to Mongo via our
  src/infra/mongo/client.ts and disconnects, asserting no errors

Acceptance:
- `npm run test` runs the sample test against an in-memory Mongo and passes
- No real Mongo needed
- Test file < 30 lines

Commit: "test: vitest + mongodb-memory-server setup"
```

---

## Prompt 5 — Tenant model

**Goal:** First Mongoose model with strict typing.

**Prompt:**
```
[Standard preamble]

Task: Add the Tenant Mongoose model.

Create:
- src/infra/mongo/models/Tenant.ts
  - Fields exactly per CLAUDE.md Section 7: name, plan, settings, apiKeys[],
    autoResolveEnabled (default false), confidenceThreshold (default 0.85)
  - Add createdAt/updatedAt (timestamps: true)
  - Index on name (unique)
- Zod schema in same file, derive TS type via z.infer
- Export both the model and the Zod schema

Tests (tests/unit/models/Tenant.test.ts):
- Create + find roundtrip
- Reject duplicate name
- Defaults applied correctly

Acceptance: tests pass.

Commit: "feat(model): Tenant"
```

---

## Prompt 6 — User model

**Goal:** Users with hashed passwords, scoped to a tenant.

**Prompt:**
```
[Standard preamble]

Task: Add the User Mongoose model.

Create:
- src/infra/mongo/models/User.ts
  - Fields: tenantId (ObjectId, required, indexed), email, passwordHash,
    role ("admin" | "agent"), name
  - Compound unique index: (tenantId, email)
  - Pre-save hook: if password is modified, hash with bcryptjs (12 rounds)
  - Method: comparePassword(plain) -> Promise<boolean>
- Zod schema for create/update payloads (NEVER includes passwordHash, only password)

Add bcryptjs dependency.

Tests:
- Create user → passwordHash is set, NOT equal to plain password
- comparePassword works for correct + wrong passwords
- Same email allowed across tenants, blocked within a tenant

Commit: "feat(model): User with bcrypt"
```

---

## Prompt 7 — Tenant scoping plugin

**Goal:** A Mongoose plugin so we can never accidentally query across tenants.

**Prompt:**
```
[Standard preamble]

Task: Add a Mongoose plugin that enforces tenantId on all queries.

Create:
- src/infra/mongo/plugins/tenantScope.ts
  - Plugin adds tenantId as required to every schema it's applied to
  - Adds a static method `forTenant(tenantId)` returning a query helper
    that auto-injects tenantId on find/findOne/update/delete
  - Does NOT modify the global mongoose query API; opt-in per model

Apply it to User (NOT Tenant — Tenant has no tenantId itself).

Tests:
- User.forTenant(t1).find() returns only t1's users even if t2's users exist
- User.forTenant(t1).findOne({ email }) ignores t2's matching email
- Direct User.find() without tenantId works (we keep raw access for admin tooling)
  but logs a warning via pino

Commit: "feat(infra): tenantScope mongoose plugin"
```

---

## Prompt 8 — Tenant middleware

**Goal:** Every authenticated request carries `req.tenantId` and `req.user`.

**Prompt:**
```
[Standard preamble]

Task: Add Express middleware for tenant + user context.

Create:
- src/api/middleware/tenant.ts
  - Reads session cookie (we'll add real auth in prompt 10; for now stub it
    to read X-Tenant-Id and X-User-Id headers IF NODE_ENV !== "production")
  - Loads tenant + user from Mongo
  - Attaches to req.tenantId, req.user
  - 401 if missing, 404 if not found, 403 if user.tenantId !== tenant._id

Tests with supertest:
- No headers → 401
- Bad tenantId → 404
- User from different tenant → 403
- Valid → 200 and req values are populated (use a downstream debug route)

Commit: "feat(api): tenant + user middleware (header-based stub)"
```

---

## Prompt 9 — Error handler middleware

**Goal:** Consistent error responses, never leak internals.

**Prompt:**
```
[Standard preamble]

Task: Add the global error handler.

Create:
- src/api/middleware/errorHandler.ts
  - Catches errors from all routes
  - Maps known error classes (ValidationError, NotFoundError, ForbiddenError)
    to proper HTTP codes
  - In dev: includes stack. In prod: only message + errorCode
  - Always logs via pino with req.id, tenantId
- src/utils/errors.ts — define the error classes
- Wire it last in src/index.ts

Tests:
- Throwing each error type returns the expected status + shape
- In prod env, no stack trace in body
- Error log includes tenantId when middleware ran

Commit: "feat(api): error handler + typed error classes"
```

---

## Prompt 10 — Auth: login + session

**Goal:** Real cookie-based sessions. Replace the header stub from prompt 8.

**Prompt:**
```
[Standard preamble]

Task: Add real auth — POST /auth/login, POST /auth/logout, GET /auth/me.

Use express-session with connect-mongo as the store. Sessions in MongoDB.

Create:
- src/api/routes/auth.ts
  - POST /auth/login: { email, password, tenantSlug } → sets session cookie,
    returns user (no passwordHash)
  - POST /auth/logout: destroys session
  - GET /auth/me: returns current user + tenant
- Update src/api/middleware/tenant.ts to read from req.session instead of headers
- Add SESSION_SECRET to env.ts (Zod required, min 32 chars)

Tests:
- Bad credentials → 401
- Good credentials → 200, Set-Cookie present, /auth/me works
- /auth/me without cookie → 401
- Logout invalidates the session

Commit: "feat(auth): session-based login with mongo store"
```

---

## Prompt 11 — Seeder skeleton

**Goal:** `npm run seed` creates 1 demo tenant + admin. Idempotent. Safe.

**Prompt:**
```
[Standard preamble]

Task: Build the seeder CLI skeleton per CLAUDE.md Section 12.

Create:
- scripts/seed/index.ts — CLI entrypoint, supports flags: --reset, --tenant <id>
- scripts/seed/safety.ts — refuses to run if MONGODB_URI doesn't include
  "dev", "test", or "local". Throws on prod-like URIs.
- scripts/seed/tenants.ts — upserts 3 tenants per CLAUDE.md (acme-saas,
  bytestore, internal)
- scripts/seed/users.ts — upserts admin + 3 agents per tenant, password "demo1234"
- Add npm script: "seed", "seed:reset", "seed:tenant"

Idempotent: run twice → same final state.
Deterministic: faker.seed(42).
Logs progress via pino.

Tests:
- Running seed twice on a memory-server DB results in correct counts
- Safety guard throws on a fake "production" URI
- Admin can be authenticated with the seeded password

Commit: "feat(seed): tenants + users + safety guard"
```

---

## Prompt 12 — PM2 ecosystem config

**Goal:** Native local dev setup, no Docker.

**Prompt:**
```
[Standard preamble]

Task: Add PM2 ecosystem config + .env.example.

Create:
- ecosystem.config.js — apps: api (tsx watch src/index.ts)
  Add commented-out blocks for: worker, web, qdrant binary, meilisearch binary
  (we'll uncomment them as those features land)
- .env.example — every env var our Zod schema currently requires, with
  safe placeholder values
- docs/local-setup.md — copy of CLAUDE.md Section 13, slightly expanded

Acceptance:
- pm2 start ecosystem.config.js boots the api
- pm2 logs api shows our pino output
- A new contributor can follow docs/local-setup.md from zero to running

Commit: "chore: pm2 ecosystem + .env.example + setup docs"
```

---

# Phase 1 — Knowledge management MVP

## Prompt 13 — File storage interface

**Goal:** Pluggable storage. Local FS for dev.

**Prompt:**
```
[Standard preamble]

Task: Build the FileStorage abstraction.

Create:
- src/infra/storage/index.ts — interface FileStorage with methods:
    put(tenantId, key, buffer, mimeType): Promise<{ fileKey: string }>
    get(tenantId, fileKey): Promise<{ buffer, mimeType }>
    delete(tenantId, fileKey): Promise<void>
    exists(tenantId, fileKey): Promise<boolean>
- src/infra/storage/localFs.ts — LocalFsStorage implementing the interface,
  rooted at ./data/uploads/<tenantId>/
- src/infra/storage/index.ts — factory: getStorage() returns LocalFs based on
  STORAGE_DRIVER env var (default "local")

Critical: every method takes tenantId. Reject any fileKey containing ".." or
absolute paths. Tenant isolation enforced at this layer.

Tests:
- put/get/delete roundtrip
- get with wrong tenantId throws (cross-tenant access blocked)
- Path traversal attempts blocked

Commit: "feat(storage): FileStorage interface + local FS impl"
```

---

## Prompt 14 — Source model

**Prompt:**
```
[Standard preamble]

Task: Add the Source Mongoose model + Zod schemas.

Create src/infra/mongo/models/Source.ts per CLAUDE.md Section 7:
- Fields: tenantId, type ("connector"|"upload"|"paste"|"crawl"),
  subtype (string, e.g. "zendesk", "notion", "pdf-upload"),
  config (mixed), lastSyncedAt, status ("active"|"syncing"|"error"|"disabled"),
  addedBy (userId)
- Apply tenantScope plugin
- Index on (tenantId, type), (tenantId, status)

Tests:
- Create roundtrip
- forTenant() respects scoping

Commit: "feat(model): Source"
```

---

## Prompt 15 — Document model

**Prompt:**
```
[Standard preamble]

Task: Add the Document Mongoose model.

Create src/infra/mongo/models/Document.ts per CLAUDE.md Section 7:
- All listed fields
- visibility default = "draft"
- status default = "processing"
- Indexes: (tenantId, sourceId, externalId) unique sparse,
  (tenantId, visibility), contentHash
- Apply tenantScope

Tests: roundtrip, indexes, defaults.

Commit: "feat(model): Document"
```

---

## Prompt 16 — Chunk model

**Prompt:**
```
[Standard preamble]

Task: Add the Chunk model.

Create src/infra/mongo/models/Chunk.ts:
- Fields: tenantId, documentId, text, position (int), qdrantPointId,
  visibility (mirrors document for fast filter)
- Indexes: (tenantId, documentId, position), qdrantPointId, (tenantId, visibility)
- Apply tenantScope

Tests: roundtrip, position uniqueness within (tenantId, documentId).

Commit: "feat(model): Chunk"
```

---

## Prompt 17 — Chunker

**Goal:** Pure function. Recursive splitter that respects sentence + paragraph boundaries.

**Prompt:**
```
[Standard preamble]

Task: Implement the chunker as a pure domain function.

Create:
- src/domain/ingestion/chunker.ts
  - Function: chunk(text, opts) → { text, position }[]
  - Default opts: targetTokens=400, overlapTokens=50, maxTokens=600
  - Uses a tiktoken-like approximation (cl100k via gpt-tokenizer) for length
  - Splits recursively: ## headings → paragraphs → sentences
  - Never splits inside a fenced code block
  - Returns positions starting at 0

Pure function — no I/O, no deps on Mongo or anything in src/infra.

Tests:
- Short text → single chunk
- Long markdown with headings → respects heading boundaries
- Code blocks never split
- Overlap between consecutive chunks
- Position values are sequential

Commit: "feat(rag): chunker"
```

---

## Prompt 18 — Embeddings client + Mongo cache

**Prompt:**
```
[Standard preamble]

Task: Embeddings via @xenova/transformers, with MongoDB cache.

Create:
- src/infra/embeddings/transformers.ts
  - embed(texts: string[]) → Float32Array[]
  - Uses Xenova/bge-small-en-v1.5
  - Lazy-loads the model on first call, caches in memory
  - Batch size 16, processes in parallel batches
- src/infra/mongo/models/EmbeddingCache.ts — { contentHash, model, vector,
  expiresAt }, TTL index on expiresAt (30 days)
- src/domain/embeddings/cachedEmbedder.ts — wraps transformers.ts
  - Hashes each text (sha256 of text + model name)
  - Checks cache, returns hits immediately
  - Embeds misses, stores in cache, returns combined result

Tests:
- Same text twice → second call has zero model invocations (mock the underlying)
- Different model name → cache miss
- TTL field set correctly

Commit: "feat(rag): embeddings client + mongo cache"
```

---

## Prompt 19 — Qdrant client

**Prompt:**
```
[Standard preamble]

Task: Wrap the Qdrant Node client.

Create:
- src/infra/qdrant/client.ts with methods:
    ensureCollection(name, vectorSize)
    upsertPoints(collection, points: { id, vector, payload }[])
    search(collection, vector, { tenantId, visibility[], limit, filter? })
    deletePoints(collection, ids)
    deleteByFilter(collection, filter)
- ALL search calls require tenantId AND visibility — TypeScript types enforce this
- Single collection: "chunks" (we use payload filtering for tenant isolation)

Add @qdrant/js-client-rest dependency.

Tests against a Qdrant instance (skip if QDRANT_URL not set, document this in
docs/local-setup.md):
- ensureCollection is idempotent
- upsert + search roundtrip with tenant filter
- Search with mismatched tenant returns nothing

Commit: "feat(infra): qdrant client with mandatory tenant+visibility filters"
```

---

## Prompt 20 — Meilisearch client

**Prompt:**
```
[Standard preamble]

Task: Wrap Meilisearch with one index per tenant.

Create src/infra/meilisearch/client.ts:
- ensureIndex(tenantId) — index name = `docs_${tenantId}`
  - Sets searchable attributes, filterable attributes (visibility, documentId)
- addDocs(tenantId, docs: { id, text, documentId, visibility }[])
- search(tenantId, query, { visibility[], limit })
- deleteDocs(tenantId, ids)
- dropIndex(tenantId)

Add meilisearch dependency.

Tests (skip if MEILI_URL not set):
- Add + search roundtrip
- visibility filter excludes wrong-visibility docs
- dropIndex actually removes

Commit: "feat(infra): meilisearch client (one index per tenant)"
```

---

## Prompt 21 — Markdown parser

**Prompt:**
```
[Standard preamble]

Task: Parser for markdown / plain text.

Create:
- src/domain/ingestion/parsers/types.ts — interface Parser:
    parse(buffer: Buffer, mimeType: string): Promise<ParsedDocument>
    supports(mimeType: string): boolean
  type ParsedDocument = { title?: string, content: string, metadata?: object }
- src/domain/ingestion/parsers/markdown.ts — handles text/markdown, text/plain
  - Extracts title from first H1 if present
  - Returns content as-is

Tests:
- supports() returns true for the right MIME types
- parse() extracts title from markdown
- parse() handles plain text without title

Commit: "feat(ingest): markdown + plain text parser"
```

---

## Prompt 22 — PDF parser

**Prompt:**
```
[Standard preamble]

Task: PDF parser using pdf-parse.

Create src/domain/ingestion/parsers/pdf.ts implementing Parser:
- supports("application/pdf")
- Uses pdf-parse to extract text
- Title from PDF metadata if present, else from first non-empty line
- metadata.pageCount included

Tests using a small fixture PDF in scripts/seed/fixtures/pdfs/sample.pdf:
- Extracts text
- Captures page count
- Handles encrypted PDF gracefully (throws typed error)

Commit: "feat(ingest): pdf parser"
```

---

## Prompt 23 — DOCX + HTML + spreadsheet parsers

**Prompt:**
```
[Standard preamble]

Task: Three more parsers.

Create:
- src/domain/ingestion/parsers/docx.ts — uses mammoth, extracts text + title
- src/domain/ingestion/parsers/html.ts — uses cheerio + turndown,
  strips scripts/styles, converts to markdown
- src/domain/ingestion/parsers/spreadsheet.ts — uses xlsx, converts each sheet
  to markdown table, joins them

Add a registry: src/domain/ingestion/parsers/index.ts — getParser(mimeType)
returns the right parser or throws UnsupportedMimeTypeError.

Tests for each parser with small fixtures.

Commit: "feat(ingest): docx, html, spreadsheet parsers + registry"
```

---

## Prompt 24 — Document service (add)

**Goal:** The single function used by upload + paste + connectors to ingest a doc.

**Prompt:**
```
[Standard preamble]

Task: Build documentService.add() — the canonical ingestion entrypoint.

Create src/domain/knowledge/documentService.ts with:
- async add(input: {
    tenantId, sourceId, sourceType, title?, url?, content, fileKey?,
    fileMimeType?, externalId?, visibility, addedBy, tags?
  }) → Document

Behavior:
- Computes contentHash (sha256 of content)
- If a doc with same (tenantId, sourceId, externalId) exists → update
- Else insert with status="processing"
- Enqueues an Agenda job "ingest-document" with documentId
- Returns the doc (status="processing")

Pure as possible; takes Mongo + jobQueue dependencies via constructor injection.

Tests:
- Insert path
- Upsert path (same external id → updates content)
- Job is enqueued

Commit: "feat(knowledge): documentService.add"
```

---

## Prompt 25 — Ingestion job

**Goal:** The Agenda job that turns a document into searchable chunks.

**Prompt:**
```
[Standard preamble]

Task: Wire up Agenda + define the ingest-document job.

Create:
- src/jobs/index.ts — Agenda instance, connects to Mongo, defines all jobs,
  starts the worker. Exposes `getJobQueue()` for the API to enqueue.
- src/jobs/ingestDocument.ts — handler for "ingest-document"
  - Loads doc by id
  - Runs chunker on content
  - Embeds all chunks (cached embedder)
  - Upserts vectors in Qdrant with payload { tenantId, documentId, chunkId,
    visibility }
  - Adds chunks to Meilisearch tenant index
  - Saves Chunk rows in Mongo
  - Marks doc status="ready"
  - On error: status="failed", processingError set

Add a separate worker entrypoint: src/worker.ts that boots Agenda only.

Tests:
- End-to-end: insert a doc, run job synchronously, verify chunks + vectors +
  Meilisearch entries exist with correct tenant/visibility
- Failure path: bad parser → status=failed

Commit: "feat(jobs): agenda + ingest-document job"
```

---

## Prompt 26 — Paste-text endpoint

**Prompt:**
```
[Standard preamble]

Task: POST /admin/paste — accept a text snippet and ingest it.

Create:
- src/api/validators/paste.ts — Zod: { title?, content (required, min 10),
  visibility, tags? }
- src/api/routes/admin/paste.ts — POST /admin/paste
  - Auth + tenant middleware required
  - Creates a Source row (type="paste", subtype="text") if one doesn't exist
    for this tenant ("paste-default")
  - Calls documentService.add() with sourceType="paste"
  - Returns { documentId, status }

Wire into the router under /admin.

Integration tests:
- Unauthenticated → 401
- Paste a snippet → 201, doc exists with status="processing"
- After running the job → status="ready" and a query for the snippet hits it

Commit: "feat(api): paste-text ingestion endpoint"
```

---

## Prompt 27 — Upload endpoint

**Prompt:**
```
[Standard preamble]

Task: POST /admin/uploads — multipart file upload.

Use multer with memory storage (50 MB limit).

Create:
- src/api/routes/admin/uploads.ts — POST /admin/uploads
  - field "file" required
  - Body fields: visibility (required), tags? (CSV)
  - Auth + tenant middleware
  - Validates MIME type against parser registry
  - Stores file via FileStorage.put()
  - Calls documentService.add() with fileKey + fileMimeType,
    content="" (job will parse + fill it)
  - Returns { documentId, status }

Update the ingest-document job: if doc has fileKey but empty content, fetch
file from storage, run parser, fill content, then proceed normally.

Tests:
- Upload a sample PDF → 201, doc ingested, retrievable
- Upload an unsupported type → 415
- Upload >50MB → 413
- Cross-tenant: storage path includes tenantId

Commit: "feat(api): file upload endpoint with parsing"
```

---

## Prompt 28 — Document list + search endpoint

**Prompt:**
```
[Standard preamble]

Task: GET /admin/documents — list and search docs in the tenant.

Create src/api/routes/admin/documents.ts:
- GET /admin/documents
  - Query params: q (search text), visibility, sourceId, status, page, pageSize
  - If q present → uses Meilisearch tenant index, returns enriched results
  - If no q → Mongo find with filters, paginated, sorted by createdAt desc
- GET /admin/documents/:id → full document including content (truncated to 5000 chars)
- GET /admin/documents/:id/chunks → chunks for the doc

All scoped via tenantScope.

Tests:
- List + filter by visibility
- Search hits the right docs
- Cross-tenant access blocked (404)

Commit: "feat(api): document list + search + detail"
```

---

## Prompt 29 — Purge service (the "forget" flow)

**Prompt:**
```
[Standard preamble]

Task: The forget flow. Removing a doc must clean ALL traces.

Create src/domain/knowledge/purgeService.ts:
- async purge(tenantId, documentId, actorId)
  Steps (in order):
  1. Mark doc status="purging" (so retriever skips it immediately)
  2. Delete Qdrant points by filter { tenantId, documentId }
  3. Delete Meilisearch docs by documentId
  4. Delete Chunk rows
  5. Invalidate response cache entries that cited this doc (drop entries with
     citation.documentId in the cached value)
  6. If doc has fileKey → FileStorage.delete()
  7. Mark doc status="purged" (do NOT hard-delete; we keep the row for audit)
  8. Write AuditLog entry { action: "purge_document", actor, target: docId }

Add DELETE /admin/documents/:id endpoint that calls purgeService.

Tests:
- Purge a doc → vectors gone, search empty, file gone, status=purged
- Audit log entry exists
- Re-purging a purged doc is a no-op

Commit: "feat(knowledge): purge / forget flow"
```

---

## Prompt 30 — Visibility toggle endpoint

**Prompt:**
```
[Standard preamble]

Task: PATCH /admin/documents/:id/visibility — change visibility.

Create:
- src/api/routes/admin/visibility.ts — PATCH /admin/documents/:id/visibility
  Body: { visibility: "customer-facing" | "internal" | "draft" }
- Updates the Document row
- Updates all Chunk rows (visibility duplicated for fast filter)
- Updates Qdrant payloads via setPayload
- Updates Meilisearch docs

This MUST be atomic-ish: if any step fails, log loudly and try to rollback the
Document row. Use a "visibility-update" Agenda job for the heavy parts.

Tests:
- Change visibility → reflected in chunks + Qdrant + Meilisearch
- A query with the old visibility filter no longer returns the doc

Commit: "feat(api): visibility toggle with index propagation"
```

---

## Prompt 31 — AuditLog model + middleware

**Prompt:**
```
[Standard preamble]

Task: Append-only audit log.

Create:
- src/infra/mongo/models/AuditLog.ts — { tenantId, actor, action, target,
  before, after, ip, userAgent, createdAt }
- src/api/middleware/audit.ts — helper logAudit(req, action, target, before?, after?)
- Use it in: purge, visibility change, source delete, doc upload

Add GET /admin/audit (admin role only) — list with filters + pagination.

Tests:
- Each tracked action writes an entry
- Audit log is read-only via API (no PUT/PATCH/DELETE)

Commit: "feat(audit): AuditLog model + helper + admin route"
```

---

## Prompt 32 — Sources CRUD endpoints

**Prompt:**
```
[Standard preamble]

Task: Endpoints to manage Source rows.

Create src/api/routes/admin/sources.ts:
- GET /admin/sources — list
- POST /admin/sources — create (type, subtype, config). Validates subtype is known.
- DELETE /admin/sources/:id — soft-delete + enqueue purge of all related docs
- POST /admin/sources/:id/sync — enqueues a "sync-source" job (placeholder for now)

Tests:
- CRUD roundtrip
- Delete cascades (all docs from that source go through purge flow)

Commit: "feat(api): sources CRUD"
```

---

## Prompt 33 — Update seeder with documents

**Prompt:**
```
[Standard preamble]

Task: Expand the seeder to include sample knowledge.

Create:
- scripts/seed/fixtures/help-articles/ — 10 markdown files of realistic SaaS
  help content (account setup, billing, exporting data, API keys, integrations,
  refunds, security, SSO, password reset, mobile app). Each file 200–500 words,
  realistic, NOT lorem ipsum. Add front-matter with title.
- scripts/seed/fixtures/pdfs/ — at least 2 small sample PDFs (security
  whitepaper, pricing). Generate them with a tiny script using docx-pdf or
  similar, OR commit pre-made small fixtures.
- scripts/seed/documents.ts — for the "acme-saas" tenant:
  - Creates one "paste" Source and one "upload" Source
  - For each markdown fixture: calls documentService.add() with content,
    visibility="customer-facing"
  - For each PDF fixture: stores via FileStorage, calls add() with fileKey
  - Adds 2 internal-only docs (escalation playbook, refund policy) as paste
  - Awaits all ingest jobs to complete before returning

Update scripts/seed/index.ts to call documents.ts.

Acceptance:
- npm run seed:reset finishes < 90s
- After seed: acme-saas has ~12+ docs, all status="ready", queryable

Commit: "feat(seed): help articles + PDF fixtures + ingestion"
```

---

# Phase 1.5 — Admin dashboard UI

## Prompt 34 — React app scaffold

**Prompt:**
```
[Standard preamble]

Task: Create the admin dashboard SPA at /web.

Use Vite + React + TypeScript + Tailwind + shadcn/ui + TanStack Query +
react-router-dom v6.

Create:
- web/package.json with scripts dev, build, preview
- web/vite.config.ts — proxies /api → http://localhost:3000
- web/src/main.tsx, App.tsx (router shell), pages/Login.tsx (placeholder),
  pages/Dashboard.tsx (placeholder)
- Tailwind + shadcn config
- web/.env.example with VITE_API_URL

Add to root package.json: "dev:web": "cd web && npm run dev"

Acceptance:
- cd web && npm install && npm run dev → app loads at :5173
- Calls to /api/health proxy correctly

Commit: "feat(web): SPA scaffold with vite + tailwind + shadcn"
```

---

## Prompt 35 — API client + auth flow in web

**Prompt:**
```
[Standard preamble]

Task: Typed API client + login page.

Create:
- web/src/api/client.ts — fetch wrapper with credentials: "include",
  throws typed errors, handles 401 by redirecting to /login
- web/src/api/auth.ts — login(), logout(), me() functions
- web/src/hooks/useAuth.ts — TanStack Query around me() with proper invalidation
- web/src/pages/Login.tsx — form: email, password, tenant slug. On success,
  navigates to /
- web/src/components/ProtectedRoute.tsx — wraps routes, redirects to /login if
  not authed

Wire / and /documents to require auth.

Acceptance:
- Login with admin@acme-saas.com / demo1234 works
- Refresh keeps session
- Logout returns to /login

Commit: "feat(web): api client + login flow"
```

---

## Prompt 36 — App shell + navigation

**Prompt:**
```
[Standard preamble]

Task: Build the app shell with sidebar nav.

Create:
- web/src/components/AppShell.tsx — sidebar with links (Documents, Upload,
  Sources, Activity, Settings), top bar with user menu (logout)
- web/src/components/UserMenu.tsx
- Use shadcn primitives, plain and clean styling

All authed pages render inside AppShell.

Acceptance:
- Sidebar shows on every protected route
- Active link highlighted
- Logout works from the user menu

Commit: "feat(web): app shell + nav"
```

---

## Prompt 37 — Documents page

**Prompt:**
```
[Standard preamble]

Task: web/src/pages/Documents.tsx — browse, search, filter, delete.

Features:
- Search input (debounced) → calls GET /admin/documents?q=
- Filters: visibility (chip-select), source (dropdown), status
- Table: title, source type, visibility (badge), status, createdAt, actions
- Row action: View, Change visibility, Delete (confirm modal → calls DELETE)
- Pagination (page size 20)

Components:
- DocumentRow, VisibilityBadge, DeleteConfirmDialog (shadcn AlertDialog)

Use TanStack Query with proper invalidation on delete.

Acceptance:
- Lists seeded docs
- Search "refund" finds the refund article
- Filter by visibility="internal" shows only internal docs
- Delete works and removes the row

Commit: "feat(web): documents page (list + search + delete)"
```

---

## Prompt 38 — Document detail view

**Prompt:**
```
[Standard preamble]

Task: web/src/pages/DocumentDetail.tsx at /documents/:id.

Shows:
- Title, source, dates, visibility, tags, status
- Tabs: "Content" (renders markdown), "Chunks" (list of chunks with positions)
- Buttons: Change visibility, Delete

Use react-markdown for content rendering.

Acceptance:
- Click a row in Documents → opens this page
- Chunks tab shows the actual chunks from GET /admin/documents/:id/chunks
- Visibility toggle calls the PATCH endpoint and refetches

Commit: "feat(web): document detail page"
```

---

## Prompt 39 — Upload page

**Prompt:**
```
[Standard preamble]

Task: web/src/pages/Upload.tsx — drag-and-drop upload.

Use react-dropzone.

UI:
- Drop zone (centered, dashed border, "Drop files here or click to browse")
- Per-file row showing: filename, size, status (uploading/processing/ready/failed)
- Visibility selector (default "draft")
- Tags input (comma-separated)
- After upload: poll GET /admin/documents/:id every 2s until status != processing

Multi-file supported. Max 50 MB each. Reject unsupported MIME types client-side.

Acceptance:
- Drop a PDF → uploads, processes, ends in status=ready
- Drop a 60 MB file → rejected client-side with clear error
- Drop a .exe → rejected as unsupported

Commit: "feat(web): drag-drop upload page with status polling"
```

---

## Prompt 40 — Paste page

**Prompt:**
```
[Standard preamble]

Task: web/src/pages/Paste.tsx — quick add for text snippets.

UI:
- Title input (optional)
- Large textarea
- Visibility selector
- Tags input
- "Add to knowledge" button → POST /admin/paste
- Toast on success, navigates to the new document detail

Acceptance:
- Pastes a snippet, becomes searchable within seconds
- Empty/short content → button disabled with tooltip

Commit: "feat(web): paste-text page"
```

---

## Prompt 41 — Sources page

**Prompt:**
```
[Standard preamble]

Task: web/src/pages/Sources.tsx — manage knowledge sources.

UI:
- Cards for each source (type icon, subtype name, status, last synced)
- "Add source" button → modal with type selector (only "Manual upload" and
  "Pasted text" enabled for now; connectors disabled with "coming soon")
- Per-source: Sync button, Delete button (with cascade-purge warning)

Acceptance:
- Lists seeded sources
- Delete cascades and removes related docs
- Disabled connectors show tooltip

Commit: "feat(web): sources page"
```

---

# Phase 2 — RAG retrieval + first connector

## Prompt 42 — Query rewriter

**Prompt:**
```
[Standard preamble]

Task: Build the query rewriter as a pure-ish domain function.

Create src/domain/rag/queryRewriter.ts:
- rewrite(query, recentMessages?) → { text, intent, mustHaveTerms[] }
- Uses LLM with a strict prompt:
  - Resolves "it"/"this" using recent messages
  - Expands acronyms it can infer
  - Outputs structured JSON
- Falls back to the raw query on parse error

Takes LLMClient as a dependency.

Tests with a mock LLM:
- "what's the latest" + history "we discussed the SSO bug" → text mentions SSO
- Acronym expansion
- JSON parse failure → returns raw query without throwing

Commit: "feat(rag): query rewriter"
```

---

## Prompt 43 — Hybrid retriever

**Prompt:**
```
[Standard preamble]

Task: Build the hybrid retriever with RRF fusion.

Create src/domain/rag/retriever.ts:
- retrieve({ tenantId, query, queryVector, visibility[], limit }) →
  RetrievedChunk[]
  Steps:
  1. Parallel: qdrant.search(...) and meilisearch.search(...) — top 30 each
  2. Reciprocal Rank Fusion with k=60
  3. Hydrate text from Mongo Chunk rows
  4. Return up to limit items

Visibility filter is REQUIRED. Throws if not provided.

Tests:
- Returns hits from either or both backends
- RRF: a doc that ranks high in both is ranked first
- Visibility filter excludes wrong-visibility docs

Commit: "feat(rag): hybrid retriever with RRF"
```

---

## Prompt 44 — Reranker

**Prompt:**
```
[Standard preamble]

Task: Cross-encoder reranker via @xenova/transformers.

Create:
- src/infra/reranker/transformers.ts — wraps Xenova/bge-reranker-base
  - score(query, texts) → number[] (one score per text)
- src/domain/rag/reranker.ts — rerank(query, chunks, topK=6)
  - Calls infra reranker, sorts chunks by score desc, returns topK
  - Adds rerankerScore field to each

Tests:
- Reranking changes order vs raw retrieval
- Top result is the most relevant in a fixture set

Commit: "feat(rag): cross-encoder reranker"
```

---

## Prompt 45 — Generator with citations

**Prompt:**
```
[Standard preamble]

Task: Generation step with strict citation contract.

Create src/domain/rag/generator.ts:
- generate({ query, context (RetrievedChunk[]), history, llm }) →
  { text, citations: [{ chunkId, documentId, snippet, score }], confidence }

System prompt (in src/domain/rag/prompts.ts):
- Forces inline citation markers like [1], [2] referencing context items
- Forbids inventing details not present in context
- If context insufficient: respond "I don't have that information" + escalate flag
- Outputs JSON: { answer_text, citation_indices, confidence (0..1) }

Generator validates: every cited index exists; every paragraph has at least
one citation; if not → regenerates once, then returns low-confidence escalation.

Tests with mock LLM:
- Valid response → parsed correctly
- Invalid (missing citation) → retried then escalated
- Hallucination guard: context says X, model says Y → rejected (assert via
  faithfulness check we can fake in test)

Commit: "feat(rag): generator with citation enforcement"
```

---

## Prompt 46 — Confidence scorer

**Prompt:**
```
[Standard preamble]

Task: Score the confidence of a draft.

Create src/domain/rag/confidence.ts:
- score({ retrievalScores, citationCount, llmSelfReport }) → number 0..1
  Weighted blend (start simple):
    0.4 * normalized top retrieval score
    0.2 * min(citationCount / 3, 1)
    0.4 * llmSelfReport
- Pure function. Heavily unit-tested with fixtures.

Tests:
- High signals → high score
- Zero citations → score < 0.3
- Self-report 0 → score < 0.5

Commit: "feat(rag): confidence scorer"
```

---

## Prompt 47 — RAG pipeline orchestration

**Prompt:**
```
[Standard preamble]

Task: Wire everything into the pipeline.

Create src/domain/rag/pipeline.ts:
- async answer(query, ctx) per CLAUDE.md Section 8 pseudocode
- Takes all 5 dependencies via constructor injection
- Logs each step's timing via pino
- Returns { text, citations, confidence, route, traceId }
- Calls Langfuse tracing (use a no-op stub for now; real Langfuse later)

Integration test (uses memory-server + real Qdrant + Meili if available):
- Seed a tenant with 5 docs
- Ask a question whose answer is in doc 3
- Assert: doc 3 is cited, confidence > 0.5

Commit: "feat(rag): full pipeline orchestration"
```

---

## Prompt 48 — /query endpoint

**Prompt:**
```
[Standard preamble]

Task: POST /query — the main RAG endpoint.

Create src/api/routes/query.ts:
- Body: { query, history?, audience: "end-user" | "agent" }
- Auth + tenant required
- Constructs the visibility filter from audience
- Calls pipeline.answer()
- Returns { text, citations, confidence, route, traceId }

Integration test:
- agent audience can use internal docs
- end-user audience cannot
- Cross-tenant query is impossible (no doc from another tenant ever cited)

Commit: "feat(api): /query endpoint"
```

---

## Prompt 49 — Connector base interface

**Prompt:**
```
[Standard preamble]

Task: Define the Connector contract.

Create src/domain/ingestion/connectors/base.ts:
- interface Connector {
    type: string  // e.g. "zendesk"
    sync(source: Source): AsyncIterable<ConnectorDocument>
    webhook?(source, payload): AsyncIterable<ConnectorDocument>  // optional
  }
- type ConnectorDocument = { externalId, title, url?, content, metadata?, mimeType? }
- Registry: registerConnector + getConnector(type)

Connectors yield documents; the sync job consumes the iterable and calls
documentService.add() for each.

No specific connector yet — just the contract + registry + tests.

Commit: "feat(ingest): connector interface + registry"
```

---

## Prompt 50 — Sync source job

**Prompt:**
```
[Standard preamble]

Task: Generic Agenda job to run any connector's sync().

Create src/jobs/syncSource.ts:
- Loads source by id
- Looks up connector by source.subtype
- Iterates connector.sync(source)
- For each yielded doc → documentService.add()
- Updates source.lastSyncedAt and status

Tests with a fake connector (yields 3 fixtures): all 3 docs created.

Commit: "feat(jobs): generic sync-source"
```

---

## Prompt 51 — Zendesk connector: help articles

**Prompt:**
```
[Standard preamble]

Task: Zendesk connector — help center articles only.

Create src/domain/ingestion/connectors/zendesk.ts:
- Reads source.config: { subdomain, apiToken, email }
- Implements sync(): GETs /api/v2/help_center/articles.json (paginated)
- Yields ConnectorDocument per article (HTML body → markdown via parsers/html)

Add a "fixture mode" flag: if config.fixtureMode === true, reads from
scripts/seed/fixtures/zendesk-articles.json instead of HTTP. We use this in
tests + seeder to avoid needing a real Zendesk.

Tests:
- Fixture mode yields N docs
- HTTP mode mocked via msw → handles pagination

Commit: "feat(ingest): zendesk help articles connector"
```

---

## Prompt 52 — Zendesk connector: tickets

**Prompt:**
```
[Standard preamble]

Task: Extend Zendesk connector to also pull resolved tickets.

Add to zendesk.ts:
- sync() also yields tickets where status = "solved"
- ConnectorDocument.content = formatted: "Subject: ...\nQuestion: ...\nResolution: ..."
- metadata includes ticket id, requester, tags, resolution date
- Visibility: "customer-facing" only if ticket.public; else "internal"

Tests with fixtures:
- Yields both articles and tickets
- Internal tickets get visibility="internal"

Commit: "feat(ingest): zendesk solved tickets"
```

---

## Prompt 53 — Update seeder with Zendesk fixtures

**Prompt:**
```
[Standard preamble]

Task: Realistic Zendesk fixtures + seeder integration.

Create:
- scripts/seed/fixtures/zendesk-articles.json — 15 articles (realistic content)
- scripts/seed/fixtures/zendesk-tickets.json — 50 solved tickets (mix public + private)
- Update scripts/seed/sources.ts to create a Zendesk source for acme-saas
  with fixtureMode=true
- Run sync-source job on it during seed

Acceptance:
- After npm run seed:reset, acme-saas has Zendesk source + ~65 docs from it
- Sample query "how do I reset my password" finds a Zendesk article

Commit: "feat(seed): zendesk fixtures + sync"
```

---

# Phase 3 — Agent copilot + activity feed

## Prompt 54 — Draft, Conversation, Feedback, Ticket models

**Prompt:**
```
[Standard preamble]

Task: Add the remaining models needed for the copilot loop.

Create:
- src/infra/mongo/models/Ticket.ts — per CLAUDE.md
- src/infra/mongo/models/Conversation.ts
- src/infra/mongo/models/Draft.ts
- src/infra/mongo/models/Feedback.ts

All scoped via tenantScope. All with tests for roundtrip + scoping.

Commit: "feat(model): Ticket, Conversation, Draft, Feedback"
```

---

## Prompt 55 — Tickets webhook + draft generation

**Prompt:**
```
[Standard preamble]

Task: POST /webhooks/zendesk/ticket — receive new ticket, create a draft.

Create:
- src/api/routes/webhooks/zendesk.ts
  - Verifies tenant by API key in header
  - Idempotent on (tenantId, externalId)
  - Creates Ticket + Conversation rows
  - Enqueues a "generate-draft" job
- src/jobs/generateDraft.ts
  - Loads ticket + conversation history
  - Calls pipeline.answer(ticket.body, { audience: "agent" })
  - Saves a Draft with text, citations, confidence
  - Updates Ticket.status to "drafted"

Tests:
- Webhook with same externalId twice → second is ignored
- After job runs → Draft exists with citations

Commit: "feat(copilot): zendesk webhook + draft generation"
```

---

## Prompt 56 — Feedback endpoint

**Prompt:**
```
[Standard preamble]

Task: POST /admin/feedback — capture thumbs / edits / ratings.

Create src/api/routes/admin/feedback.ts:
- Body: { draftId, type: "thumbs"|"edit"|"rating", payload }
  - thumbs: { value: "up"|"down" }
  - edit: { originalText, sentText }  ← the gold signal
  - rating: { score: 1..5, comment? }
- Inserts a Feedback row
- Updates the Draft with sentAt if type === "edit" (means agent sent it)

Tests + an integration test where agent draft → edit → feedback row exists.

Commit: "feat(copilot): feedback endpoint"
```

---

## Prompt 57 — Activity feed endpoint

**Prompt:**
```
[Standard preamble]

Task: GET /admin/activity — paginated feed of every Q&A in the tenant.

Aggregates: tickets + conversations + drafts + feedback.

Returns items shaped like:
{
  ticketId, channel, subject, customer, status,
  draft: { text, citations, confidence, route },
  agentEdit?, feedback?, timestamps
}

Filters: status, route (auto/draft), confidence range, q (search subject/body).

Sorted by createdAt desc, paginated.

Tests:
- Returns seeded items
- Filter by route="auto" only returns auto-resolved

Commit: "feat(copilot): activity feed endpoint"
```

---

## Prompt 58 — Activity feed UI

**Prompt:**
```
[Standard preamble]

Task: web/src/pages/Activity.tsx — render the feed.

UI:
- Filter bar (status, route, confidence slider, search)
- List of cards: subject, draft excerpt, citations (clickable to doc detail),
  confidence pill, route badge (auto/draft), feedback emoji
- Click card → expands to show full conversation + draft + edit diff

Components: ActivityCard, CitationCard (clickable, opens DocumentDetail in modal).

Acceptance:
- Lists seeded activity
- Citations open the doc
- Confidence pill colored: green > 0.85, yellow 0.5–0.85, red < 0.5

Commit: "feat(web): activity feed page"
```

---

## Prompt 59 — Langfuse self-hosted integration

**Prompt:**
```
[Standard preamble]

Task: Wire real Langfuse tracing into the pipeline.

Add langfuse SDK. In src/observability/tracing.ts:
- Configure with LANGFUSE_HOST, LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY
- Export getTracer() that returns a no-op if env vars not set (dev without
  Langfuse should still work)

Update src/domain/rag/pipeline.ts to:
- Open a trace per /query call
- Span per step (rewrite, retrieve, rerank, generate)
- Attach tenantId + audience as trace metadata (NOT user PII)

Acceptance:
- Without env vars: pipeline still works, no errors
- With Langfuse running: traces appear in the UI

Commit: "feat(obs): langfuse tracing"
```

---

## Prompt 60 — Zendesk Apps Framework sidebar

**Prompt:**
```
[Standard preamble]

Task: Build the Zendesk sidebar app that drafts replies inside Zendesk.

Create:
- zendesk-app/ at repo root — separate package per ZAF docs
- manifest.json — sidebar location, single iframe
- assets/iframe.html → loads our small React micro-app
- Micro-app:
  - Reads ticket id + content from ZAF SDK
  - Calls our backend POST /query with audience="agent"
  - Renders the draft + citations + "Insert into reply" button
  - "Insert" pastes text into the Zendesk reply box via ZAF API
  - Captures agent edits via feedback endpoint when ticket is updated/sent

Document local dev with zat (Zendesk Apps Tools).

Acceptance:
- Sideloaded into a Zendesk sandbox, draft appears for any open ticket
- Insert button populates the reply
- Editing then submitting the reply fires a feedback edit event

Commit: "feat(copilot): zendesk sidebar app"
```

---

# Phase 4 — Eval harness

## Prompt 61 — Golden set + loader

**Prompt:**
```
[Standard preamble]

Task: Define the golden set format and loader.

Create:
- scripts/eval/golden_set.jsonl — 30 examples (we'll grow it)
  Format per line: { id, query, audience, expectedAnswerSummary,
    mustReferenceDocIds[], mustNotHallucinate[] }
- scripts/eval/loader.ts — loads + validates with Zod, returns parsed array

Tests:
- Loader rejects malformed entries
- Sample data round-trips

Commit: "feat(eval): golden set format + loader"
```

---

## Prompt 62 — Eval runner (Node side)

**Prompt:**
```
[Standard preamble]

Task: Run the pipeline against the golden set, capture results.

Create scripts/eval/runEval.ts:
- For each entry:
  - Calls pipeline.answer(entry.query, { audience, tenantId })
  - Records: response, citations, confidence, latency
- Computes simple metrics:
  - citationRecall = |cited ∩ mustReference| / |mustReference|
  - hallucinationFlag = any mustNotHallucinate string appears in response
- Saves to evalRuns collection with goldenSetVersion + commitSha (from git)
- Outputs a summary table to stdout

Add npm script: "eval".

Acceptance:
- Runs against the seeded acme-saas tenant
- Outputs per-entry results + aggregate metrics
- Stored in Mongo for trend analysis

Commit: "feat(eval): eval runner with simple metrics"
```

---

## Prompt 63 — Ragas integration (Python sidecar)

**Prompt:**
```
[Standard preamble]

Task: Add Ragas-based deeper metrics via a Python sidecar.

Create:
- scripts/eval/ragas_eval.py — reads JSON of {query, answer, contexts} from
  stdin, outputs Ragas metrics (faithfulness, answer_relevancy,
  context_precision) as JSON to stdout
- requirements.txt with ragas, datasets, langchain
- Update scripts/eval/runEval.ts to optionally pipe each result through
  ragas_eval.py via child_process and merge metrics

Document Python venv setup in docs/eval-methodology.md.

Acceptance:
- python scripts/eval/ragas_eval.py < sample.json works standalone
- runEval.ts with --ragas flag includes Ragas metrics in saved EvalRun

Commit: "feat(eval): ragas sidecar"
```

---

## Prompt 64 — Eval CLI commands + CI

**Prompt:**
```
[Standard preamble]

Task: Make eval first-class.

- npm run eval → runs against last seed state
- npm run eval:fresh → seeds + runs
- npm run eval:diff <commitSha> → compares latest run to a previous commit
- GitHub Actions workflow .github/workflows/eval.yml — runs eval on PRs that
  touch src/domain/rag/** and posts a summary comment

Acceptance:
- Local commands work
- CI workflow file is valid (we won't actually run CI in this prompt, but lint it)

Commit: "feat(eval): CLI commands + CI workflow"
```

---

# Phase 5 — More connectors + Slack copilot

## Prompt 65 — Notion connector

**Prompt:**
```
[Standard preamble]

Task: Notion connector via @notionhq/client.

Create src/domain/ingestion/connectors/notion.ts:
- config: { token, rootPageIds[] | databaseIds[] }
- sync(): walks pages/databases, yields ConnectorDocument
- Block content rendered to markdown
- visibility default = "customer-facing" (configurable per source)

Add fixture mode reading from scripts/seed/fixtures/notion-pages.json.

Tests with mocked Notion client.

Commit: "feat(ingest): notion connector"
```

---

## Prompt 66 — Confluence connector

**Prompt:**
```
[Standard preamble]

Task: Confluence Cloud connector.

Create src/domain/ingestion/connectors/confluence.ts:
- config: { domain, email, apiToken, spaceKeys[] }
- sync(): walks spaces → pages, yields ConnectorDocument
- Body XHTML → markdown via parsers/html
- Fixture mode

Tests with mocked HTTP.

Commit: "feat(ingest): confluence connector"
```

---

## Prompt 67 — GitHub connector

**Prompt:**
```
[Standard preamble]

Task: GitHub connector via Octokit.

Create src/domain/ingestion/connectors/github.ts:
- config: { token, repos: [{ owner, repo }] }
- sync(): per repo, yields:
  - README and /docs/**.md
  - Closed issues with their resolution comment
  - Wiki pages
- Per-doc visibility: public repo → customer-facing, private → internal

Fixture mode + tests.

Commit: "feat(ingest): github connector"
```

---

## Prompt 68 — Web crawler with Crawlee

**Prompt:**
```
[Standard preamble]

Task: Crawler for public help-center sites.

Create src/domain/ingestion/connectors/webCrawler.ts:
- config: { startUrls[], maxDepth, sameOriginOnly, includePatterns[],
  excludePatterns[] }
- Uses Crawlee CheerioCrawler
- Each page → ConnectorDocument with markdown content
- Respects robots.txt
- Polite: 1 req/sec by default, configurable

Tests against a tiny local fixture site (use express to serve a few HTML pages
during the test).

Commit: "feat(ingest): web crawler"
```

---

## Prompt 69 — Slack history connector

**Prompt:**
```
[Standard preamble]

Task: Pull Slack channel histories as knowledge.

Create src/domain/ingestion/connectors/slack.ts:
- config: { botToken, channelIds[] }
- sync(): conversations.history per channel, builds threads
- Filters threads where someone marked them as resolved (reaction "white_check_mark"
  on the resolving message — configurable)
- visibility: "internal" by default

Tests with mocked Slack web client.

Commit: "feat(ingest): slack history connector"
```

---

## Prompt 70 — Re-crawl scheduling

**Prompt:**
```
[Standard preamble]

Task: Schedule periodic syncs per source.

In src/jobs/index.ts:
- agenda.every(source.config.syncCron || "every 6 hours", "sync-source",
  { sourceId }) — registered on source create
- Cancel on source delete

Tests:
- Creating a source schedules the job
- Deleting cancels it

Commit: "feat(jobs): periodic sync scheduling"
```

---

## Prompt 71 — Slack bot scaffold

**Prompt:**
```
[Standard preamble]

Task: Slack Bolt app for the internal copilot.

Create:
- slack-app/ — separate package (or src/channels/slack/) using @slack/bolt
- /ask <question> slash command → calls /query (audience="agent") for the
  tenant linked to this Slack workspace
- Renders answer with citations as Block Kit (citations as buttons opening
  the source URL)

Wire workspace ↔ tenant link via a SlackInstall model on the tenant.

Acceptance:
- /ask "how do I refund a customer" returns the right answer in Slack

Commit: "feat(channel): slack /ask command"
```

---

# Phase 6 — Auto-resolve + customer channels

## Prompt 72 — Confidence threshold per tenant + admin UI

**Prompt:**
```
[Standard preamble]

Task: Make the auto-resolve threshold tenant-configurable.

- Tenant model already has confidenceThreshold field
- Add GET /admin/settings, PATCH /admin/settings (autoResolveEnabled,
  confidenceThreshold)
- web/src/pages/Settings.tsx — toggle + slider + warning text
- pipeline.answer() reads ctx.tenant.confidenceThreshold (already does per
  prompt 47, just verify)

Tests:
- Setting threshold to 0.99 makes nearly nothing auto-resolve
- Disabling autoResolveEnabled forces all routes to "draft"

Commit: "feat(autopilot): tenant-configurable confidence threshold"
```

---

## Prompt 73 — Chat widget (React + embed script)

**Prompt:**
```
[Standard preamble]

Task: Embeddable chat widget.

Create widget/ — separate Vite build outputting:
- widget.js — small bundle that injects an iframe + button into any host page
- iframe.html — the React chat UI
- POST /chat/sessions, POST /chat/messages — backend endpoints (audience="end-user")

Widget config via data-attributes:
  <script src=".../widget.js" data-tenant="acme-saas" data-api="..."></script>

UI: chat bubble → opens panel with conversation, citations shown as small "?"
links. "This didn't help" button → escalates to a human (creates a ticket via
backend).

Acceptance:
- Drop the script tag into a static HTML page → working chat
- end-user audience never sees internal-only docs in citations

Commit: "feat(channel): embeddable chat widget"
```

---

## Prompt 74 — Email channel

**Prompt:**
```
[Standard preamble]

Task: Email in/out via IMAP + SMTP.

Create:
- src/infra/channels/email.ts
  - imapflow listener that watches a tenant's inbox
  - On new message → creates Ticket, runs pipeline, replies via nodemailer if
    auto-resolve, else leaves it for an agent
- Per-tenant config: { imap: {...}, smtp: {...}, fromAddress }
- Threading via References/In-Reply-To headers

Reuse the same pipeline as chat widget.

Tests with a fake IMAP/SMTP (use smtp-tester or stub).

Commit: "feat(channel): email in/out"
```

---

## Prompt 75 — Escape hatch + kill switch

**Prompt:**
```
[Standard preamble]

Task: Hard guardrails for auto-resolve.

- "This didn't help" button on chat widget + email reply footer → instantly
  escalates: cancels auto-resolve, marks ticket "needs human", notifies
  configured Slack channel
- Tenant kill switch: PATCH /admin/settings { autoResolveEnabled: false }
  takes effect within 30 seconds (cache TTL)
- Per-channel kill: disable on email but keep on widget, etc.

Tests:
- Escalation creates the right Ticket state and notification
- Kill switch flip routes everything to drafts

Commit: "feat(autopilot): escape hatch + kill switch"
```

---

## Prompt 76 — PII redaction sidecar

**Prompt:**
```
[Standard preamble]

Task: Optional Presidio sidecar for production-grade PII redaction.

Create:
- presidio-sidecar/ — tiny FastAPI wrapper around Presidio
- src/utils/redact.ts — redact(text) → text. If REDACT_URL env var set,
  calls the sidecar; else falls back to regex (existing dev path)
- Apply redact() to all text logged to pino + sent to Langfuse
- Apply to query before LLM call only if PII_BLOCK_LLM=true (off by default)

Tests:
- Without REDACT_URL, regex path redacts emails + phone numbers
- With REDACT_URL mocked, calls the sidecar

Commit: "feat(security): presidio sidecar redaction"
```

---

# Final hardening

## Prompt 77 — Rate limiting

**Prompt:**
```
[Standard preamble]

Task: Apply express-rate-limit to all public-facing endpoints.

Limits (per IP, per minute):
- /chat/messages: 30
- /webhooks/*: 600
- /admin/*: 300 (per tenant + IP)

Skip in test env. Configurable via env vars.

Tests:
- Hitting the limit returns 429
- Skipped in test env

Commit: "feat(api): rate limiting"
```

---

## Prompt 78 — Audit log review + GDPR export

**Prompt:**
```
[Standard preamble]

Task: GET /admin/export — full tenant data dump as a zip.

Includes: tenants, users (no passwords), sources, documents (text + metadata),
chunks, tickets, conversations, drafts, feedback, audit logs.

Excludes: vectors, cache.

Format: one JSONL file per collection inside the zip.

Add audit log entry on export.

Tests:
- Export contains all tenant data
- No cross-tenant data
- Audit entry written

Commit: "feat(compliance): tenant data export"
```

---

## Prompt 79 — Production env doc + deploy script

**Prompt:**
```
[Standard preamble]

Task: Document deploying to a single Oracle Cloud Free Tier VM.

Create docs/deployment.md:
- VM provisioning steps
- Native installs of Node, Mongo, Qdrant, Meilisearch, Ollama (no Docker)
- pm2 startup
- Caddy reverse proxy with auto-TLS
- Backup strategy (mongodump nightly)
- Log rotation

Add scripts/deploy.sh — rsync code + pm2 reload (very simple).

Acceptance:
- A new engineer can follow the doc and stand up a working instance
- npm run deploy:staging works against a configured remote

Commit: "docs: production deployment on oracle free tier"
```

---

## Prompt 80 — README polish + final demo script

**Prompt:**
```
[Standard preamble]

Task: Final README + a 5-minute demo script.

Update README.md:
- One-paragraph product description
- Quickstart (5 commands max to running app)
- Feature list with screenshots (placeholders ok)
- Link to CLAUDE.md, prompts.md, docs/

Create docs/demo-script.md — a step-by-step "show this to a customer in 5 minutes":
1. Login as admin@acme-saas.com
2. Show Documents page
3. Upload a PDF
4. Watch it become searchable
5. Switch a doc to "internal" and demonstrate filtering
6. Show Activity feed with citations
7. /ask in Slack

Acceptance:
- A non-technical observer can follow the script
- All features in the script actually work end-to-end

Commit: "docs: README polish + demo script"
```

---

## After prompt 80

You have a working product. From here, every new feature follows the same pattern:

1. Open a fresh Claude Code session
2. Use the standard preamble
3. Specify ONE micro-task with files, tests, and acceptance criteria
4. Plan first, then code
5. Commit
6. Run `npm run eval` if you touched the RAG pipeline

Add new prompts to this file as you grow the product. Treat `prompts.md` as the second source of truth alongside `CLAUDE.md`.

---

_Last updated: 2026-05-03_