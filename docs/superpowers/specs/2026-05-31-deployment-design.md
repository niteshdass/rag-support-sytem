# Deployment Design — Oracle Cloud Free Tier

**Date:** 2026-05-31
**Goal:** Personal testing/dev deployment at $0 cost, always-on.

---

## 1. Infrastructure

**Provider:** Oracle Cloud Free Tier
- Shape: `VM.Standard.A1.Flex` (Ampere ARM64)
- Resources: 4 OCPU, 24GB RAM, 200GB boot volume
- OS: Ubuntu 22.04 LTS (ARM64)
- 1 static public IP (free)

**Networking:**
- Oracle security list + `ufw`: only ports 22, 80, 443 public
- All internal services bind to `127.0.0.1` (Qdrant :6333, Meilisearch :7700)
- Nginx terminates TLS, reverse-proxies API, serves static frontend

**Domain:** Cloudflare free tier (DNS + proxied). Let's Encrypt TLS via certbot.

---

## 2. Services

| Process | How | Port | Est. RAM |
|---|---|---|---|
| MongoDB | Atlas M0 (external, free) | — (Atlas URI) | 0 on VM |
| Qdrant | ARM64 binary (`./qdrant`) | 127.0.0.1:6333 | ~200MB |
| Meilisearch | ARM64 binary (`./meilisearch`) | 127.0.0.1:7700 | ~200MB |
| Express API + Agenda | PM2 (`tsx src/index.ts`) | 127.0.0.1:3000 | ~500MB |
| Nginx | system service | 80, 443 | ~50MB |

**Total active RAM:** ~1GB. 24GB available — ample headroom for `@xenova/transformers` model load (~1-2GB on first embed batch) and spikes.

**Process manager:** PM2 configured as a systemd service (`pm2 startup`). Survives reboots. Restart-on-crash for all processes.

**Startup order:** Qdrant + Meilisearch start first (PM2 `wait_ready` or fixed delay), then API.

**Frontend:** pre-built (`cd web && npm run build`). Nginx serves `web/dist/` as static files — no Vite process in prod.

**File storage:** `./storage/` on the VM's 200GB disk. `STORAGE_DRIVER=local` unchanged.

---

## 3. Deployment Flow

No CI/CD. Manual git-pull deploy over SSH:

```bash
# scripts/deploy.sh
set -e
git pull origin main
npm ci --omit=dev
cd web && npm ci && npm run build && cd ..
pm2 reload ecosystem.config.cjs
```

Run manually: `ssh ubuntu@<vm-ip> 'cd /srv/supportpilot && bash scripts/deploy.sh'`

**ARM binaries** (download once during VM setup):
- Qdrant: `https://github.com/qdrant/qdrant/releases` → `qdrant-aarch64-unknown-linux-musl.tar.gz`
- Meilisearch: `https://github.com/meilisearch/meilisearch/releases` → `meilisearch-linux-aarch64`

Place at repo root as `./qdrant` and `./meilisearch` (matches `ecosystem.config.cjs`).

---

## 4. Environment Config

`.env` on the VM only. Never committed.

```bash
NODE_ENV=production
PORT=3000

# MongoDB Atlas M0 (external)
MONGODB_URI=mongodb+srv://<user>:<pass>@<cluster>.mongodb.net/supportpilot

# Vector + search (localhost)
QDRANT_URL=http://127.0.0.1:6333
QDRANT_API_KEY=<random-32-char>
MEILI_URL=http://127.0.0.1:7700
MEILI_MASTER_KEY=<random-32-char>

# Session
SESSION_SECRET=<random-64-char>

# LLM
GROQ_API_KEY=<groq-key>
LLM_PROVIDER=groq

# Storage
STORAGE_DRIVER=local
```

**Note on seeder safety guard:** Atlas URI won't contain `dev/test/local`. Seeder should not run in prod — this is correct behavior. Run seeder locally against dev DB only.

---

## 5. Security

- `ufw` + Oracle security list: 22, 80, 443 only public
- Qdrant API key enabled (`--api-key` flag in PM2 args)
- Meilisearch master key set
- All internal services on `127.0.0.1`
- Nginx handles TLS termination; API never exposed directly
- SSH key auth only (password auth disabled in `sshd_config`)

---

## 6. Nginx Config (sketch)

```nginx
server {
    listen 443 ssl;
    server_name app.yourdomain.com;

    # Frontend static
    root /srv/supportpilot/web/dist;
    try_files $uri $uri/ /index.html;

    # API proxy
    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

---

## 7. Out of Scope

- Automated CI/CD (manual deploy sufficient for personal testing)
- Backups (Atlas has automated backups on M0; VM data is non-critical for dev)
- Monitoring/alerting (PM2 logs sufficient)
- Ollama (Groq API used instead — no GPU needed)
- Presidio sidecar (regex redaction sufficient for dev)
