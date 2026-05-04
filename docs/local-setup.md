# Local development setup

Everything runs as native processes — no Docker required.

---

## Prerequisites

### Node.js 20

```bash
brew install node@20
# or use nvm:
nvm install 20 && nvm use
```

Verify: `node --version` → `v20.x.x`

### MongoDB Community Edition

```bash
brew tap mongodb/brew
brew install mongodb-community
brew services start mongodb-community
```

Verify: `mongosh --eval 'db.runCommand({ ping: 1 })'`

### Ollama (local LLM)

Download the native installer from <https://ollama.com>, then:

```bash
ollama pull llama3.1:8b
ollama pull qwen2.5:7b
```

### Qdrant (vector store)

Download the binary for your platform from the [Qdrant releases page](https://github.com/qdrant/qdrant/releases), then:

```bash
mkdir -p bin
mv ~/Downloads/qdrant bin/qdrant
chmod +x bin/qdrant
```

### Meilisearch (keyword search)

```bash
curl -L https://install.meilisearch.com | sh
mv meilisearch bin/meilisearch
```

### PM2 (process manager)

```bash
npm install -g pm2
```

---

## First-time project setup

```bash
git clone <repo-url>
cd supportpilot

cp .env.example .env
# Edit .env — at minimum, generate a real SESSION_SECRET:
# openssl rand -hex 32

nvm use        # switches to Node 20 (.nvmrc)
npm install
```

---

## Starting all services

```bash
# Uncomment service blocks in ecosystem.config.js as features land.
# For now, only the api app is active.
pm2 start ecosystem.config.js

pm2 status           # check all processes
pm2 logs api         # tail api output (Pino JSON)
pm2 logs api --raw   # pretty-print if pino-pretty is installed
```

To stop everything:

```bash
pm2 stop all
# or
pm2 delete all
```

---

## Seed demo data

```bash
npm run seed              # full seed (idempotent — safe to re-run)
npm run seed:tenant acme  # seed just the acme-saas tenant
npm run seed:reset        # wipe everything, then full seed
npm run seed:fresh        # wipe + seed + re-embed
```

After seeding:

| URL | Credentials |
|-----|-------------|
| `http://localhost:3000` | API |
| `http://localhost:5173` | Admin dashboard (once `web` app is uncommented) |

Demo login: `admin@acme-saas.com` / `demo1234`

---

## Processes managed by PM2

| Name | What | Status |
|------|------|--------|
| `api` | Express REST API | Active |
| `worker` | Agenda job runner | Commented out (no jobs yet) |
| `web` | Vite admin dashboard | Commented out (no UI yet) |
| `qdrant` | Vector store | Commented out (uncomment + place binary in `./bin/`) |
| `meilisearch` | Keyword search | Commented out (uncomment + place binary in `./bin/`) |

Uncomment blocks in `ecosystem.config.js` as each feature lands.

---

## Logs

PM2 writes logs to `./logs/`. Git ignores this directory.

```bash
pm2 logs            # all processes
pm2 logs api        # api only
pm2 flush           # clear log files
```

---

## Common issues

**`Invalid environment variables`** on startup  
→ Run `cp .env.example .env` and fill in the required values.

**`MongoServerError: connect ECONNREFUSED`**  
→ MongoDB is not running. `brew services start mongodb-community`.

**`SESSION_SECRET` validation failure**  
→ The secret must be at least 32 characters. Generate one: `openssl rand -hex 32`.

**Port 3000 already in use**  
→ Change `PORT` in `.env` or kill the existing process: `lsof -ti:3000 | xargs kill`.

**`ReferenceError: crypto is not defined` in MongoDB / connect-mongo**  
→ PM2 daemon was started under Node 18. The daemon pins the Node version for all managed processes. Kill it and restart with Node 20 active:
```bash
nvm use 20   # or activate node@20 however your shell does it
npx pm2 kill
npx pm2 start ecosystem.config.cjs
```
The `interpreter: process.execPath` line in `ecosystem.config.cjs` ensures the api process itself inherits the daemon's Node binary.
