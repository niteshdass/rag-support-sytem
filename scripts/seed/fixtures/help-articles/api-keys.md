---
title: Managing API Keys
---

# Managing API Keys

API keys allow external systems and custom integrations to authenticate with the Acme SaaS API. This article covers creating, rotating, and revoking keys.

## Creating an API Key

1. Go to **Settings > API Keys > Create Key**.
2. Enter a descriptive label (e.g., "Zapier Integration" or "Internal Dashboard").
3. Select the permission scope (see table below).
4. Click **Create**. The key is shown once — copy it immediately.

**Permission Scopes**

| Scope | What it allows |
|-------|---------------|
| `tickets:read` | Read ticket data and conversation history |
| `tickets:write` | Create and update tickets |
| `knowledge:read` | Read knowledge base documents |
| `knowledge:write` | Add, update, and delete knowledge base documents |
| `reports:read` | Access report and analytics data |
| `admin` | Full access — use only for trusted internal tools |

You can combine multiple scopes on a single key. We recommend using the narrowest scope that meets your integration's needs.

## Rate Limits

API keys are subject to rate limits to protect system stability:

- **Starter plan**: 100 requests per minute
- **Pro plan**: 500 requests per minute
- **Enterprise plan**: 2,000 requests per minute (higher limits available on request)

Rate limit headers are included in every response: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset`.

## Rotating a Key

If a key is exposed or you suspect unauthorized use, rotate it immediately. Go to **Settings > API Keys**, click the key, then click **Rotate Key**. A new key is generated instantly. The old key becomes invalid within 60 seconds. Update your integrations with the new key before rotating.

## Revoking a Key

To permanently delete a key, go to **Settings > API Keys**, click the key, then click **Revoke**. Revocation is immediate and cannot be undone. Any integration using the revoked key will start receiving `401 Unauthorized` responses.

## Viewing Key Activity

Each key has an activity log showing the last 100 requests: timestamp, endpoint, status code, and IP address. This helps audit usage and investigate unexpected behavior. Go to **Settings > API Keys > [Key Name] > Activity**.

## IP Allowlisting

On the Enterprise plan, you can restrict an API key to specific IP addresses or CIDR ranges. This prevents the key from being used if it is stolen. Go to **Settings > API Keys > [Key Name] > IP Restrictions**.
