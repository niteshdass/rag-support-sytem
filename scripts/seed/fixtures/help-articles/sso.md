---
title: Single Sign-On (SSO) Setup
---

# Single Sign-On (SSO) Setup

Single Sign-On lets your team log in to Acme SaaS using your company's existing identity provider (IdP). SSO is available on the Enterprise plan.

## Supported Protocols

- **SAML 2.0** — works with Okta, Azure AD, Google Workspace, OneLogin, Ping Identity, ADFS
- **OpenID Connect (OIDC)** — works with Okta, Azure AD, Auth0, Keycloak

## Setting Up SAML SSO

### Step 1: Create the Application in Your IdP

In your identity provider, create a new SAML application for Acme SaaS using these values:

| Field | Value |
|-------|-------|
| Entity ID (Audience URI) | `https://app.acme-saas.com/saml/metadata` |
| ACS URL | `https://app.acme-saas.com/saml/acs` |
| Name ID Format | Email address |
| Attribute: email | `user.email` |
| Attribute: name | `user.displayName` |

### Step 2: Configure Acme SaaS

1. Go to **Settings > Authentication > SSO > Configure SAML**.
2. Enter your IdP metadata URL, or upload the XML metadata file.
3. Click **Test Connection** to verify the setup before enabling.
4. Click **Enable SSO**.

### Step 3: Set Enforcement (optional)

You can require all users to log in via SSO by enabling **Enforce SSO** in **Settings > Authentication > SSO**. Once enforced, password-based login is disabled for non-admin accounts. We recommend keeping at least one admin account with a backup password in case of IdP outages.

## Setting Up OIDC SSO

1. Create an OIDC application in your IdP.
2. Set the redirect URI to `https://app.acme-saas.com/auth/oidc/callback`.
3. Copy the Client ID and Client Secret.
4. In Acme, go to **Settings > Authentication > SSO > Configure OIDC**.
5. Enter the Issuer URL, Client ID, and Client Secret.
6. Click **Save and Test**.

## Just-in-Time Provisioning

When a user logs in via SSO for the first time, Acme automatically creates their account with the **Agent** role by default. Admins can change the default role in **Settings > Authentication > SSO > Default Role**.

## Troubleshooting

- **"User not found" error**: Verify the email attribute is being sent correctly from your IdP.
- **Redirect loop**: Clear browser cookies and try in a private window.
- **Certificate mismatch**: Update the signing certificate in Acme when you rotate it in your IdP.

For setup assistance, contact support@acme-saas.com and ask for our SSO onboarding team.
