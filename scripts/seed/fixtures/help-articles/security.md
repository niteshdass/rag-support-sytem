---
title: Security Features and Best Practices
---

# Security Features and Best Practices

Security is a core part of how Acme SaaS is built and operated. This article covers the security controls available to you and recommendations for keeping your account safe.

## Two-Factor Authentication (2FA)

We strongly recommend enabling 2FA for every user in your workspace. Admins can enforce mandatory 2FA via **Settings > Security > Require 2FA**. Once enforced, users who have not set up 2FA will be prompted to do so at their next login.

Supported 2FA methods:
- **Authenticator app** (TOTP — Google Authenticator, Authy, 1Password)
- **Hardware security key** (FIDO2/WebAuthn — YubiKey, Google Titan Key)
- **SMS** (available but not recommended; use app or hardware key when possible)

## Session Management

Active sessions are listed under **Account Settings > Security > Sessions**. You can see the device, location, and last-active time for each session. Use **Revoke** next to any session you do not recognize. **Revoke All Sessions** logs out every device immediately.

Sessions expire after 14 days of inactivity by default. Admins can reduce this to 1 hour, 4 hours, or 24 hours via **Settings > Security > Session Timeout**.

## Audit Logs

Every action taken in your workspace is logged: logins, ticket views, document changes, settings updates, API key usage, and more. Go to **Settings > Audit Log** to search and filter. Logs are retained for 365 days on Pro and Enterprise plans, 30 days on Starter.

You can export audit logs as CSV from **Settings > Audit Log > Export**.

## IP Allowlisting

On the Enterprise plan, restrict workspace access to specific IP addresses or CIDR ranges. Go to **Settings > Security > IP Allowlist**. Users connecting from unlisted IPs will see an access-denied page even with valid credentials.

## Data Encryption

All data is encrypted in transit using TLS 1.2 or higher. Data at rest is encrypted using AES-256. Backups are encrypted with a separate key stored in a hardware security module (HSM).

## Incident Response

If you suspect your account has been compromised, immediately:
1. Change your password.
2. Enable or reset 2FA.
3. Revoke all active sessions.
4. Revoke and rotate all API keys.
5. Contact security@acme-saas.com.

Our security team responds to urgent incidents within 1 hour.

## SOC 2 and Compliance

Acme SaaS is SOC 2 Type II certified. To request a copy of our latest report, email compliance@acme-saas.com with your company name and a signed NDA.
