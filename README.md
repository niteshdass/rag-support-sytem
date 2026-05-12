# SupportPilot

A RAG-powered customer support automation platform for mid-market SaaS companies — ingests your docs, past tickets, and Slack threads, then drafts answers inside Zendesk/Intercom or resolves Tier 1 tickets automatically.

---

## Prerequisites (one-time)

```bash
brew install node@20 mongodb-community
brew services start mongodb-community

# Ollama — https://ollama.com (native installer)
ollama pull llama3.1:8b

# Qdrant binary — place in project root
# https://github.com/qdrant/qdrant/releases

# Meilisearch binary — place in project root
curl -L https://install.meilisearch.com | sh
```

---

## Setup

```bash
git clone <repo>
cd supportpilot
cp .env.example .env   # fill in MONGODB_URI + other vars
nvm use                # node 20
npm install
cd web && npm install && cd ..
```

---

## Start the app

```bash
pm2 start ecosystem.config.cjs
```

Starts:

| Process      | What                       | Port  |
|--------------|----------------------------|-------|
| `api`        | Express REST API           | 3000  |
| `web`        | Vite admin dashboard       | 5173  |
| `qdrant`     | Vector search              | 6333  |
| `meilisearch`| Keyword search             | 7700  |

---

## Seed demo data

```bash
npm run seed              # full seed (idempotent)
npm run seed:reset        # wipe + re-seed
```

Creates 3 demo tenants, sample docs, tickets, and conversations.

---

## Open

```
http://localhost:5173
Login: admin@acme-saas.com / demo1234
```

---

## Useful commands

```bash
pm2 status        # check what's running
pm2 logs          # tail all logs
pm2 logs api      # api logs only
pm2 restart all   # restart everything
pm2 stop all      # stop everything

npm run dev       # run api only (no PM2)
npm run dev:web   # run web only (no PM2)
npm test          # run tests
npm run eval      # run RAG eval harness
```
