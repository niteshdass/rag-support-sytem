# Deployment — Path A (free hosting, zero feature loss)

Goal: ship the full product on free tiers **without rewriting the architecture**.
Vercel alone can't host this app (it's a stateful long-running Node server with an
in-process worker, IMAP/Slack listeners, and native search engines). Path A keeps the
backend as-is on a container host and puts only the static frontend on Vercel.

```
Browser ──▶ Vercel (static React, web/)
                │  /api/*  rewrite (same-origin, cookies just work)
                ▼
        Render / Fly (Docker: API + worker, one process)
                │
   ┌────────────┼─────────────┬──────────────┐
   ▼            ▼             ▼              ▼
MongoDB     Qdrant Cloud  Meilisearch     Groq
Atlas free  free 1GB      Cloud free      free LLM
```

Nothing in the codebase is removed. Native binaries (`qdrant`, `meilisearch`) are simply
replaced by their managed free clusters via env vars — no code change.

---

## 1. Provision free managed services

| Service | Free tier | Gives you the env var(s) |
|---|---|---|
| **MongoDB Atlas** | M0, 512 MB | `MONGODB_URI` (must keep DB name w/o `prod` guard issues) |
| **Qdrant Cloud** | 1 GB cluster | `QDRANT_URL`, `QDRANT_API_KEY` |
| **Meilisearch Cloud** | free project | `MEILI_URL`, `MEILI_MASTER_KEY` |
| **Groq** | generous free | `GROQ_API_KEY` (set `LLM_PROVIDER=groq`) |

> Bigger win for later: MongoDB Atlas can do **vector + text search itself**, letting you
> drop both Qdrant and Meilisearch. That's the Path B migration — not needed to launch.

Generate the session secret:

```bash
openssl rand -hex 32   # -> SESSION_SECRET
```

---

## 2. Deploy the backend (pick one)

### Option A1 — Render (simplest, truly $0)

1. Push repo to GitHub.
2. Render → **New → Blueprint** → select repo. It reads [`render.yaml`](../render.yaml).
3. Fill the `sync:false` secrets in the dashboard (the table above).
4. Deploy. Note the URL, e.g. `https://supportpilot-api.onrender.com`.

Caveat: the free web service **spins down after ~15 min idle** and cold-starts on the next
request (a few seconds, plus first-time Transformers.js model download). Fine for a launch.
Email IMAP and Slack socket listeners won't survive spin-down — leave those channels off
for v1 (see §5) or use Fly.

### Option A2 — Fly.io (always-on)

```bash
fly launch --no-deploy          # reads fly.toml, creates the app
fly secrets set \
  MONGODB_URI="..." SESSION_SECRET="..." \
  QDRANT_URL="..." QDRANT_API_KEY="..." \
  MEILI_URL="..." MEILI_MASTER_KEY="..." \
  GROQ_API_KEY="..."
fly deploy
```

`min_machines_running = 1` keeps it warm, so email/Slack listeners stay alive.

---

## 3. Deploy the frontend on Vercel

1. Vercel → **New Project** → same repo.
2. Set **Root Directory = `web`** (Vercel auto-detects Vite from [`web/vercel.json`](../web/vercel.json)).
3. Edit `web/vercel.json` → replace the rewrite destination host with your backend URL
   from §2. The `/api/*` rewrite proxies to the backend server-side, so the browser only
   ever talks to the Vercel origin → **session cookies work with no CORS or `SameSite=None`.**
4. Deploy.

No frontend code change: `web/src/api/client.ts` already calls `/api`, and the rewrite
strips `/api` to match the backend's root routes (`/auth`, `/admin`, …) — same behavior as
the local Vite dev proxy.

---

## 4. First-run

- Seeding runs against a dev DB only (URI must contain `dev`/`test`/`local`). To load demo
  data into Atlas, run the seeder **locally** pointed at the Atlas URI, or create the first
  tenant/admin via the auth route. Don't point `npm run seed:reset` at anything real.
- Health check: `GET https://<backend>/health` → `{ ok: true }`.

---

## 5. Feature flags for the free launch

These features need persistent connections or heavy resources. Code stays; just don't
enable them on a spin-down host:

- **Email channel (IMAP)** — only starts when an email Source exists in the DB. Add none → no-op.
- **Slack bot (socket mode)** — leave `SLACK_*` env vars unset → not started.
- **Web crawler (Crawlee/Playwright)** — pulls a headless browser; heavy for a 512 MB
  instance. Avoid running crawl jobs on the free plan, or skip the browser download in the
  image. Upload/paste/connector ingestion is unaffected.

Everything else — upload, paste, documents, RAG query, chat widget, citations, activity
feed, multi-tenancy, auth, eval — runs fully on the free stack.

---

## 6. What changed in the repo for this

- `Dockerfile`, `.dockerignore` — build the backend as one container.
- `render.yaml`, `fly.toml` — backend host configs.
- `web/vercel.json` — frontend build + same-origin API proxy.
- `src/index.ts` — `trust proxy` in production so secure session cookies are set behind the
  TLS-terminating proxy.
- `.gitignore` — `snapshots/`, `dumps/` (the `qdrant`/`meilisearch` binaries were already ignored).

No features were removed or rewritten.
```
