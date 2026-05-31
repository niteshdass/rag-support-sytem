# Oracle Cloud Free Tier Deployment — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy SupportPilot on a free Oracle Cloud ARM VM with Qdrant + Meilisearch running as native binaries, MongoDB on Atlas M0, and Groq as the LLM provider.

**Architecture:** Single Ubuntu 22.04 ARM64 VM running all services locally (Qdrant, Meilisearch, Express API + Agenda worker) managed by PM2. Nginx terminates TLS and reverse-proxies to the API. MongoDB Atlas M0 is the only external managed service. Frontend is pre-built and served as static files.

**Tech Stack:** Node.js 20, PM2, Nginx, Let's Encrypt (certbot), Qdrant ARM64 binary, Meilisearch ARM64 binary, MongoDB Atlas M0, Groq API, @xenova/transformers (in-process embeddings).

---

## File Map

| Action | File | Purpose |
|---|---|---|
| Modify | `src/config/env.ts` | Add `QDRANT_API_KEY` optional field |
| Modify | `src/infra/qdrant/client.ts` | Pass API key to QdrantClient constructor |
| Modify | `.env.example` | Document `QDRANT_API_KEY` |
| Create | `ecosystem.prod.config.cjs` | PM2 config for prod (no watch, no Vite, Qdrant gets API key) |
| Create | `scripts/deploy.sh` | One-command git-pull deploy |
| Create | `nginx/supportpilot.conf` | Nginx config template (TLS + reverse proxy + static files) |

Server-side steps (SSH, no commits):
- VM provisioning via Oracle Cloud console
- Ubuntu package installs + Node.js 20 via nvm
- ARM64 binary downloads
- Repo clone + `.env` population
- Nginx + certbot setup
- PM2 systemd startup

---

## Task 1: Add `QDRANT_API_KEY` to env schema

**Files:**
- Modify: `src/config/env.ts`
- Modify: `.env.example`

- [ ] **Step 1: Write the failing test**

Add to `tests/unit/config/env.test.ts` (create if it doesn't exist):

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('env — QDRANT_API_KEY', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = {
      ...originalEnv,
      MONGODB_URI: 'mongodb://localhost:27017/test',
      SESSION_SECRET: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('accepts QDRANT_API_KEY when set', async () => {
    process.env.QDRANT_API_KEY = 'secret-key-abc';
    const { env } = await import('../../../src/config/env.js');
    expect(env.QDRANT_API_KEY).toBe('secret-key-abc');
  });

  it('allows QDRANT_API_KEY to be absent', async () => {
    delete process.env.QDRANT_API_KEY;
    const { env } = await import('../../../src/config/env.js');
    expect(env.QDRANT_API_KEY).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/unit/config/env.test.ts
```

Expected: FAIL — `env.QDRANT_API_KEY` is `undefined` regardless (field doesn't exist yet).

- [ ] **Step 3: Add `QDRANT_API_KEY` to env schema**

In `src/config/env.ts`, add one line inside `envSchema`:

```typescript
  QDRANT_API_KEY: z.string().optional(),
```

Place it after the `QDRANT_URL` line.

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/unit/config/env.test.ts
```

Expected: PASS (2 tests).

- [ ] **Step 5: Update `.env.example`**

Add after the `QDRANT_URL` line:

```bash
# Qdrant API key — required in production (set same value as QDRANT__SERVICE__API_KEY on VM)
QDRANT_API_KEY=
```

- [ ] **Step 6: Commit**

```bash
git add src/config/env.ts .env.example tests/unit/config/env.test.ts
git commit -m "feat(config): add QDRANT_API_KEY to env schema"
```

---

## Task 2: Pass Qdrant API key to client

**Files:**
- Modify: `src/infra/qdrant/client.ts`

- [ ] **Step 1: Update `getClient()` to use the API key**

Replace the `getClient` function in `src/infra/qdrant/client.ts`:

```typescript
function getClient(): QdrantClient {
  if (!_client) {
    const url = process.env.QDRANT_URL ?? 'http://localhost:6333';
    const apiKey = process.env.QDRANT_API_KEY;
    _client = new QdrantClient({ url, apiKey, checkCompatibility: false });
    logger.info({ url, hasApiKey: !!apiKey }, 'qdrant client initialised');
  }
  return _client;
}
```

(No test needed — `QdrantClient` constructor is a third-party call; the env schema test in Task 1 covers the config path. Integration is verified in Task 10.)

- [ ] **Step 2: Commit**

```bash
git add src/infra/qdrant/client.ts
git commit -m "feat(qdrant): pass API key to client when set"
```

---

## Task 3: Create production PM2 config

**Files:**
- Create: `ecosystem.prod.config.cjs`

- [ ] **Step 1: Create the file**

```javascript
module.exports = {
  apps: [
    {
      name: 'qdrant',
      script: './qdrant',
      interpreter: 'none',
      env: {
        QDRANT__SERVICE__API_KEY: process.env.QDRANT_API_KEY ?? '',
      },
      error_file: 'logs/qdrant-error.log',
      out_file: 'logs/qdrant-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
    {
      name: 'meilisearch',
      script: './meilisearch',
      interpreter: 'none',
      args: '--env production --db-path ./data.ms --http-addr 127.0.0.1:7700',
      error_file: 'logs/meilisearch-error.log',
      out_file: 'logs/meilisearch-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
    {
      name: 'api',
      script: 'node_modules/.bin/tsx',
      args: 'src/index.ts',
      interpreter: 'node',
      env: {
        NODE_ENV: 'production',
      },
      error_file: 'logs/api-error.log',
      out_file: 'logs/api-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
  ],
};
```

Key differences from dev config:
- No `web` (Vite) process — nginx serves pre-built static files
- API uses `tsx src/index.ts` without `watch`
- Qdrant gets `QDRANT__SERVICE__API_KEY` env var (Qdrant reads this natively to enable auth)

- [ ] **Step 2: Verify PM2 can parse it**

```bash
node -e "require('./ecosystem.prod.config.cjs'); console.log('OK')"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add ecosystem.prod.config.cjs
git commit -m "feat(deploy): add production PM2 ecosystem config"
```

---

## Task 4: Create deploy script

**Files:**
- Create: `scripts/deploy.sh`

- [ ] **Step 1: Create the file**

```bash
#!/usr/bin/env bash
set -euo pipefail

echo "==> Pulling latest code..."
git pull origin main

echo "==> Installing API dependencies..."
npm ci --omit=dev

echo "==> Building frontend..."
cd web
npm ci
npm run build
cd ..

echo "==> Reloading PM2 processes..."
pm2 reload ecosystem.prod.config.cjs --update-env

echo "==> Done. Status:"
pm2 status
```

- [ ] **Step 2: Make executable and commit**

```bash
chmod +x scripts/deploy.sh
git add scripts/deploy.sh
git commit -m "feat(deploy): add deploy.sh for git-pull deploys"
```

---

## Task 5: Create Nginx config template

**Files:**
- Create: `nginx/supportpilot.conf`

- [ ] **Step 1: Create the file**

Replace `yourdomain.com` with your actual domain when copying to the server.

```nginx
server {
    listen 80;
    server_name yourdomain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name yourdomain.com;

    ssl_certificate     /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
    include             /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam         /etc/letsencrypt/ssl-dhparams.pem;

    # API proxy — trailing slash on proxy_pass strips /api prefix,
    # matching Vite's dev proxy rewrite: /api/admin/foo → :3000/admin/foo
    location /api/ {
        proxy_pass         http://127.0.0.1:3000/;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;
    }

    # Frontend static files
    root /srv/supportpilot/web/dist;
    index index.html;
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Increase upload limit for file ingestion
    client_max_body_size 55M;
}
```

- [ ] **Step 2: Commit**

```bash
git add nginx/supportpilot.conf
git commit -m "feat(deploy): add nginx config template"
```

---

## Task 6: Provision Oracle Cloud VM

These steps happen in the Oracle Cloud web console. No code changes.

- [ ] **Step 1: Create an Oracle Cloud account**

Go to `cloud.oracle.com` → sign up with a credit card (not charged — used for identity verification).

- [ ] **Step 2: Create the VM instance**

Console → Compute → Instances → Create Instance.

Settings:
- Name: `supportpilot`
- Image: **Ubuntu 22.04** (change from default Oracle Linux)
- Shape: **VM.Standard.A1.Flex** → OCPU: `4`, Memory: `24 GB`
- Boot volume: `200 GB`
- SSH key: upload your `~/.ssh/id_rsa.pub` (or generate a new pair)

Click **Create**.

- [ ] **Step 3: Open firewall ports in security list**

Console → Networking → Virtual Cloud Networks → your VCN → Security Lists → Default.

Add ingress rules:
| Source CIDR | Protocol | Port | Description |
|---|---|---|---|
| 0.0.0.0/0 | TCP | 80 | HTTP |
| 0.0.0.0/0 | TCP | 443 | HTTPS |

Port 22 (SSH) should already exist.

- [ ] **Step 4: Note the public IP**

Console → Compute → Instances → `supportpilot` → Public IP address. Save it.

- [ ] **Step 5: Verify SSH access**

```bash
ssh ubuntu@<VM_PUBLIC_IP>
```

Expected: Ubuntu shell prompt.

---

## Task 7: Initial server setup

Run all commands via SSH on the VM. Install system dependencies and configure ufw.

- [ ] **Step 1: Update system packages**

```bash
sudo apt update && sudo apt upgrade -y
```

- [ ] **Step 2: Install ufw and enable firewall**

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw --force enable
sudo ufw status
```

Expected output includes: `22/tcp ALLOW`, `80/tcp ALLOW`, `443/tcp ALLOW`.

- [ ] **Step 3: Install Node.js 20 via nvm**

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc
nvm install 20
nvm use 20
node --version
```

Expected: `v20.x.x`

- [ ] **Step 4: Install PM2 globally**

```bash
npm install -g pm2
```

- [ ] **Step 5: Install Nginx and certbot**

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
sudo systemctl enable nginx
sudo systemctl start nginx
```

- [ ] **Step 6: Install MongoDB tools (for Atlas connection test)**

```bash
sudo apt install -y mongodb-clients 2>/dev/null || true
# Alternative: just use mongosh
wget -qO- https://www.mongodb.org/static/pgp/server-7.0.asc | sudo tee /etc/apt/trusted.gpg.d/server-7.0.asc
echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list
sudo apt update && sudo apt install -y mongodb-mongosh
```

---

## Task 8: Download binaries and clone repo

- [ ] **Step 1: Create app directory**

```bash
sudo mkdir -p /srv/supportpilot
sudo chown ubuntu:ubuntu /srv/supportpilot
```

- [ ] **Step 2: Download Qdrant ARM64 binary**

```bash
cd /srv/supportpilot
QDRANT_VERSION="v1.13.4"  # check latest at github.com/qdrant/qdrant/releases
wget "https://github.com/qdrant/qdrant/releases/download/${QDRANT_VERSION}/qdrant-aarch64-unknown-linux-musl.tar.gz"
tar -xzf qdrant-aarch64-unknown-linux-musl.tar.gz
rm qdrant-aarch64-unknown-linux-musl.tar.gz
chmod +x qdrant
./qdrant --version
```

Expected: `qdrant x.x.x`

- [ ] **Step 3: Download Meilisearch ARM64 binary**

```bash
cd /srv/supportpilot
MEILI_VERSION="v1.13.3"  # check latest at github.com/meilisearch/meilisearch/releases
wget "https://github.com/meilisearch/meilisearch/releases/download/${MEILI_VERSION}/meilisearch-linux-aarch64"
mv meilisearch-linux-aarch64 meilisearch
chmod +x meilisearch
./meilisearch --version
```

Expected: `meilisearch x.x.x`

- [ ] **Step 4: Clone the repo**

```bash
cd /srv/supportpilot
git clone <your-repo-url> .
```

(Or `git init` + `git remote add origin` + `git pull` if you prefer.)

- [ ] **Step 5: Install dependencies and build frontend**

```bash
cd /srv/supportpilot
npm ci --omit=dev
cd web && npm ci && npm run build && cd ..
ls web/dist/index.html
```

Expected: file exists.

- [ ] **Step 6: Create logs directory**

```bash
mkdir -p /srv/supportpilot/logs
```

---

## Task 9: Configure environment

- [ ] **Step 1: Generate secrets**

```bash
openssl rand -hex 32   # → SESSION_SECRET value
openssl rand -hex 16   # → QDRANT_API_KEY value (and MEILI_MASTER_KEY)
```

Save these values — you'll need them in the next step.

- [ ] **Step 2: Create `.env` on the VM**

```bash
cat > /srv/supportpilot/.env << 'EOF'
NODE_ENV=production
PORT=3000
MONGODB_URI=mongodb+srv://<user>:<pass>@<cluster>.mongodb.net/supportpilot
SESSION_SECRET=<output-of-first-openssl-rand>
STORAGE_DRIVER=local
QDRANT_URL=http://127.0.0.1:6333
QDRANT_API_KEY=<output-of-second-openssl-rand>
MEILI_URL=http://127.0.0.1:7700
MEILI_MASTER_KEY=<output-of-second-openssl-rand>
LLM_PROVIDER=groq
GROQ_API_KEY=<your-groq-api-key>
INTERNAL_API_URL=http://127.0.0.1:3000
EOF
chmod 600 /srv/supportpilot/.env
```

- [ ] **Step 3: Test Atlas connection**

```bash
source /srv/supportpilot/.env
mongosh "$MONGODB_URI" --eval "db.runCommand({ping:1})"
```

Expected: `{ ok: 1 }`

---

## Task 10: Configure Nginx and TLS

- [ ] **Step 1: Copy nginx config**

```bash
sudo cp /srv/supportpilot/nginx/supportpilot.conf /etc/nginx/sites-available/supportpilot
```

Edit the file — replace every occurrence of `yourdomain.com` with your actual domain:

```bash
sudo sed -i 's/yourdomain.com/your.actual.domain/g' /etc/nginx/sites-available/supportpilot
```

- [ ] **Step 2: Enable site (no TLS yet — certbot needs HTTP first)**

Temporarily set up HTTP-only config so certbot can verify the domain. Create a temp config:

```bash
sudo tee /etc/nginx/sites-available/supportpilot-temp << 'EOF'
server {
    listen 80;
    server_name your.actual.domain;
    root /srv/supportpilot/web/dist;
    location / { try_files $uri $uri/ /index.html; }
}
EOF
sudo ln -s /etc/nginx/sites-available/supportpilot-temp /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

Verify domain resolves to VM IP (set DNS A record at registrar/Cloudflare first).

- [ ] **Step 3: Obtain TLS certificate**

```bash
sudo certbot --nginx -d your.actual.domain --non-interactive --agree-tos -m your@email.com
```

Expected: `Successfully received certificate.`

- [ ] **Step 4: Switch to full config**

```bash
sudo rm /etc/nginx/sites-enabled/supportpilot-temp
sudo ln -s /etc/nginx/sites-available/supportpilot /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

- [ ] **Step 5: Verify HTTPS**

```bash
curl -I https://your.actual.domain
```

Expected: `HTTP/2 200`

---

## Task 11: Start services with PM2

- [ ] **Step 1: Start all processes**

```bash
cd /srv/supportpilot
source .env  # so PM2 inherits QDRANT_API_KEY for the ecosystem config
pm2 start ecosystem.prod.config.cjs
pm2 status
```

Expected: all 3 processes (`qdrant`, `meilisearch`, `api`) show `online`.

- [ ] **Step 2: Wait for API to be ready**

```bash
sleep 5
curl -s http://127.0.0.1:3000/health
```

Expected: `{"status":"ok"}` (Express `/health` endpoint, direct — no nginx prefix needed here).

- [ ] **Step 3: Verify Qdrant auth is enabled**

```bash
source .env

# Without key — should return 403
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:6333/collections
# Expected: 403

# With key — should return 200
curl -s -o /dev/null -w "%{http_code}" -H "api-key: $QDRANT_API_KEY" http://127.0.0.1:6333/collections
# Expected: 200
```

- [ ] **Step 4: Configure PM2 to start on reboot**

```bash
pm2 startup
# PM2 prints a command — copy and run it (looks like: sudo env PATH=... pm2 startup systemd ...)
pm2 save
```

- [ ] **Step 5: Verify PM2 survives reboot**

```bash
sudo reboot
# Wait ~60 seconds, then SSH back in
ssh ubuntu@<VM_PUBLIC_IP>
pm2 status
```

Expected: all 3 processes `online` without manual start.

---

## Task 12: End-to-end smoke test

- [ ] **Step 1: Test HTTPS frontend**

Open `https://your.actual.domain` in a browser. Expected: admin dashboard login page loads.

- [ ] **Step 2: Test API via HTTPS**

```bash
curl -s https://your.actual.domain/api/health
```

Expected: `{"status":"ok"}` (nginx strips `/api` prefix → Express `/health`).

- [ ] **Step 3: Test file upload path (Meilisearch + Qdrant reachable from API)**

Log in at `https://your.actual.domain` with `admin@acme-saas.com` / `demo1234` (if you seeded locally and imported the DB dump).

Or: POST a quick paste-text from the dashboard and verify it appears in the Documents list.

- [ ] **Step 4: Test deploy script**

Make a trivial commit locally (e.g., update a comment), push, then run:

```bash
ssh ubuntu@<VM_PUBLIC_IP> 'cd /srv/supportpilot && bash scripts/deploy.sh'
```

Expected: exits 0, `pm2 status` shows all processes still `online`.

- [ ] **Step 5: Check PM2 logs for errors**

```bash
ssh ubuntu@<VM_PUBLIC_IP> 'pm2 logs --lines 50 --nostream'
```

Expected: no `ERROR` or `FATAL` lines. `@xenova/transformers` model download warning on first embed is normal — it caches after first run.

---

## Cost Summary

| Service | Free limit | Notes |
|---|---|---|
| Oracle Cloud ARM VM | Free forever | 4 OCPU, 24GB RAM, 200GB disk |
| MongoDB Atlas M0 | 512MB, free forever | Sufficient for dev/testing |
| Groq API | Free tier: generous rate limits | Reset monthly |
| Cloudflare DNS | Free | DNS + proxy |
| Let's Encrypt TLS | Free | Auto-renews via certbot timer |
| **Total** | **$0** | |
