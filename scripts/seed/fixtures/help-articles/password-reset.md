---
title: Resetting Your Password
---

# Resetting Your Password

This article explains how to reset your password, handle locked accounts, and set a new password as an admin on behalf of a team member.

## Self-Service Password Reset

If you have forgotten your password:

1. Go to the Acme SaaS login page.
2. Click **Forgot Password?** below the sign-in form.
3. Enter the email address associated with your account.
4. Click **Send Reset Link**.
5. Check your inbox for an email from no-reply@acme-saas.com.
6. Click the **Reset Password** link inside the email.
7. Enter and confirm your new password.
8. Click **Set New Password** to complete the process.

Password reset links expire after 1 hour. If yours has expired, repeat the process to request a new one.

## Password Requirements

All passwords must meet the following criteria:

- At least 12 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one number or special character
- Cannot match any of the last 5 passwords used

## Account Lockout

After 10 consecutive failed login attempts, your account is temporarily locked for 30 minutes. You will receive an email notification when this happens. After 30 minutes, you can try again or initiate a password reset.

If you believe your account was locked due to unauthorized attempts, contact security@acme-saas.com immediately.

## Two-Factor Authentication and Password Reset

If you have 2FA enabled and have lost access to your authenticator device, contact your workspace admin. Admins can generate a one-time bypass code from **Settings > Team Members > [User] > Generate Recovery Code**. The bypass code is valid for 15 minutes.

If you are the sole admin and have lost 2FA access, contact support@acme-saas.com with a government-issued ID and proof of account ownership. Identity verification typically takes one business day.

## Admins: Resetting a Team Member's Password

1. Go to **Settings > Team Members**.
2. Click the team member's name.
3. Click **Reset Password**.
4. Choose to send a reset email or set a temporary password.

Temporary passwords must be changed by the user at first login.

## Single Sign-On Users

If your organization uses SSO (SAML or OIDC), password resets must be handled through your identity provider. Acme SaaS cannot reset passwords managed by an external IdP. Contact your IT department or your IdP administrator.
