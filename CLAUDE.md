# CLAUDE.md

> Project context file for Claude Code and other AI coding assistants.
> Keep this updated as the project evolves.

---

## 1. Project overview

**Name:** SupportPilot (working title)

**What it is:** A RAG-powered customer support automation platform for mid-market SaaS companies (50–500 employees).

**Problem we solve:**
- Mid-market SaaS teams drown in repetitive support tickets
- ~70% of incoming questions are already answered somewhere (docs, past tickets, Slack, GitHub)
- New support hires take weeks to ramp; customers wait hours for answers that already exist
- Hiring more humans doesn't scale; existing chatbots are too dumb

**What we build:**
1. **Knowledge dashboard** — where the customer connects their tools, uploads docs, and curates what the AI knows
2. **Agent copilot** — drafts replies inside Zendesk/Intercom for human agents to approve
3. **Auto-resolver** — handles high-confidence Tier 1 tickets directly (chat widget, email, Slack)
4. **Internal copilot** — Slack bot for the support team to query the knowledge base

**Target user:** Head of Support / Support Ops at a 50–500 person SaaS company. Tech-comfortable but not engineers.

---

## 2. Core principles

- **Customer owns the knowledge.** The customer adds, edits, and removes everything. We never touch their content without permission.
- **Retrieval quality > model size.** A great retriever with a small model beats a tiny retriever with GPT-4. Invest accordingly.
- **Humans in the loop until proven safe.** Default mode is "draft for agent." Auto-resolve only with strong confidence signals + escape hatches.
- **Every answer is traceable.** The AI must always show which document(s) it pulled from. No black-box answers, ever.
- **Free / open-source first.** No premium SaaS dependencies during development. Every component must have a free self-hostable path.
- **No Docker. No Redis. No Postgres.** Native installs only. MongoDB is the single datastore.
- **Multi-tenant from day one.** Every document, vector, and query carries a `tenantId`. Never trust application code alone — enforce at the data layer.
- **Build the eval harness before scaling features.** If we can't measure quality, we can't improve it.
- **Seed data for everything.** Every feature must be runnable locally with one command — `npm run seed` then `npm run dev`. No "works on my machine."

---

## 3. Tech stack

### Runtime
- **Node.js** 20 LTS
- **Express** (REST API)
- **TypeScript** (strict mode)

### Frontend (admin dashboard + chat widget)
- **React** + **Vite**
- **TanStack Query** for data fetching
- **Tailwind CSS** for styling
- **shadcn/ui** for components
- **react-dropzone** for file uploads

### Data layer
- **MongoDB** Community Edition (native install, no Docker)
- **Mongoose** ODM
- **TTL indexes** for cache entries
- **Change streams** for pub/sub and reactive workers

### Validation & types
- **Zod** for runtime validation and schema-derived TypeScript types

### Job queue
- **Agenda** (MongoDB-backed) — scheduling, retries, concurrency
- `node-cron` for simple periodic tasks (re-crawls)

### Caching
- **`lru-cache`** for in-process hot caches
- **MongoDB TTL collections** for shared/persistent cache (embedding cache, response cache)

### Rate limiting
- **`express-rate-limit`** (in-memory store for dev; swap to a Mongo store later if needed)

### Ingestion
- **Crawlee** (Node-native web crawler) for help center sites
- Native SDKs for Zendesk, Intercom, GitHub (Octokit), Notion, Slack, Confluence
- **`pdf-parse`**, **`mammoth`** (.docx), **`cheerio`** (HTML), **`turndown`** (HTML → markdown), **`xlsx`** (spreadsheets) for parsing
- **`multer`** for handling file uploads
- **`faster-whisper`** Python script invoked via `child_process` for audio transcription (only if customer ships call recordings)

### File storage
- Local filesystem during dev (`./data/uploads/<tenantId>/...`)
- **MinIO** or S3-compatible storage in production (swap behind a `FileStorage` interface)

### Vector & search
- **Qdrant** (native binary from GitHub releases) — vector storage
- **Meilisearch** (native binary) — keyword search (BM25-style)
- Hybrid retrieval: query both, fuse with Reciprocal Rank Fusion (RRF), then rerank

### Embeddings & rerankers (local)
- **`@xenova/transformers`** (Transformers.js, ONNX) — runs models in pure Node, no Python
  - Embeddings: `Xenova/bge-small-en-v1.5` (fast, good quality)
  - Reranker: `Xenova/bge-reranker-base`
- Cached aggressively in MongoDB by content hash

### LLM
- **Ollama** (native install) running `llama3.1:8b` and `qwen2.5:7b` for local dev
- **Groq** free tier for hosted Llama (fast, generous quota) — used in staging
- **Gemini Flash** free tier as backup
- All access through a single `LLMClient` interface — swap providers via env var

### Channels
- **Zendesk Apps Framework** (agent sidebar UI)
- **Slack Bolt for JavaScript** (internal copilot + notifications)
- **`nodemailer`** + **`imapflow`** (email channel)
- **React** chat widget (self-built, embeddable script tag)

### Auth & multi-tenancy
- **Auth.js (NextAuth)** with MongoDB adapter for app users
- **Keycloak** (native install) for enterprise SSO/SAML when needed
- Every Mongo doc carries `tenantId`; every Qdrant point has `tenantId` in payload; all queries filter by it
- Per-tenant API keys for inbound webhooks

### Observability & eval
- **Pino** for structured logging
- **Langfuse** self-hosted (run from source) for LLM tracing — every retrieval and generation logged
- **Ragas** (Python, run as separate eval script) for RAG metrics
- **GlitchTip** for error tracking
- **Grafana Cloud** free tier for metrics dashboards

### Security
- **`compromise`** + regex for basic PII redaction in dev
- **Presidio** as a Python sidecar HTTP service when production-grade redaction is needed
- TLS everywhere; secrets in `.env` (dev) and a real secret manager later
- All LLM calls log redacted versions of inputs

### Testing & seeding
- **Vitest** for unit + integration tests
- **mongodb-memory-server** for isolated test DBs
- **Faker** (`@faker-js/faker`) for realistic seed data
- Custom seeder CLI (`npm run seed`) — see Section 12

### Hosting
- Local dev: native processes managed by **PM2** (`pm2 start ecosystem.config.js`)
- Online dev: **Fly.io** or **Render** free tiers
- Self-host: **Oracle Cloud Free Tier** ARM VM (24 GB RAM, genuinely free)

---

## 4. Architecture

```
┌────────────────────────────────────────────────────────────────┐
│  Customer admin (browser)                                      │
│   ┌──────────────────────────────────────────────────────┐    │
│   │  Knowledge dashboard:                                 │    │
│   │  • Connect Zendesk / Notion / Slack / Confluence...   │    │
│   │  • Upload PDFs, Word docs, spreadsheets               │    │
│   │  • Paste text snippets                                │    │
│   │  • Browse / search / remove docs                      │    │
│   │  • Toggle "internal only" vs "customer-facing"        │    │
│   │  • View AI answer history with citations              │    │
│   └──────────────────────────────────────────────────────┘    │
└────────────────────────┬───────────────────────────────────────┘
                         │
┌────────────────────────┴───────────────────────────────────────┐
│  Channels: Zendesk | Slack | Chat Widget | Email               │
└────────────────────────┬───────────────────────────────────────┘
                         │ webhooks / API calls
                         ▼
┌────────────────────────────────────────────────────────────────┐
│           Express API  (auth, tenant routing)                  │
└──────────────────┬─────────────────────────────────────────────┘
                   │
        ┌──────────┴──────────┐
        ▼                     ▼
┌───────────────┐    ┌─────────────────────┐
│  Agenda jobs  │    │  RAG pipeline       │
│  (ingest      │    │  ┌────────────────┐ │
│   uploads,    │    │  │ 1. Rewrite Q   │ │
│   re-crawl,   │    │  │ 2. Hybrid      │ │
│   transcribe) │    │  │    retrieve    │ │
└──────┬────────┘    │  │ 3. Rerank      │ │
       │             │  │ 4. Generate    │ │
       ▼             │  │ 5. Cite + check│ │
┌───────────────┐    │  └────────┬───────┘ │
│ Parsers       │    └───────────┼─────────┘
│ Chunkers      │                │
│ Embedders     │                │
└──────┬────────┘                │
       ▼                         ▼
┌──────────────┐  ┌───────────┐  ┌─────────┐
│   Qdrant     │  │Meilisearch│  │ Ollama  │
│  (vectors)   │  │ (keyword) │  │  /Groq  │
└──────────────┘  └───────────┘  └─────────┘
       │                ▲
       └────────┬───────┘
                ▼
        ┌──────────────────────┐
        │   MongoDB            │  tenants, users, sources,
        │  (single source      │  documents, chunks, tickets,
        │   of truth)          │  drafts, feedback, jobs,
        │                      │  eval results, cache, audit
        └──────────────────────┘
                ▲
                │
        ┌───────┴────────┐
        │ File storage   │  uploaded PDFs, docx, etc.
        │ (filesystem    │
        │  → MinIO/S3)   │
        └────────────────┘
```

---

## 5. Knowledge management (the admin dashboard)

This is the customer-facing control center. Everything in the AI's "brain" comes from here.

### What customers can do

**Add knowledge — three ways:**

1. **Connectors** — one-click OAuth to pull from existing tools. Initial set:
   - Zendesk (help center articles + past tickets + macros)
   - Intercom (articles + conversations)
   - Notion (pages + databases)
   - Confluence
   - Google Drive (folders)
   - GitHub (issues + wikis + READMEs)
   - Slack (selected channels)
   - Public help-center URL (auto-crawled)

2. **File uploads** — drag-and-drop area. Supported: PDF, DOCX, TXT, MD, HTML, CSV/XLSX. Max 50 MB per file, configurable per tenant.

3. **Paste text** — a "quick add" textarea for snippets like "Our refund policy is 30 days..."

**Curate knowledge:**
- Search across all docs
- Filter by source, date, visibility, tags
- View any document's full content + which chunks the AI sees
- Remove a document (vectors and search index are purged immediately)
- Bulk operations (delete all, re-index, change visibility)

**Control visibility:**
- `customer-facing` — AI may use this when answering end users
- `internal` — AI may use this only when helping support agents (e.g. internal escalation playbooks)
- `draft` — uploaded but not yet active (manual review before going live)

**See what the AI is doing:**
- Live feed of every question asked + the answer + which docs were cited
- Filter by "auto-resolved" vs "drafted for agent"
- Click any answer → see ranked retrieval results + reranker scores
- Thumb up/down + free-text feedback on any answer

**Trust & safety:**
- "Forget" button on any document — removes it from vectors, search, cache, and active conversations
- Export all data (GDPR-friendly)
- Audit log of who added/removed what

### Visibility rules (enforced server-side)

- **Customer-facing answers** (chat widget, email, auto-resolve): retriever filters to `visibility: "customer-facing"` only
- **Internal copilot** (agent sidebar, Slack bot): retriever may use both `customer-facing` and `internal`
- **`draft` docs**: never used by retriever until promoted to active

---

## 6. Folder structure

```
supportpilot/
├── CLAUDE.md                      # this file
├── README.md
├── package.json
├── tsconfig.json
├── ecosystem.config.js            # PM2
├── .env.example
├── .nvmrc                         # node 20
│
├── src/
│   ├── index.ts                   # Express bootstrap
│   ├── config/
│   │   ├── env.ts                 # Zod-validated env vars
│   │   └── constants.ts
│   │
│   ├── api/                       # HTTP layer
│   │   ├── middleware/
│   │   │   ├── auth.ts
│   │   │   ├── tenant.ts          # extracts + enforces tenantId
│   │   │   ├── rateLimit.ts
│   │   │   └── errorHandler.ts
│   │   ├── routes/
│   │   │   ├── admin/             # admin dashboard endpoints
│   │   │   │   ├── sources.ts     # list/create/delete connectors
│   │   │   │   ├── uploads.ts     # POST /uploads (multer)
│   │   │   │   ├── documents.ts   # browse/search/delete
│   │   │   │   ├── visibility.ts  # toggle internal/customer-facing
│   │   │   │   └── activity.ts    # answer history feed
│   │   │   ├── ingest.ts          # internal trigger for ingestion jobs
│   │   │   ├── query.ts           # POST /query (the main RAG endpoint)
│   │   │   ├── tickets.ts         # webhooks from Zendesk etc
│   │   │   ├── chat.ts            # widget endpoint
│   │   │   ├── feedback.ts        # thumbs / agent edits
│   │   │   └── auth.ts
│   │   └── validators/            # Zod schemas per route
│   │
│   ├── domain/                    # business logic, no I/O
│   │   ├── rag/
│   │   │   ├── pipeline.ts        # orchestrates the 5 steps
│   │   │   ├── queryRewriter.ts
│   │   │   ├── retriever.ts       # hybrid + visibility filtering
│   │   │   ├── reranker.ts
│   │   │   ├── generator.ts
│   │   │   └── confidence.ts      # decides auto-resolve vs draft
│   │   ├── ingestion/
│   │   │   ├── uploadHandler.ts   # processes uploaded files
│   │   │   ├── pasteHandler.ts    # processes pasted text
│   │   │   ├── chunker.ts
│   │   │   ├── connectors/
│   │   │   │   ├── base.ts        # Connector interface
│   │   │   │   ├── zendesk.ts
│   │   │   │   ├── intercom.ts
│   │   │   │   ├── notion.ts
│   │   │   │   ├── github.ts
│   │   │   │   ├── confluence.ts
│   │   │   │   ├── googleDrive.ts
│   │   │   │   ├── slack.ts
│   │   │   │   └── webCrawler.ts
│   │   │   └── parsers/
│   │   │       ├── pdf.ts
│   │   │       ├── docx.ts
│   │   │       ├── html.ts
│   │   │       ├── markdown.ts
│   │   │       └── spreadsheet.ts
│   │   ├── knowledge/
│   │   │   ├── documentService.ts # add/remove/search docs
│   │   │   └── purgeService.ts    # forget = clean vectors + search + cache
│   │   └── tenancy/
│   │       └── tenantScope.ts
│   │
│   ├── infra/                     # external service clients
│   │   ├── mongo/
│   │   │   ├── client.ts
│   │   │   └── models/
│   │   │       ├── Tenant.ts
│   │   │       ├── User.ts
│   │   │       ├── Source.ts
│   │   │       ├── Document.ts
│   │   │       ├── Chunk.ts
│   │   │       ├── Ticket.ts
│   │   │       ├── Conversation.ts
│   │   │       ├── Draft.ts
│   │   │       ├── Feedback.ts
│   │   │       ├── EvalRun.ts
│   │   │       └── AuditLog.ts
│   │   ├── qdrant/
│   │   │   └── client.ts
│   │   ├── meilisearch/
│   │   │   └── client.ts
│   │   ├── llm/
│   │   │   ├── client.ts          # unified interface
│   │   │   ├── ollama.ts
│   │   │   ├── groq.ts
│   │   │   └── gemini.ts
│   │   ├── embeddings/
│   │   │   └── transformers.ts
│   │   ├── reranker/
│   │   │   └── transformers.ts
│   │   ├── storage/
│   │   │   ├── index.ts           # FileStorage interface
│   │   │   ├── localFs.ts         # local filesystem impl
│   │   │   └── minio.ts           # MinIO/S3 impl
│   │   └── channels/
│   │       ├── zendesk.ts
│   │       ├── slack.ts
│   │       └── email.ts
│   │
│   ├── jobs/                      # Agenda definitions
│   │   ├── index.ts
│   │   ├── ingestSource.ts        # connector sync
│   │   ├── ingestUpload.ts        # uploaded file processing
│   │   ├── recrawl.ts
│   │   ├── reembed.ts
│   │   └── purgeDocument.ts       # full "forget" flow
│   │
│   ├── observability/
│   │   ├── logger.ts
│   │   ├── tracing.ts
│   │   └── metrics.ts
│   │
│   └── utils/
│       ├── hash.ts
│       ├── redact.ts
│       └── retry.ts
│
├── web/                           # admin dashboard (React + Vite)
│   ├── package.json
│   ├── vite.config.ts
│   └── src/
│       ├── App.tsx
│       ├── pages/
│       │   ├── Dashboard.tsx
│       │   ├── Sources.tsx        # connectors page
│       │   ├── Upload.tsx         # drag-drop upload
│       │   ├── Documents.tsx      # browse/search/delete
│       │   ├── Activity.tsx       # answer history + citations
│       │   ├── Settings.tsx
│       │   └── Login.tsx
│       ├── components/
│       │   ├── DropZone.tsx
│       │   ├── DocumentRow.tsx
│       │   ├── CitationCard.tsx
│       │   ├── VisibilityToggle.tsx
│       │   └── AnswerFeed.tsx
│       └── api/
│           └── client.ts          # typed API client
│
├── widget/                        # embeddable chat widget (separate build)
│   ├── package.json
│   └── src/
│
├── scripts/
│   ├── seed/                      # see Section 12
│   │   ├── index.ts               # main seeder CLI
│   │   ├── tenants.ts
│   │   ├── users.ts
│   │   ├── sources.ts
│   │   ├── documents.ts
│   │   ├── tickets.ts
│   │   ├── conversations.ts
│   │   └── fixtures/
│   │       ├── help-articles/     # sample PDFs, docs
│   │       ├── tickets.json
│   │       └── slack-threads.json
│   ├── eval/
│   │   ├── runEval.ts
│   │   ├── ragas_eval.py
│   │   └── golden_set.jsonl
│   ├── reset.ts                   # wipe everything for a clean start
│   └── transcribe.py
│
├── docs/
│   ├── architecture.md
│   ├── multi-tenancy.md
│   ├── eval-methodology.md
│   ├── seeding.md
│   └── deployment.md
│
└── tests/
    ├── unit/
    └── integration/
```

---

## 7. Data model (MongoDB)

Key collections. Every document has `tenantId`, `createdAt`, `updatedAt`.

- **`tenants`** — `{ _id, name, plan, settings, apiKeys[], autoResolveEnabled, confidenceThreshold }`
- **`users`** — app users (support agents, admins). `{ tenantId, email, role, name }`
- **`sources`** — where knowledge comes from. `{ tenantId, type: "connector"|"upload"|"paste"|"crawl", subtype: "zendesk"|"notion"|..., config, lastSyncedAt, status, addedBy }`
- **`documents`** — raw ingested docs. Fields:
  ```
  {
    tenantId,
    sourceId,
    sourceType: "connector" | "upload" | "paste" | "crawl",
    externalId,                  // for connector docs
    fileKey,                     // for uploads (path in storage)
    fileMimeType,
    title,
    url,
    content,                     // extracted text
    contentHash,
    visibility: "customer-facing" | "internal" | "draft",
    tags: [string],
    metadata,
    addedBy,                     // userId
    status: "processing" | "ready" | "failed" | "purged",
    processingError
  }
  ```
- **`chunks`** — split units (vectors live in Qdrant, metadata here). `{ tenantId, documentId, text, position, qdrantPointId, visibility }` (visibility duplicated for fast filtering)
- **`tickets`** — incoming support requests. `{ tenantId, channel, externalId, customer, subject, body, status, conversationId }`
- **`conversations`** — multi-turn threads. `{ tenantId, ticketId, messages[], confidenceScores[] }`
- **`drafts`** — AI-generated drafts. `{ tenantId, ticketId, text, citations[], confidence, route, agentEdits, sentAt }`
  - `citations: [{ documentId, chunkId, score, snippet }]` — always populated
- **`feedback`** — `{ tenantId, draftId, type: "thumbs"|"edit"|"rating", payload, userId }`
- **`embeddingCache`** — `{ contentHash, model, vector, expiresAt }` (TTL index)
- **`responseCache`** — `{ tenantId, queryHash, response, expiresAt }` (TTL index)
- **`jobs`** — Agenda's collection
- **`evalRuns`** — `{ goldenSetVersion, metrics, results[], commitSha, createdAt }`
- **`auditLogs`** — `{ tenantId, actor, action, target, before, after }` — append-only

**Indexes (essentials):**
- All `tenantId` fields indexed
- `documents`: `(tenantId, sourceId, externalId)` unique; `contentHash`; `(tenantId, visibility)` for retrieval filtering
- `chunks`: `(tenantId, documentId)`; `(tenantId, visibility)`; `qdrantPointId`
- `tickets`: `(tenantId, channel, externalId)` unique
- `embeddingCache`: TTL on `expiresAt`
- `responseCache`: TTL on `expiresAt`

---

## 8. The RAG pipeline (the core)

```ts
async function answer(query: Query, ctx: TenantContext): Promise<Answer> {
  // 1. Rewrite — expand acronyms, resolve "it"/"this", extract intent
  const rewritten = await queryRewriter.rewrite(query, ctx.recentMessages);

  // 2. Hybrid retrieve — vector + keyword, fused with RRF
  // CRITICAL: visibility filter depends on caller
  //   - end-user channels: visibility = "customer-facing" only
  //   - agent / internal:  visibility in ["customer-facing", "internal"]
  const visibilityFilter = ctx.audience === "end-user"
    ? ["customer-facing"]
    : ["customer-facing", "internal"];

  const [vectorHits, keywordHits] = await Promise.all([
    qdrant.search(rewritten.embedding, {
      tenantId: ctx.tenantId,
      visibility: visibilityFilter,
      limit: 30,
    }),
    meilisearch.search(rewritten.text, {
      tenantId: ctx.tenantId,
      visibility: visibilityFilter,
      limit: 30,
    }),
  ]);
  const fused = reciprocalRankFusion(vectorHits, keywordHits, { k: 60 });

  // 3. Rerank — cross-encoder for top-30 → top-6
  const reranked = await reranker.rerank(rewritten.text, fused.slice(0, 30));
  const context = reranked.slice(0, 6);

  // 4. Generate — with strict citation format
  const draft = await llm.generate({
    system: SUPPORT_PROMPT,
    context,
    query: rewritten.text,
    history: ctx.recentMessages,
  });

  // 5. Confidence — decide route
  const confidence = scoreConfidence({
    retrievalScores: reranked.map(r => r.score),
    citationCoverage: draft.citations.length,
    llmSelfReport: draft.confidence,
  });

  return {
    text: draft.text,
    citations: draft.citations,        // always populated, shown in UI
    confidence,
    route: confidence > ctx.tenant.confidenceThreshold ? "auto" : "draft",
  };
}
```

**Non-negotiables:**
- Every claim in the response must cite at least one chunk. Uncited claims → reject and regenerate or escalate.
- Every answer in the admin Activity feed shows the cited documents (clickable).
- The system prompt forbids inventing API names, version numbers, or pricing.
- If retrieval returns nothing useful, the model must say so and escalate, never bluff.

---

## 9. Multi-tenancy rules

These are the rules that, if broken, cause data leaks. Treat them like prod outages.

1. **Every Mongo query includes `tenantId`.** Use a Mongoose plugin that injects it. Code review blocks any raw query without it.
2. **Qdrant uses payload filtering on `tenantId` AND `visibility`.** Never query without both filters.
3. **Meilisearch uses one index per tenant** (`docs_${tenantId}`) — simpler than filtering and prevents cross-tenant bleed. Visibility is a filter inside that index.
4. **LLM context is built from one tenant's chunks only.** Asserted at the retriever boundary.
5. **File storage paths include tenantId** (`uploads/<tenantId>/<docId>/...`). Storage layer rejects cross-tenant reads.
6. **Embedding cache key includes content hash only** (not tenantId) — embeddings of "hello world" are the same for everyone, safe to share. Response cache key MUST include `tenantId`.
7. **Audit log every cross-tenant action by support staff.**

---

## 10. Phased roadmap

### Phase 0 — Foundation (Week 1–2)
- Repo scaffold, TypeScript, lint, format, env validation
- MongoDB models + tenant middleware
- Qdrant + Meilisearch running locally via PM2
- LLM client abstraction with Ollama + Groq backends
- Embeddings via Transformers.js, with Mongo cache
- **Seeder skeleton** — creates a demo tenant + admin user
- Smoke tests end-to-end

### Phase 1 — Knowledge management MVP (Week 3–5)
- File upload endpoint + processing pipeline (PDF/DOCX/TXT/MD)
- Paste-text endpoint
- Web crawler (Crawlee) for public help docs
- Chunker + embedder + Qdrant + Meilisearch indexing
- Admin dashboard pages: Upload, Documents (browse/search/delete), Sources
- Visibility toggle (customer-facing / internal / draft)
- "Forget" flow: removes from vectors, search, cache, marks doc purged
- **Seeder expanded**: sample PDFs, articles, paste snippets

### Phase 2 — Retrieval + first connector (Week 6–7)
- Hybrid retrieval (Qdrant + Meilisearch + RRF + reranker)
- Visibility filtering enforced
- Zendesk connector (tickets + macros + help articles)
- Quality eyeball test on 50 real questions
- **Seeder**: realistic Zendesk fixtures (tickets, articles, macros)

### Phase 3 — Agent copilot + activity feed (Week 8–10)
- Zendesk Apps Framework sidebar
- `/query` endpoint generating drafts with citations
- Activity feed in admin dashboard (every Q+A with citations)
- Capture agent edits as feedback
- Langfuse tracing wired up
- Demo to first design partner

### Phase 4 — Eval harness (Week 11–12)
- Golden set: 200 real Q+A pairs from design partner
- Ragas metrics: faithfulness, answer relevance, context precision
- CI job that runs eval on every PR
- Dashboard for retrieval-quality drift

### Phase 5 — More connectors + Slack copilot (Week 13–15)
- Notion, Confluence, GitHub, Google Drive, Slack history connectors
- Slack bot for the support team (`/ask` slash command)
- Re-crawl scheduling (Agenda jobs)

### Phase 6 — Auto-resolve + customer channels (Week 16–19)
- Confidence scorer + per-tenant threshold tuning
- Chat widget (React, embeddable)
- Email channel via IMAP/SMTP
- Escape-hatch UX: "this didn't help" → instant human handoff
- Per-tenant kill switch in admin

### Phase 7 — Agentic actions (later)
- Tool use: lookup customer, check entitlement, create Jira issue, reset API key
- Per-customer tool registry with permission boundaries
- Action audit log

---

## 11. Coding conventions

- **TypeScript strict mode.** No `any` without a comment explaining why.
- **Zod first.** Every external input (HTTP body, env var, third-party response) parsed through Zod. Types derived via `z.infer`.
- **Pure domain layer.** `src/domain/` has no I/O imports. All side effects live in `src/infra/`.
- **One responsibility per file.** If a file passes 300 lines, split it.
- **Errors are values.** Throw only for truly exceptional cases. Use Result-style returns for expected failures (retrieval miss, low confidence).
- **No console.log.** Use the Pino logger with structured fields.
- **Tests:** unit tests for `domain/`, integration tests for routes hitting `mongodb-memory-server`. Aim for confidence, not coverage percentage.
- **Commits:** conventional commits (`feat:`, `fix:`, `chore:`). Small PRs.
- **Secrets** never in code. `.env.example` lists every required var with placeholder values.
- **Every new feature ships with seed data** so it can be demoed locally.

---

## 12. Seeding (critical for development)

The seeder is **not optional** — every developer needs to run `npm run seed` and immediately have a working system to play with. Without rich seed data, you can't develop the admin dashboard, you can't test retrieval, and you can't demo to anyone.

### What the seeder creates

Running `npm run seed` produces:

**Tenants (3)**
- `acme-saas` — a fictional project management SaaS (primary demo tenant)
- `bytestore` — a fictional e-commerce platform (for testing multi-tenancy isolation)
- `internal` — used for internal eval

**Users (per tenant)**
- 1 admin (`admin@<tenant>.com` / password `demo1234`)
- 3 support agents (`agent1@...`, `agent2@...`, `agent3@...`)

**Sources & documents (for `acme-saas`)**
- ~30 help center articles (Markdown files in `scripts/seed/fixtures/help-articles/`)
- ~10 sample PDFs (product manual, pricing sheet, security whitepaper, etc.) — real-ish content, not lorem ipsum
- ~5 internal-only docs (escalation playbook, refund policy, on-call runbook)
- ~150 historical tickets with resolutions (synthesized but realistic)
- ~20 Slack threads (customer questions answered by team)
- 1 connected (mocked) Zendesk source with sync history

**Tickets in flight**
- ~25 open tickets in various stages (new, awaiting agent, drafted, auto-resolved, escalated)
- A mix of easy ("how do I export?") and hard ("integration with our SSO is failing intermittently")

**Conversations & feedback**
- ~50 completed conversations with citations
- Realistic distribution of thumbs up/down, agent edits, low-confidence escalations
- Some intentionally bad answers so the eval harness has signal

**Eval data**
- Golden set of 50 Q+A pairs in `scripts/eval/golden_set.jsonl` (versioned, expanded over time)

### Seeder commands

```bash
npm run seed              # full seed (idempotent — safe to re-run)
npm run seed:tenant acme  # seed just one tenant
npm run seed:reset        # wipe everything, then full seed
npm run seed:fresh        # wipe + seed + re-embed everything
```

### Seeder structure

```
scripts/seed/
├── index.ts              # CLI entrypoint; orchestrates the rest
├── tenants.ts            # creates tenants
├── users.ts              # creates users with hashed passwords
├── sources.ts            # creates source rows
├── documents.ts          # ingests fixtures: parses, chunks, embeds, indexes
├── tickets.ts            # creates tickets + conversations
├── feedback.ts           # creates realistic feedback distribution
└── fixtures/
    ├── help-articles/    # *.md files — real product help content
    ├── pdfs/             # *.pdf files
    ├── tickets.json      # ticket templates
    ├── slack-threads.json
    └── golden-questions.jsonl
```

### Rules for the seeder

- **Idempotent.** Running it twice leaves the same state. Use `upsert` everywhere.
- **Fast.** The whole seed must finish in under 60 seconds on a laptop. Embed in batches, parallelize where safe.
- **Realistic.** Use real-sounding product names, real-sounding tickets. Lorem ipsum makes retrieval evaluation worthless.
- **Deterministic.** Faker seed is fixed (`faker.seed(42)`) so two developers get the same data.
- **Safe.** Refuses to run against any database whose URI doesn't include the word `dev`, `test`, or `local`. Hard guard against wiping prod.
- **Composable.** Each seeder file exports a function so tests can call them individually.

### Test fixtures vs. seed data

- **Seed data** = what `npm run seed` creates for manual dev/demo.
- **Test fixtures** = small, focused setups used inside `vitest` tests with `mongodb-memory-server`. Tests do NOT depend on the seeder.

---

## 13. Local dev setup

```bash
# Prerequisites (native installs)
brew install node@20 mongodb-community
# Install Ollama from https://ollama.com (native installer)
ollama pull llama3.1:8b
ollama pull nomic-embed-text  # optional fallback

# Qdrant: download binary from https://github.com/qdrant/qdrant/releases
# Meilisearch: curl -L https://install.meilisearch.com | sh

# Project
git clone <repo>
cd supportpilot
cp .env.example .env
nvm use                            # node 20
npm install
pm2 start ecosystem.config.js      # runs qdrant, meilisearch (mongo as a service)
npm run seed                       # creates demo tenants + sample data
npm run dev                        # api + worker + web dashboard in watch mode

# Open http://localhost:5173
# Login: admin@acme-saas.com / demo1234
```

`ecosystem.config.js` runs:
- `api` (Express)
- `worker` (Agenda)
- `web` (Vite dev server for admin dashboard)
- `qdrant` (binary)
- `meilisearch` (binary)
- `mongod` (only if not running as a system service)

---

## 14. Things explicitly out of scope (for now)

- Mobile apps
- On-prem customer deployments (cloud-only until later)
- Voice channels (phone IVR)
- Languages other than English (until V2)
- Fine-tuning models (RAG quality first; fine-tune only if data shows a clear gap retrieval can't fix)
- A visual workflow builder (no-code rules) — adds huge surface area, defer
- Customer-facing analytics dashboards (admin sees activity feed only in V1)

---

## 15. Open questions to resolve

- Pricing model: per-seat for agents, per-resolved-ticket for auto-resolve, or hybrid?
- Data retention defaults for tenant data (90 days? configurable?)
- How aggressive on auto-resolve out of the box — opt-in only, with a confidence floor?
- File size limit per upload (currently 50 MB — too low? too high?)
- Should "draft" visibility require explicit promotion, or auto-promote after N days?
- When do we add Postgres back for analytics-heavy queries (if ever)?
- When does Docker Compose become worth the onboarding cost?

---

## 16. Notes for Claude / AI assistants working on this repo

- When asked to add a feature, **always check `src/domain/` first** — most logic should live there, not in routes.
- **Never query MongoDB without a `tenantId` filter.** If you see a query without one, fix it even if not asked.
- **Never query Qdrant or Meilisearch without `tenantId` AND `visibility` filters.** Same rule.
- **Never call an LLM directly** — always go through `src/infra/llm/client.ts`.
- **Never put secrets in code.** Add new env vars to `src/config/env.ts` (Zod schema) and `.env.example`.
- **When adding a new connector**, follow the pattern in `src/domain/ingestion/connectors/zendesk.ts` and the `Connector` interface in `connectors/base.ts`. Each connector exposes `sync(sourceConfig)` and optionally `webhook(payload)`.
- **When adding a new file parser**, follow the pattern in `src/domain/ingestion/parsers/pdf.ts`. All parsers expose `parse(buffer, mimeType): Promise<ParsedDocument>`.
- **Every new ingestion source must support the "forget" flow.** Adding a doc and not being able to fully purge it is a bug.
- **Every new feature must update the seeder** in `scripts/seed/` so it can be demoed locally with `npm run seed`.
- **When changing the RAG pipeline**, run the eval harness (`npm run eval`) before declaring it done.
- **When adding admin UI**, citations and source provenance must always be visible. Never show an answer without a "where did this come from?" affordance.
- **Prefer narrow, focused changes** over sweeping refactors. This repo is meant to evolve through hundreds of small PRs.