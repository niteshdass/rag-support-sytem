---
name: p1-scaffold
description: Scaffold the pnpm monorepo for the RAG support system. Creates backend/, frontend/, packages/shared/, docker-compose, CI, husky, and all stub files per CLAUDE.md Phase 1.
---

# P1-01 — Monorepo Scaffold

Scaffold a pnpm monorepo for a RAG support system. Follow CLAUDE.md exactly.

## What to create

### Root
- `pnpm-workspace.yaml` — workspaces: backend, frontend, packages/*
- `package.json` — root with Husky + lint-staged + `pnpm -r` scripts
- `tsconfig.base.json` — strict mode shared TS config
- `.eslintrc.json` — shared ESLint config with @typescript-eslint
- `.prettierrc` — semi, singleQuote, tabWidth 2, trailingComma es5, printWidth 100
- `.gitignore` — node_modules, dist, .env, logs, .DS_Store, *.tsbuildinfo
- `.env.example` — pointer to backend/.env.example and frontend/.env.example
- `docker-compose.yml` — pgvector/pgvector:pg16 + redis:7-alpine with healthchecks

### CI
- `.github/workflows/ci.yml` — typecheck + lint + build on push to main and pull_request

### Husky
- `.husky/pre-commit` — runs `pnpm lint-staged` (chmod +x)

### Backend (`backend/`)
- `package.json` — Fastify, @fastify/rate-limit, @fastify/cors, zod, drizzle-orm, pg, @neondatabase/serverless, pino, pino-pretty, bullmq, ioredis, @sentry/node, dotenv, @rag/shared workspace:*
- `tsconfig.json` — extends base, NodeNext module/moduleResolution, outDir dist
- `vitest.config.ts` — environment: node, include tests/**/*.test.ts
- `.env.example` — all vars from CLAUDE.md backend env section
- `src/index.ts` — minimal Fastify server on `API_PORT` with GET /health
- All stub files (export {}) per CLAUDE.md folder structure:
  - src/env.ts, src/logger.ts, src/config.ts, src/prompts.ts
  - src/routes/: health.ts, ingest.ts, ask.ts, admin.ts
  - src/services/ingestion/: scraper.ts, chunker.ts, embedder.ts, store.ts
  - src/services/retrieval/: vector-search.ts, bm25.ts, rrf.ts, reranker.ts
  - src/services/: llm.ts, auth.ts, webhook.ts
  - src/db/: schema.ts, client.ts
  - src/middleware/: error.ts, auth.ts, logging.ts
  - src/jobs/: ingestion.ts, webhook.ts
  - src/utils/: errors.ts, validation.ts, retry.ts
  - src/evals/: questions.json ([]), runner.ts, report.json ({})
  - tests/integration/ingestion-ask.test.ts — it.todo stub

### Frontend (`frontend/`)
- `package.json` — react, react-dom, vite, @vitejs/plugin-react, tailwindcss, @tanstack/react-query, @tanstack/react-router, @sentry/react, @rag/shared workspace:*
- `tsconfig.json` — extends base, ESNext module, bundler moduleResolution, jsx react-jsx, noEmit true
- `vite.config.ts` — @vitejs/plugin-react, proxy /api to API_PORT
- `vitest.config.ts` — environment: jsdom
- `tailwind.config.ts` — content: index.html + src/**/*.{ts,tsx}
- `postcss.config.js` — CJS (`module.exports`) for Node 18 compat
- `index.html` — mounts #root, loads /src/index.tsx
- `.env.example` — VITE_API_BASE_URL, VITE_ENVIRONMENT, VITE_SENTRY_DSN
- `src/index.tsx` — minimal ReactDOM.createRoot render
- All stub files (export {}) per CLAUDE.md folder structure:
  - src/App.tsx
  - src/pages/: ChatPage.tsx, AdminPage.tsx, NotFound.tsx
  - src/components/: ChatInput.tsx, Answer.tsx, CitationCard.tsx, LoadingSpinner.tsx, ErrorAlert.tsx
  - src/hooks/: useChat.ts, useIngestion.ts, useAuth.ts
  - src/lib/: api-client.ts, validation.ts, constants.ts
  - src/styles/globals.css — @tailwind base/components/utilities
  - src/types/index.ts
  - tests/Chat.test.tsx — it.todo stub

### Shared (`packages/shared/`)
- `package.json` — name @rag/shared, exports dist/index.js, zod only dep
- `tsconfig.json` — extends base, NodeNext, outDir dist
- `src/index.ts` — re-exports from types, schemas, constants, helpers
- src/: types.ts, schemas.ts, constants.ts, helpers.ts (all export {})

### Seeds
- `seeds/dev-seed.ts` — export {}

## Post-scaffold steps

1. Add to root `package.json` under `"pnpm"` key:
   ```json
   "onlyBuiltDependencies": ["esbuild", "msgpackr-extract"]
   ```
2. Run `pnpm install` from repo root (not npm, not inside a package)
3. `docker compose up -d` for Postgres + Redis
4. Verify: `pnpm dev:backend` → http://localhost:3000/health, `pnpm dev:frontend` → http://localhost:5173

## Rules
- No application logic — scaffold only
- `postcss.config.js` must use `module.exports` (not `export default`) for Node 18 compat
- All TS files need explicit return types, no any, no console.log
- `workspace:*` deps resolved only by pnpm — never npm install inside a package
