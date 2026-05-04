---
title: Exporting Your Data
---

# Exporting Your Data

Acme SaaS makes it easy to export all of your data at any time, whether for analysis, compliance, or migration purposes.

## What Can Be Exported

You can export the following data types:

- **Tickets** — full conversation history, metadata, tags, and resolution status
- **Knowledge base documents** — all ingested articles, paste snippets, and uploaded files
- **Contacts** — customer profiles and contact details
- **Reports** — aggregate statistics for any time range
- **Audit logs** — full activity history for compliance purposes

## Exporting Tickets

1. Go to **Reports > Export**.
2. Select **Tickets** as the export type.
3. Choose a date range (or select **All time**).
4. Apply optional filters: status, channel, agent, tag.
5. Click **Generate Export**.

Large exports (over 10,000 rows) are processed in the background. You will receive an email with a download link when the file is ready, typically within 5 minutes. The link expires after 24 hours.

Tickets are exported as a CSV with the following columns: ticket ID, subject, channel, customer email, assigned agent, created date, resolved date, first response time, tags, and satisfaction score.

## Exporting Knowledge Base Documents

Go to **Knowledge > Export All**. This generates a ZIP file containing:

- All markdown and text content as `.md` files
- Original uploaded files (PDF, DOCX, etc.) in their native format
- A `manifest.json` describing each document's title, source, visibility, and ingestion date

## Scheduled Exports

On the Pro and Enterprise plans, you can schedule recurring exports. Go to **Reports > Scheduled Exports > Create** and choose the frequency (daily, weekly, or monthly), file format (CSV or JSON), and delivery method (email or webhook to an S3 bucket or SFTP server).

## GDPR Data Subject Export

If a customer requests a copy of their personal data under GDPR, go to **Contacts > [Customer Name] > Export Personal Data**. This produces a ZIP containing all tickets, messages, and metadata linked to that customer.

## Data Retention

Exported files are kept on our servers for 24 hours. After that, you must re-generate the export. We never retain a copy beyond that window for privacy reasons.

If you need help with large or complex exports, contact support@acme-saas.com and our team can assist with custom formats.
