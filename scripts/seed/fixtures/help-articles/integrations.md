---
title: Connecting Third-Party Integrations
---

# Connecting Third-Party Integrations

Acme SaaS integrates with the tools your team already uses. This article describes how to set up each supported integration.

## Zendesk

1. Go to **Integrations > Zendesk > Connect**.
2. Enter your Zendesk subdomain (e.g., `yourcompany.zendesk.com`).
3. Authorize access via Zendesk OAuth.
4. Choose what to sync: Help Center articles, past tickets, macros, or all three.
5. Click **Save and Sync**. Initial sync completes within 15 minutes for most accounts.

Acme installs a sidebar app in Zendesk automatically, giving agents AI-drafted replies without leaving their workspace.

## Intercom

1. Go to **Integrations > Intercom > Connect**.
2. Click **Connect with Intercom** and authorize access.
3. Select the inboxes and article collections to include.
4. Set the sync schedule (real-time or hourly).

## Slack

The Slack integration lets your support team query the knowledge base using `/ask` in any channel.

1. Go to **Integrations > Slack > Install App**.
2. Choose the workspace and click **Allow**.
3. Select the channels the bot can respond in.
4. Invite the bot: `/invite @acme` in any channel you want it active.

Use `/ask how do I reset a user password?` and the bot responds with a sourced answer in a thread.

## Notion

1. Go to **Integrations > Notion > Connect**.
2. Authorize Acme as a Notion integration.
3. Select the pages and databases to sync.
4. Acme polls for changes every 60 minutes by default. You can trigger a manual sync from **Integrations > Notion > Sync Now**.

## Confluence

1. Go to **Integrations > Confluence > Connect**.
2. Enter your Confluence base URL.
3. Provide an API token (create one at id.atlassian.com > Security > API Tokens).
4. Select the spaces to include.

## Google Drive

1. Go to **Integrations > Google Drive > Connect**.
2. Sign in with a Google account that has access to the folders you want to sync.
3. Select specific folders (Acme does not sync your entire Drive by default).

Supported file types: Google Docs (converted to text), PDF, DOCX, TXT, and Markdown.

## GitHub

1. Go to **Integrations > GitHub > Connect**.
2. Install the Acme GitHub App on your organization.
3. Select repositories to sync. Acme indexes: README files, wikis, issue comments, and pull request descriptions.

## Disconnecting an Integration

Go to **Integrations > [Name] > Disconnect**. Disconnecting stops future syncs but does not delete previously ingested content. To remove the content, use **Knowledge > [Document] > Delete** or **Knowledge > Purge Source**.
