# SupportPilot Zendesk Sidebar App

Zendesk Apps Framework (ZAF) sidebar that drafts replies for open tickets using the SupportPilot backend.

## Local dev

### Prerequisites

```bash
# Zendesk Apps Tools (requires Ruby)
gem install zendesk_apps_tools

# Node deps
cd zendesk-app && npm install
```

You also need:
- SupportPilot backend running on `http://localhost:3000` (`npm run dev` from repo root)
- A valid tenant API key (from `admin@acme-saas.com` settings, or from the DB seed)

### 1. Build the React micro-app

```bash
cd zendesk-app
npm run build
# outputs assets/main.js + assets/main.css
```

### 2. Configure settings

Edit `zendesk-app/settings.yml`:

```yaml
api_url: http://localhost:3000
api_key: <your-tenant-api-key>
```

### 3. Sideload into Zendesk sandbox

```bash
cd zendesk-app
zat server --path .
```

This starts a local server on `https://localhost:4567`. Then in your Zendesk sandbox:

1. Append `?zat=true` to any Zendesk support URL (e.g. `https://yoursubdomain.zendesk.com/agent/tickets/123?zat=true`)
2. Accept the browser warning for the self-signed cert
3. The SupportPilot sidebar appears in the ticket view

### 4. Test the flow

1. Open any ticket → sidebar loads → draft appears
2. Click **Insert into reply** → text populates the reply composer
3. Edit the text → click Submit → an `edit` feedback event fires to `/copilot/feedback`
4. 👍/👎 buttons → fire `thumbs` feedback immediately

## Building for production

```bash
npm run build
# then zip the zendesk-app/ directory (excluding node_modules) and upload to Zendesk Marketplace
```

## API endpoints used

| Endpoint | Auth | Purpose |
|---|---|---|
| `POST /copilot/query` | `x-api-key` | Run RAG pipeline, return draft + citations |
| `POST /copilot/feedback` | `x-api-key` | Record thumbs/edit feedback |

Both endpoints support CORS from any origin (restrict in production).

## Manifest settings

| Parameter | Type | Description |
|---|---|---|
| `api_url` | text | SupportPilot backend URL |
| `api_key` | text (secure) | Tenant API key |
