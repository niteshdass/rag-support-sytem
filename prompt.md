# Build Prompts — RAG Support System

Run these in order. One prompt = one session. Don't combine. Don't skip.
Mark done as you go: `[ ]` → `[x]`

---

## Phase 1 — Foundation

### P1-01 — Monorepo Scaffold
- [ ]
```
Scaffold a pnpm monorepo for a RAG support system. Follow CLAUDE.md exactly.

Structure:
- backend/     (Fastify + TypeScript)
- frontend/    (React + Vite + TypeScript)
- packages/shared/  (Zod schemas, types, constants)
- docker-compose.yml  (Postgres with pgvector, Redis)
- tsconfig.base.json  (shared TS config, strict mode)
- .eslintrc.json  (shared ESLint config)
- .prettierrc
- .gitignore
- pnpm-workspace.yaml
- .env.example  (root level — points to backend/.env.example and frontend/.env.example)

Backend package.json dependencies:
fastify, @fastify/rate-limit, @fastify/cors, zod, drizzle-orm, pg, @neondatabase/serverless, pino, pino-pretty, bullmq, ioredis, @sentry/node, dotenv

Frontend package.json dependencies:
react, react-dom, vite, @vitejs/plugin-react, typescript, tailwindcss, @tanstack/react-query, @tanstack/react-router, @sentry/react

packages/shared: zod only.

Set up Husky + lint-staged for pre-commit: ESLint + Prettier.
Set up GitHub Actions CI at .github/workflows/ci.yml: typecheck + lint + build on pull_request and push to main.

Do NOT create any application logic. Scaffold only.
Show me the complete folder tree when done.
```

---

### P1-02 — Backend Env + Logger + Config
- [ ]
```
In backend/src/, create these three files. Follow CLAUDE.md strict rules.

1. env.ts
   - Use zod to parse and validate all env vars listed in CLAUDE.md backend .env section
   - Call it at module load time — throw and exit if any required var is missing
   - Export a typed `env` object used everywhere instead of process.env

2. logger.ts
   - Set up Pino with pretty-print in development, JSON in production
   - Export a single `logger` instance
   - Log level from env.LOG_LEVEL

3. config.ts
   - Export a `config` object with: chunkSize, chunkOverlap, rateLimitWindowMs, rateLimitMax, ingestionRateLimitMax, llmTimeoutMs, llmMaxRetries, llmTemperature, llmModel, embeddingTimeoutMs, embeddingMaxRetries, embeddingModel, rerankerModel, rerankerTopN
   - All values read from the validated env object, not from process.env directly

All three files: explicit return types, no any, no console.log.
```

---

### P1-03 — Database Schema + Drizzle Setup
- [ ]
```
Set up Drizzle ORM in backend/src/db/. Follow CLAUDE.md strict rules.

1. backend/src/db/client.ts
   - Postgres connection pool using `pg`
   - Pool size from config
   - Export typed `db` client

2. backend/src/db/schema.ts
   - Tables:
     - organizations: id (uuid pk), name, created_at, updated_at
     - api_keys: id, organization_id (fk → organizations), key_hash (text), key_prefix (text, 8 chars shown to user), name, last_used_at, created_at, revoked_at
     - documents: id, organization_id (fk), url, title, status (enum: pending|processing|ready|failed), error, metadata (jsonb), created_at, updated_at
     - chunks: id, organization_id (fk), document_id (fk → documents), content (text), embedding (vector(1024)), token_count, chunk_index, metadata (jsonb), created_at
     - queries: id, organization_id (fk), question, answer, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost_usd_cents, latency_ms, created_at
     - query_chunks: id, query_id (fk → queries), chunk_id (fk → chunks), rank_position, score
   - All tables have organization_id. Use pgvector for the embedding column.
   - Export all table types.

3. drizzle.config.ts (root of backend/)
   - Point to schema.ts, output to src/db/migrations/

4. Generate the first migration with drizzle-kit generate.

5. package.json scripts:
   - "db:generate": drizzle-kit generate
   - "db:migrate": drizzle-kit migrate
   - "db:studio": drizzle-kit studio

Show the full schema file when done.
```

---

### P1-04 — Fastify Server + Middleware
- [ ]
```
Build the Fastify server entry point and middleware. Follow CLAUDE.md.

1. backend/src/middleware/error.ts
   - Global Fastify error handler
   - Catches all errors, maps to standard shape: { code, message, details?, timestamp }
   - Known error classes (see utils/errors.ts) map to their HTTP status
   - Unknown errors → 500 INTERNAL_ERROR
   - All errors logged with Pino and sent to Sentry

2. backend/src/utils/errors.ts
   - AppError base class
   - Subclasses: ValidationError (400), UnauthorizedError (401), NotFoundError (404), RateLimitError (429), InternalError (500)
   - Each has a `code` string matching CLAUDE.md error codes

3. backend/src/middleware/logging.ts
   - Fastify onRequest + onResponse hooks
   - Log: method, url, status, latency_ms, org_id (if available on request)
   - Use Pino child logger

4. backend/src/index.ts
   - Register: @fastify/cors, @fastify/rate-limit (from config), error middleware, logging middleware
   - Mount health route: GET /health → { status: "ok", timestamp }
   - Listen on config port
   - Graceful shutdown on SIGTERM/SIGINT: drain connections, close DB pool, exit

No route logic yet. Just server scaffold.
Confirm it starts with `pnpm dev` and GET /health returns 200.
```

---

### P1-05 — Auth Middleware + API Key Validation
- [ ]
```
Build API key auth for the backend. Follow CLAUDE.md.

1. backend/src/services/auth.ts
   - hashApiKey(key: string): string  — SHA-256 hash
   - generateApiKey(): { key: string, prefix: string, hash: string }  — generates a sk_live_... prefixed key
   - validateApiKey(rawKey: string, db): Promise<{ organizationId: string } | null>  — looks up by hash, returns org or null
   - All functions explicitly typed, no any

2. backend/src/middleware/auth.ts
   - Fastify preHandler hook
   - Reads Authorization: Bearer <key> header
   - Calls validateApiKey
   - Attaches organization_id to request object (extend FastifyRequest interface)
   - Throws UnauthorizedError if missing or invalid

3. backend/src/routes/admin.ts
   - POST /api/admin/orgs — create org, returns org + generated API key (shown once only)
   - POST /api/admin/orgs/:orgId/keys — rotate/add API key
   - No auth required on POST /api/admin/orgs (bootstrap only — note in code that this needs auth in production)

Write an integration test in backend/tests/integration/auth.test.ts:
- Create org + key via admin endpoint
- Use key to hit a protected route — expect 200
- Use bad key — expect 401
- Missing key — expect 401
```

---

### P1-06 — Ingestion Service
- [ ]
```
Build the ingestion pipeline. Follow CLAUDE.md. One service at a time, fully implemented.

Input: a URL
Output: chunks stored in pgvector with embeddings

1. backend/src/services/ingestion/scraper.ts
   - fetchAndParse(url: string): Promise<{ title: string, content: string, url: string }>
   - Use node-fetch + @mozilla/readability + jsdom to extract clean article content
   - Throws on HTTP error or unparseable content
   - 30s timeout

2. backend/src/services/ingestion/chunker.ts
   - chunkText(content: string, options: { chunkSize: number, overlap: number }): string[]
   - Semantic chunking: split on paragraph/sentence boundaries first, then hard-split if over chunkSize
   - No chunk smaller than 100 tokens
   - Returns array of text chunks

3. backend/src/services/ingestion/embedder.ts
   - embedChunks(chunks: string[]): Promise<number[][]>
   - Use voyageai npm package, model from config
   - Batch requests (max 128 per call per Voyage limits)
   - Retry with exponential backoff (use backend/src/utils/retry.ts)
   - Log: model, input chunks count, latency_ms

4. backend/src/utils/retry.ts (if not exists)
   - withRetry<T>(fn: () => Promise<T>, opts: { maxRetries, baseDelayMs, timeoutMs }): Promise<T>
   - Exponential backoff with jitter
   - Throws last error after max retries

5. backend/src/services/ingestion/store.ts
   - storeChunks(orgId, documentId, chunks, embeddings, db): Promise<void>
   - Bulk insert chunks + embeddings in one transaction
   - Updates document status to 'ready' on success, 'failed' on error

All functions explicitly typed. No any. Errors surfaced, not swallowed.
```

---

### P1-07 — Ingest Route + BullMQ Job
- [ ]
```
Build the ingest endpoint and queue it as a background job. Follow CLAUDE.md.

1. backend/src/jobs/ingestion.ts
   - BullMQ queue named "ingestion"
   - Job data type: { orgId, documentId, url }
   - Worker: calls scraper → chunker → embedder → store
   - On failure: update document status to 'failed' with error message
   - On success: update document status to 'ready'
   - Max concurrency: 3

2. backend/src/routes/ingest.ts
   - POST /api/ingest
   - Auth required (preHandler: auth middleware)
   - Zod schema: { url: string (valid URL), idempotency_key?: string }
   - Idempotency: if key provided and job already exists for org + key, return existing document (no duplicate)
   - Creates document row with status 'pending'
   - Enqueues BullMQ job
   - Returns: { success: true, data: { documentId, status: 'pending' } }

3. GET /api/ingest/:documentId/status
   - Auth required
   - Returns document status, error if failed

Rate limit: 5 requests per minute per org for POST /api/ingest (stricter than default).

Mount the route in backend/src/index.ts.
```

---

### P1-08 — LLM Service + Prompts
- [ ]
```
Build the LLM wrapper and define all prompts. Follow CLAUDE.md.

1. backend/src/prompts.ts
   - Export a PROMPTS object with version numbers
   - RAG_SYSTEM_V1: system prompt for the RAG answer generation
     - Tells the model: answer based ONLY on provided context chunks, cite sources by chunk index, say "I don't know" if context is insufficient
     - Include format instructions: answer in plain text, citations as [1], [2], etc.
   - QUERY_REWRITE_V1: prompt to rewrite a vague follow-up question into a standalone search query

2. backend/src/services/llm.ts
   - generateAnswer(params: { question, chunks: Array<{content, index}>, orgId }): AsyncGenerator<string>
     - Streams tokens using Anthropic SDK
     - Uses PROMPTS.RAG_SYSTEM_V1
     - Cache control on system prompt (prompt caching)
     - Model and temperature from config
     - Logs on completion: input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost_usd_cents, latency_ms
     - Returns async generator yielding text delta strings
   - rewriteQuery(question: string): Promise<string>
     - Uses PROMPTS.QUERY_REWRITE_V1
     - Non-streaming, returns rewritten query string

Use @anthropic-ai/sdk. Follow claude-api skill patterns.
Wrap all calls with retry from utils/retry.ts.
Explicit return types everywhere. No any.
```

---

### P1-09 — Retrieval Service + Ask Route
- [ ]
```
Build the retrieval pipeline and the /api/ask endpoint. Follow CLAUDE.md.

1. backend/src/services/retrieval/vector-search.ts
   - vectorSearch(orgId, embedding: number[], topK: number, db): Promise<Array<{chunkId, content, score}>>
   - Uses pgvector cosine distance: ORDER BY embedding <=> $1 LIMIT $2
   - Always scoped by organization_id

2. backend/src/routes/ask.ts
   - POST /api/ask
   - Auth required
   - Zod schema: { question: string (1–2000 chars), conversation_id?: string }
   - Flow:
     1. Embed the question (Voyage AI)
     2. Vector search top-10 chunks for this org
     3. Call llm.generateAnswer() with top chunks
     4. Stream response as Server-Sent Events (SSE)
     5. On stream complete: save query row (question, answer, tokens, cost, latency)
     6. Return citations as a final SSE event: { type: "citations", data: [...] }
   - SSE format:
     - data: { type: "delta", content: "..." }
     - data: { type: "citations", data: [{ chunkId, content, documentId, url, title }] }
     - data: { type: "done" }
     - data: { type: "error", message: "..." }
   - On any error: send SSE error event, do not crash server

Mount in backend/src/index.ts.

Write integration test: ingest a test document → ask a question about it → verify answer contains content from document and citations are returned.
This is the critical path test. It must pass before Phase 2.
```

---

### P1-10 — Frontend: Chat UI
- [ ]
```
Build the frontend chat page. Follow CLAUDE.md frontend rules.

Stack: React + Vite + TypeScript + TanStack Query + Tailwind + shadcn/ui

1. frontend/src/lib/api-client.ts
   - Base fetch wrapper with:
     - API key from localStorage (key: "rag_api_key")
     - Authorization: Bearer header on every request
     - Error parsing to standard shape
     - SSE streaming helper: streamAsk(question, onDelta, onCitations, onError)

2. frontend/src/hooks/useChat.ts
   - Manages streaming state: question, answer (built up from deltas), citations, status
   - Uses the SSE streaming helper
   - Status: idle | loading | streaming | done | error

3. frontend/src/components/ChatInput.tsx
   - Textarea with submit on Enter (Shift+Enter = newline)
   - Disabled while loading/streaming
   - Shows character count, max 2000

4. frontend/src/components/Answer.tsx
   - Renders streaming answer text (updates as deltas arrive)
   - Citation references [1] [2] rendered inline as clickable superscripts

5. frontend/src/components/CitationCard.tsx
   - Expandable card showing: source URL, title, chunk content excerpt
   - Numbered to match inline citation references

6. frontend/src/pages/ChatPage.tsx
   - API key input if not set (simple text input + save to localStorage)
   - ChatInput + Answer + CitationCard list
   - Loading spinner while waiting for first delta
   - Error alert on failure

7. frontend/src/App.tsx + router setup
   - / → ChatPage
   - * → NotFound

Wire up Sentry error boundary in App.tsx.
Must work with backend running locally. Show me the ChatPage component when done.
```

---

### P1-11 — Sentry + Observability Wiring
- [ ]
```
Wire up Sentry and structured logging on both backend and frontend. Follow CLAUDE.md.

Backend:
- Initialize @sentry/node in backend/src/index.ts before any other imports
- Capture all unhandled errors + promise rejections
- Attach org_id to Sentry scope on every authenticated request
- Add Sentry transaction tracing to: ingest job, ask endpoint (track as a transaction with spans for: embed, vectorSearch, llm)
- Log every LLM call result to Pino: { level: 'info', event: 'llm_call', model, inputTokens, outputTokens, cacheReadTokens, costUsdCents, latencyMs, orgId }

Frontend:
- Initialize @sentry/react in frontend/src/index.tsx
- Wrap App with Sentry.ErrorBoundary (fallback: ErrorAlert component)
- Capture errors from useChat hook with Sentry.captureException

Confirm: a thrown error in the ask endpoint appears in Sentry with org_id tag.
```

---

### P1-12 — Deploy to Railway + Vercel
- [ ]
```
Prepare both apps for production deployment. Follow CLAUDE.md.

Backend (Railway):
- Add a Procfile or railway.json with start command: node dist/index.js
- Add build script: tsc --project tsconfig.json
- backend/src/db/migrations/ must run on deploy: add a migrate script that runs drizzle-kit migrate before server starts
- Confirm all env vars from backend/.env.example are documented in Railway env config (just document — don't commit secrets)
- Confirm SENTRY_DSN, DATABASE_URL, REDIS_URL, ANTHROPIC_API_KEY, VOYAGE_API_KEY, COHERE_API_KEY are all in .env.example

Frontend (Vercel):
- vite.config.ts: set base URL, configure build output
- Add vercel.json if needed for SPA routing (all routes → index.html)
- Confirm VITE_API_BASE_URL is documented

Update README.md with:
- 5-minute local setup: clone → cp .env.example → docker compose up → pnpm install → pnpm db:migrate → pnpm dev
- Production deploy instructions for Railway and Vercel
- Link to API docs (placeholder for now)

Update CHANGELOG.md with version 0.1.0 entry.
```

---

## Phase 2 — Multi-tenancy + Evals

### P2-01 — Multi-tenancy Hardening
- [ ]
```
Harden all database queries for multi-tenancy. Follow CLAUDE.md.

1. packages/shared/src/helpers.ts
   - scopeToOrg<T extends { where: any }>(query: T, orgId: string): T
   - Helper that wraps any Drizzle query and ensures organization_id = orgId is always in WHERE clause
   - Export TypeScript type OrgScopedQuery

2. Audit every Drizzle query in backend/src/:
   - Every SELECT, UPDATE, DELETE must use the scopeToOrg helper or have an explicit .where(eq(table.organizationId, orgId))
   - If any query is missing org scoping, fix it now
   - List every file you changed

3. Add Postgres row-level security as a second layer:
   - ALTER TABLE ... ENABLE ROW LEVEL SECURITY
   - Policy: USING (organization_id = current_setting('app.current_org_id'))
   - Set app.current_org_id at the start of every DB transaction via SET LOCAL
   - Add a setOrgContext(orgId, tx) helper in backend/src/db/client.ts

4. Write an integration test:
   - Create two orgs
   - Ingest document for org A
   - Ask a question as org B
   - Verify org B gets zero results
```

---

### P2-02 — Admin Dashboard (Frontend)
- [ ]
```
Build the admin dashboard page. Follow CLAUDE.md frontend rules.

Routes (add to router):
- /admin → AdminPage

AdminPage tabs:
1. Organizations tab
   - List all orgs (hits GET /api/admin/orgs — add this endpoint)
   - Create org button → modal → form → POST /api/admin/orgs
   - Shows org ID, name, created_at, document count, query count

2. Documents tab
   - List documents for selected org: id, url, title, status, created_at
   - Status badge: pending (yellow), processing (blue), ready (green), failed (red)
   - Ingest URL button → input → POST /api/ingest
   - Auto-refresh document list every 5s while any document is in pending/processing state (use TanStack Query refetchInterval)

3. Recent Queries tab
   - List recent queries: question (truncated), latency_ms, cost_usd_cents, created_at
   - Click to expand full question + answer

All tabs use TanStack Query. Loading + error states on every fetch. No prop drilling.
```

---

### P2-03 — Eval Framework
- [ ]
```
Build the eval system. This is critical infrastructure. Follow CLAUDE.md.

1. backend/src/db/schema.ts — add tables:
   - evals: id, organization_id, question, expected_answer (nullable), expected_source_urls (text[]), created_at
   - eval_runs: id, eval_id, query_id (fk → queries), passed (bool), notes, run_at

2. backend/src/evals/questions.json
   - Seed 10 questions that can be answered from the Anthropic documentation (we'll use docs.anthropic.com as the test corpus)
   - Format: [{ "id": "1", "question": "...", "expected_source_urls": ["..."], "expected_keywords": ["..."] }]

3. backend/src/evals/runner.ts  (CLI script, not a server route)
   - Reads questions.json
   - For each question: calls the full retrieval + LLM pipeline (not HTTP — calls services directly)
   - Evaluates pass/fail:
     - PASS if answer contains all expected_keywords
     - PASS if at least one expected_source_url appears in citations
   - Outputs: per-question result (pass/fail, latency_ms, cost_usd_cents), summary (pass rate, avg latency, total cost)
   - Writes results to backend/src/evals/report.json
   - Exits with code 1 if pass rate < 80%

4. Add to CI (.github/workflows/ci.yml):
   - Run evals as a separate job after build+test
   - Only run on push to main (not every PR)
   - Fail CI if eval runner exits with code 1

Add script to backend/package.json: "eval": "tsx src/evals/runner.ts"
```

---

## Phase 3 — Hybrid Search + Reranking

### P3-01 — Full-Text Search (BM25)
- [ ]
```
Add Postgres full-text search alongside vector search. Follow CLAUDE.md.

1. New migration:
   - Add tsvector column to chunks table: content_tsv
   - Add GIN index on content_tsv
   - Add trigger: before insert/update on chunks, set content_tsv = to_tsvector('english', content)

2. backend/src/services/retrieval/bm25.ts
   - bm25Search(orgId, query: string, topK: number, db): Promise<Array<{chunkId, content, rank}>>
   - Uses ts_rank_cd with plainto_tsquery
   - Always scoped by organization_id

3. Update the ask endpoint to run vector search AND bm25 search in parallel (Promise.all)
   - Collect both result sets
   - Pass to RRF in next step

No reranking yet. Just make sure both searches run and return results.
```

---

### P3-02 — Reciprocal Rank Fusion + Reranker
- [ ]
```
Combine search results and add Cohere reranking. Follow CLAUDE.md.

1. backend/src/services/retrieval/rrf.ts
   - reciprocalRankFusion(results: Array<Array<{chunkId, content, score}>>, k?: number): Array<{chunkId, content, rrfScore}>
   - Standard RRF formula: sum of 1/(k + rank) across all lists
   - k defaults to 60
   - Returns deduplicated results sorted by rrfScore descending

2. backend/src/services/retrieval/reranker.ts
   - rerank(query: string, chunks: Array<{chunkId, content}>, topN: number): Promise<Array<{chunkId, content, relevanceScore}>>
   - Uses cohere-ai SDK, model from config
   - Retry with exponential backoff
   - Log: query, chunks count, topN, latency_ms

3. Update ask endpoint:
   - Run vector search + BM25 in parallel
   - Fuse with RRF → get top 20
   - Rerank top 20 → get top 5 (from config: RERANKER_TOP_N)
   - Pass top 5 to LLM

4. Add eval check: run eval suite before and after this change, confirm pass rate does not drop.

Show the updated ask endpoint flow as a comment block in the route file.
```

---

### P3-03 — Query Rewriting + "I Don't Know"
- [ ]
```
Add query rewriting and a graceful "I don't know" path. Follow CLAUDE.md.

1. backend/src/prompts.ts — add/update:
   - QUERY_REWRITE_V1: rewrite a conversational/vague question into a standalone search query. Input: { question, conversation_history? }. Output: standalone question only, no explanation.
   - RAG_SYSTEM_V2: update system prompt to explicitly instruct the model to respond with a specific "I_DONT_KNOW" marker (literal string) if the context chunks do not contain enough information to answer. Version bump from V1.

2. Update ask endpoint:
   - Before embedding: call llm.rewriteQuery(question) → use rewritten query for search, keep original question for LLM context
   - After streaming completes: check if answer contains "I_DONT_KNOW" marker → replace with user-friendly message: "I couldn't find an answer to this in the available documentation."
   - Log: { event: 'query_rewrite', original, rewritten, orgId }

3. Update eval runner to test "I don't know" path:
   - Add 3 questions to questions.json that are clearly unanswerable from the corpus
   - PASS if answer contains the user-friendly "couldn't find" message
```

---

### P3-04 — Conversation Memory
- [ ]
```
Add multi-turn conversation support. Follow CLAUDE.md.

1. New migration:
   - conversations table: id (uuid), organization_id, created_at, updated_at
   - Add conversation_id (nullable fk → conversations) to queries table

2. Update ask endpoint:
   - Accept conversation_id in request body (optional)
   - If no conversation_id: create new conversation, return it in response
   - If conversation_id: load last 5 queries for this conversation (ordered by created_at desc)
   - Pass conversation history to QUERY_REWRITE_V1 for context-aware rewriting
   - Pass last 3 exchanges (question + answer pairs) as prior turns in LLM messages array
   - Context window management: if total tokens would exceed 60k, drop oldest exchanges first

3. Update response shape:
   - Add conversation_id to SSE done event: { type: "done", conversation_id: "..." }

4. Frontend:
   - Store conversation_id in React state after first response
   - Send it on subsequent questions
   - Add a "New conversation" button that clears state
```

---

## Phase 4 — Intercom Integration

### P4-01 — Intercom OAuth
- [ ]
```
Build Intercom OAuth integration. Follow CLAUDE.md. Security-critical code — be exact.

1. New migration:
   - integrations table: id, organization_id, provider (enum: intercom|zendesk|slack), access_token_encrypted (text), refresh_token_encrypted (text), workspace_id, workspace_name, scopes (text[]), installed_at, expires_at

2. backend/src/services/integrations/crypto.ts
   - encryptToken(token: string): string  — AES-256-GCM, key from env ENCRYPTION_KEY (32-byte hex)
   - decryptToken(encrypted: string): string
   - Add ENCRYPTION_KEY to env.ts validation and .env.example

3. backend/src/routes/integrations/intercom.ts
   - GET /api/integrations/intercom/connect
     - Generates and stores state param (csrf protection) in Redis with 10min TTL
     - Redirects to Intercom OAuth URL with client_id, redirect_uri, state, scopes
   - GET /api/integrations/intercom/callback
     - Validates state param against Redis
     - Exchanges code for access_token via Intercom API
     - Encrypts and stores token in integrations table
     - Redirects to frontend /admin?connected=intercom

4. Add INTERCOM_CLIENT_ID, INTERCOM_CLIENT_SECRET, INTERCOM_REDIRECT_URI to env.ts + .env.example

Do not store unencrypted tokens anywhere. Show me the crypto.ts file when done.
```

---

### P4-02 — Intercom Webhook + Historical Import
- [ ]
```
Build Intercom webhook listener and historical ticket import. Follow CLAUDE.md.

1. backend/src/routes/integrations/intercom-webhook.ts
   - POST /api/webhooks/intercom
   - Verify Intercom webhook signature (HMAC-SHA256 against INTERCOM_WEBHOOK_SECRET)
   - Reject unsigned requests with 401
   - Handle event: conversation.user.created
     - Extract conversation ID, user message, conversation URL
     - Enqueue a BullMQ job: { type: 'intercom_new_conversation', orgId, conversationId }
   - Return 200 immediately (Intercom requires fast response)

2. backend/src/jobs/webhook.ts
   - Worker for intercom_new_conversation:
     - Fetch full conversation from Intercom API
     - Run retrieval pipeline on latest user message
     - Store draft answer in a new table: draft_replies (id, org_id, integration_id, external_conversation_id, question, answer, citations, status: pending|approved|sent|dismissed, created_at)

3. backend/src/jobs/ingestion.ts — add new job type:
   - historical_import: { orgId, integrationId, cursor? }
   - Fetches conversations from Intercom API (paginated)
   - Extracts text from each conversation
   - Chunks + embeds + stores (reuses ingestion pipeline)
   - Enqueues next page as a new job until cursor exhausted
   - Tracks progress in documents table (one document per conversation batch)

4. backend/src/routes/integrations/intercom.ts — add:
   - POST /api/integrations/intercom/import  — triggers historical import job
   - GET /api/integrations/intercom/drafts  — returns pending draft replies for the org

Add INTERCOM_WEBHOOK_SECRET to env.ts + .env.example.
```

---

### P4-03 — Draft Reply UI
- [ ]
```
Build the draft reply management UI in the admin dashboard. Follow CLAUDE.md frontend rules.

Add "Draft Replies" tab to AdminPage:

1. frontend/src/hooks/useDraftReplies.ts
   - TanStack Query: fetch GET /api/integrations/intercom/drafts
   - Mutations: approve draft (PATCH /api/integrations/intercom/drafts/:id/approve), dismiss draft

2. frontend/src/components/DraftReplyCard.tsx
   - Shows: original question, generated answer, citations
   - "Approve & Send" button → calls approve mutation → shows confirmation
   - "Dismiss" button
   - Editable answer text (user can edit before approving)
   - Citation list with expand/collapse

3. backend — add endpoints:
   - PATCH /api/integrations/intercom/drafts/:id/approve
     - Marks draft as approved
     - Posts the answer as a reply to the Intercom conversation via API
     - Marks as sent
   - PATCH /api/integrations/intercom/drafts/:id/dismiss — marks dismissed

4. Feedback capture:
   - Thumbs up/down on each sent reply
   - POST /api/integrations/intercom/drafts/:id/feedback { rating: 1 | -1 }
   - Stores in a feedback table: id, draft_reply_id, org_id, rating, created_at
   - Positive feedback → create eval entry automatically

Add feedback table to schema and migration.
```

---

## Phase 5 — Billing + Self-Serve

### P5-01 — Stripe Billing
- [ ]
```
Integrate Stripe billing. Follow CLAUDE.md. Financial code — be exact.

1. New migration:
   - subscriptions table: id, organization_id, stripe_customer_id, stripe_subscription_id, plan (enum: starter|growth|scale|free), status (active|past_due|canceled|trialing), current_period_end, query_limit_monthly, created_at, updated_at
   - usage_events table: id, organization_id, event_type (query|ingestion), quantity, recorded_at (for Stripe usage reporting)

2. backend/src/services/billing.ts
   - createCustomer(org): Promise<string>  — creates Stripe customer, stores stripe_customer_id
   - createSubscription(orgId, plan): Promise<void>
   - recordUsage(orgId, quantity): Promise<void>  — reports to Stripe metered billing
   - checkQueryLimit(orgId, db): Promise<{ allowed: boolean, used: number, limit: number }>

3. backend/src/routes/billing.ts
   - POST /api/billing/subscribe  — create subscription for org
   - GET /api/billing/usage  — return current usage vs limit
   - POST /api/webhooks/stripe  — Stripe webhook handler
     - Verify Stripe signature
     - Handle: customer.subscription.updated, customer.subscription.deleted, invoice.payment_failed
     - Update subscriptions table on each event

4. Update ask endpoint:
   - Before processing: call checkQueryLimit
   - If not allowed: return 429 with message "Monthly query limit reached. Upgrade your plan."
   - After processing: call recordUsage(orgId, 1)

Add STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_IDS_STARTER, STRIPE_PRICE_IDS_GROWTH, STRIPE_PRICE_IDS_SCALE to env.ts + .env.example.
```

---

### P5-02 — Self-Serve Onboarding
- [ ]
```
Build self-serve signup and onboarding flow. Follow CLAUDE.md frontend rules.

1. frontend/src/pages/OnboardingPage.tsx
   Steps (wizard):
   1. Create account: org name input + email → POST /api/onboarding/start → creates org, sends email with API key
   2. Connect source: choice of "Paste URL" or "Connect Intercom"
      - Paste URL: URL input → POST /api/ingest → show status polling
      - Connect Intercom: button → redirect to /api/integrations/intercom/connect
   3. Ask first question: inline chat UI, pre-filled with a suggested question based on the ingested URL title
   4. Done: show the API key (once), link to API docs, link to admin dashboard

2. backend/src/routes/onboarding.ts
   - POST /api/onboarding/start
     - Creates org
     - Generates API key (shown once in response)
     - Sends welcome email via Resend/Postmark (use RESEND_API_KEY env var)
     - Returns { orgId, apiKey (shown once only), expiresAt: null }

3. Add RESEND_API_KEY to env.ts + .env.example.

Route /onboarding → OnboardingPage in router.
Redirect to /chat after step 4.
```

---

## Phase 6 — Auto-Resolve + Analytics

### P6-01 — Confidence Scoring + Auto-Resolve
- [ ]
```
Add confidence scoring so high-confidence answers can auto-send. Follow CLAUDE.md.

1. backend/src/services/retrieval/confidence.ts
   - computeConfidence(params: { rrfTopScore, rerankerTopScore, answerContainsIDontKnow, retrievedChunksCount }): number
   - Returns score 0–1
   - Low confidence signals: top RRF score < threshold, reranker score < threshold, answer triggered "I don't know"
   - Thresholds from config (env vars: CONFIDENCE_THRESHOLD_AUTO_SEND default 0.85)

2. Update ask endpoint:
   - Compute confidence after reranking
   - Include in response: SSE done event gets { type: "done", confidence: 0.92, conversation_id }

3. Update draft reply flow (Intercom):
   - If confidence > CONFIDENCE_THRESHOLD_AUTO_SEND:
     - Skip draft_replies table
     - Send reply to Intercom immediately
     - Log: { event: 'auto_resolved', orgId, conversationId, confidence }
   - Else: create draft as before (human review)

4. Add CONFIDENCE_THRESHOLD_AUTO_SEND to env.ts + .env.example.

5. Update eval runner to report average confidence score per question.
```

---

### P6-02 — Analytics Dashboard
- [ ]
```
Build the analytics dashboard page. Follow CLAUDE.md frontend rules.

backend/src/routes/analytics.ts — GET /api/analytics/summary
Returns (scoped to org, date range from query params):
- total_queries
- auto_resolved_count
- deflection_rate (auto_resolved / total_queries)
- avg_latency_ms
- total_cost_usd_cents
- top_unanswered_questions: top 10 questions where answer hit "I don't know"
- queries_over_time: daily counts for the period
- avg_confidence_score

frontend/src/pages/AnalyticsPage.tsx:
- Date range picker (last 7d / 30d / 90d)
- KPI cards: Total Queries, Deflection Rate, Avg Latency, Total Cost
- Line chart: queries per day (use recharts — add dependency)
- Table: top unanswered questions
- All data from TanStack Query, refetched when date range changes
- Loading skeleton on initial load

Add /analytics route to router.
Add Analytics link to admin nav.
```

---

## Ongoing / Cross-Cutting

### OC-01 — Security Review
- [ ]
```
Run /security-review on the current branch before any public release.
Focus areas:
- API key handling (hash comparison timing attacks)
- Webhook signature verification (intercom + stripe)
- Token encryption at rest (integrations table)
- Org scoping — verify no query can leak cross-org data
- Rate limiting — confirm limits are enforced per-org, not globally
- Input validation — all Zod schemas reject unexpected fields (use .strict())
- SSE endpoint — confirm it doesn't leak org data in error events
```

---

### OC-02 — Performance Baseline
- [ ]
```
Establish performance baseline and fix p95 bottlenecks. Follow CLAUDE.md.

1. Add timing spans to the ask endpoint (Sentry transactions):
   - span: embed_question
   - span: vector_search
   - span: bm25_search
   - span: rrf_fusion
   - span: rerank
   - span: llm_first_token (time to first SSE delta)
   - span: llm_total

2. Run 20 sequential test queries against the ask endpoint, log each span's duration.

3. Identify the slowest span. If it is:
   - embed_question: cache the embedding for identical questions (Redis, 1hr TTL)
   - vector_search: add HNSW index to chunks.embedding (pgvector)
   - rerank: reduce topK from vector search to lower Cohere input count
   - llm_first_token: check if prompt caching is hitting (cache_read_tokens > 0)

4. After fixes, confirm p95 latency (time to first token) < 2s.
   Document results in a comment at the top of backend/src/routes/ask.ts.
```

---

### OC-03 — Simplify Pass
- [ ]
```
Run /simplify on the following files after Phase 3 is complete:
- backend/src/routes/ask.ts
- backend/src/services/retrieval/
- backend/src/services/llm.ts

Look for: duplicate logic, functions that do too much, any type, missing error handling, inconsistent retry patterns.
Fix what you find. Do not refactor what is already clean.
```

---

### OC-04 — Eval Expansion
- [ ]
```
Expand eval set after each phase. Follow CLAUDE.md.

After Phase 1: 10 questions (already seeded in P2-03)
After Phase 2: add 20 more questions. Total: 30.
After Phase 3: add 70 more questions. Total: 100. Include:
  - 20 questions with confident answers from corpus
  - 20 questions that should trigger "I don't know"
  - 20 multi-turn follow-up questions (requires conversation_id)
  - 20 questions from design partner's real ticket history
After Phase 4: add 50 from Intercom ticket history. Total: 150.

Current eval file: backend/src/evals/questions.json
Runner: pnpm eval

After expanding, run evals and commit report.json with the results.
```

---

## Notes

- Each prompt above = one Claude Code session.
- Don't start next prompt until current integration tests pass.
- Run `pnpm eval` after every Phase 3+ change. Commit report.json.
- Run `/security-review` before Phase 4 ships (OC-01).
- Run `/simplify` after Phase 3 (OC-03).
- Run `/caveman-commit` when writing commit messages.
