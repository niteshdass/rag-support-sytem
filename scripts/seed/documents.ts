import { readFile, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import { DocumentService, type JobQueue } from '../../src/domain/knowledge/documentService.js';
import { DocumentModel } from '../../src/infra/mongo/models/Document.js';
import { SourceModel } from '../../src/infra/mongo/models/Source.js';
import { UserModel } from '../../src/infra/mongo/models/User.js';
import { runIngestDocument } from '../../src/jobs/ingestDocument.js';
import { getStorage } from '../../src/infra/storage/index.js';
import { logger } from '../../src/observability/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ARTICLES_DIR = join(__dirname, 'fixtures', 'help-articles');

type TenantRef = { _id: mongoose.Types.ObjectId; slug: string };

// ---------------------------------------------------------------------------
// Minimal PDF generator (no external deps)
// ---------------------------------------------------------------------------
function makePdf(title: string, excerpt: string): Buffer {
  const esc = (s: string) =>
    s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)').replace(/[\r\n]/g, ' ');

  const stream =
    `BT\n/F1 14 Tf 50 750 Td (${esc(title)}) Tj\n` +
    `0 -24 Td /F1 11 Tf (${esc(excerpt.slice(0, 220))}) Tj\nET`;
  const streamBuf = Buffer.from(stream, 'utf8');

  const header = '%PDF-1.4\n';
  const p1 = '1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n';
  const p2 = '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n';
  const p3 =
    '3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Contents 4 0 R' +
    '/Resources<</Font<</F1 5 0 R>>>>>>endobj\n';
  const p4h = `4 0 obj<</Length ${streamBuf.length}>>\nstream\n`;
  const p4f = '\nendstream\nendobj\n';
  const p5 = '5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\n';

  const o1 = header.length;
  const o2 = o1 + p1.length;
  const o3 = o2 + p2.length;
  const o4 = o3 + p3.length;
  const o5 = o4 + p4h.length + streamBuf.length + p4f.length;
  const xrefAt = o5 + p5.length;

  const pad = (n: number) => String(n).padStart(10, '0');
  const xref =
    `xref\n0 6\n0000000000 65535 f \n` +
    `${pad(o1)} 00000 n \n${pad(o2)} 00000 n \n` +
    `${pad(o3)} 00000 n \n${pad(o4)} 00000 n \n${pad(o5)} 00000 n \n`;
  const trailer = `trailer<</Size 6/Root 1 0 R>>\nstartxref\n${xrefAt}\n%%EOF\n`;

  return Buffer.concat([
    Buffer.from(header + p1 + p2 + p3 + p4h, 'utf8'),
    streamBuf,
    Buffer.from(p4f + p5 + xref + trailer, 'utf8'),
  ]);
}

// ---------------------------------------------------------------------------
// Inline job queue — collects doc IDs for synchronous ingest
// ---------------------------------------------------------------------------
function makeInlineQueue(): { queue: JobQueue; pendingIds: string[] } {
  const pendingIds: string[] = [];
  const queue: JobQueue = {
    async enqueue(_name: string, data: Record<string, unknown>) {
      if (typeof data.documentId === 'string') pendingIds.push(data.documentId);
    },
  };
  return { queue, pendingIds };
}

// ---------------------------------------------------------------------------
// Front-matter parser
// ---------------------------------------------------------------------------
function stripFrontmatter(md: string): { title: string; content: string } {
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(md);
  if (!match) return { title: 'Untitled', content: md.trim() };

  const fm = match[1]!;
  const content = match[2]!.trim();
  const titleLine = /^title:\s*(.+)$/m.exec(fm);
  return { title: titleLine ? titleLine[1]!.trim() : 'Untitled', content };
}

// ---------------------------------------------------------------------------
// Inline fixture content for PDFs and internal docs
// ---------------------------------------------------------------------------
const SECURITY_WHITEPAPER = `Acme SaaS Security Whitepaper

Data Protection and Infrastructure Security

This document describes the security controls, compliance certifications, and operational practices that Acme SaaS uses to protect customer data.

Infrastructure

Acme SaaS runs on AWS in the us-east-1 and eu-west-1 regions. All compute runs inside private VPCs with no direct internet exposure. Load balancers terminate TLS 1.2 and higher. All internal service-to-service communication is encrypted with mutual TLS.

Data Encryption

Data at rest is encrypted with AES-256 using AWS KMS-managed keys. Each tenant's data is encrypted with a dedicated key. Backup snapshots are encrypted with a separate HSM-backed key. Data in transit uses TLS 1.3 where supported and TLS 1.2 as a minimum.

Access Control

Production access requires two-factor authentication and a hardware security key. We follow the principle of least privilege. Access to production is reviewed quarterly and revoked immediately upon offboarding. All access is logged to an immutable audit trail retained for 2 years.

Vulnerability Management

We run automated dependency scans on every pull request using Dependabot and Snyk. A third-party penetration test is conducted annually. Critical vulnerabilities are patched within 24 hours of disclosure; high-severity issues within 7 days.

Compliance

Acme SaaS is SOC 2 Type II certified. Annual audits are performed by an independent CPA firm. We are GDPR compliant and offer a Data Processing Agreement for EU customers. HIPAA Business Associate Agreements are available for Enterprise customers handling protected health information.

Incident Response

Our security incident response plan defines roles, escalation paths, and communication timelines. We commit to notifying affected customers within 72 hours of a confirmed breach, in compliance with GDPR Article 33.

Contact security@acme-saas.com for the full report or to report a vulnerability.`;

const PRICING_GUIDE = `Acme SaaS Pricing Guide

Effective January 2025

We offer three plans designed for teams of every size. All prices are in USD and billed monthly unless noted.

Starter — $49 per month

Designed for small support teams getting started with AI-assisted support.

Includes: up to 5 agent seats, 3 knowledge sources, 1,000 AI-drafted replies per month, basic reporting, email and chat widget channels, community support.

Pro — $149 per month

Our most popular plan for growing support teams.

Includes: up to 20 agent seats, unlimited knowledge sources, unlimited AI-drafted replies, auto-resolve up to 500 tickets per month, advanced reporting, all channels (Zendesk, Intercom, Slack, email, chat widget), priority support with 4-hour response SLA, Langfuse tracing dashboard.

Enterprise — Custom pricing

For large organizations with complex requirements.

Includes: unlimited agents, unlimited knowledge sources, unlimited auto-resolve, dedicated infrastructure, custom SLA, SSO/SAML, IP allowlisting, HIPAA BAA available, custom data retention, dedicated customer success manager, 99.9% uptime SLA with credits.

Annual Billing

Pay annually and receive a 20% discount on Starter and Pro plans. Enterprise contracts are annual by default with custom payment terms.

Add-Ons

Additional agent seats: $10 per seat per month on Starter, $8 on Pro. Extra auto-resolve volume: $0.05 per ticket beyond plan limit. Onboarding session (2 hours): $299 one-time.

Free Trial

All plans include a 14-day free trial. No credit card required. Trials include full Pro features regardless of the plan you select.

Contact sales@acme-saas.com for Enterprise pricing or volume discounts.`;

const ESCALATION_PLAYBOOK = `Escalation Playbook — Internal Use Only

This document defines how support agents should escalate tickets that cannot be resolved at Tier 1.

Tier 1: Agent-Resolved (target: 80% of tickets)

Agents handle standard how-to questions, billing inquiries, password resets, and integration setup using the AI knowledge base. Resolution target: first response within 2 hours, resolution within 24 hours.

If the AI draft confidence is below 70%, the agent must review and edit before sending. Never send a low-confidence draft unmodified.

Tier 2: Specialist Escalation

Escalate to Tier 2 when:
- The customer reports a potential bug or unexpected system behavior
- The issue involves account data integrity or data loss
- The customer is on an Enterprise plan and the issue is blocking production use
- Three or more exchanges have not resolved the issue

How to escalate: Tag the ticket with "tier-2" and assign it to the Tier 2 queue in Zendesk. Add an internal note summarizing what has been tried. Tier 2 target: response within 1 hour for Enterprise, 4 hours for Pro.

Tier 3: Engineering Escalation

Escalate to Tier 3 (Engineering) when:
- Confirmed product bug requiring a code change
- Data recovery or forensic investigation needed
- Security incident or suspected breach

How to escalate: Create a GitHub issue using the "Customer Bug Report" template. Link the Zendesk ticket. Post in #support-escalations Slack channel tagging @oncall-engineer. For security incidents, additionally page the security team via PagerDuty.

Customer Communication During Escalation

Always inform the customer when you are escalating. Use this template:
"I've escalated your ticket to our specialist team who can look into this more deeply. You can expect an update within [time]. Your ticket reference is [ID]."

Never tell the customer you are creating a GitHub issue or paging engineering. Use "our technical team" instead.

Do Not Escalate

Do not escalate tickets for: feature requests (log in Productboard instead), general how-to questions answerable by the knowledge base, billing disputes under $500 (handle directly with billing@acme-saas.com approval).`;

const REFUND_POLICY_INTERNAL = `Refund Policy — Internal Reference (Support Agents)

This document expands on the public refund policy with guidance for agents on how to handle specific scenarios.

Standard Refund Rules (summary)

30-day money-back guarantee on first subscription. No prorated refunds after 30 days except for billing errors, SLA violations, or security incidents. Annual plan: full refund within 30 days, prorated after. One-time purchases (onboarding, storage add-ons): non-refundable unless service failure.

Agent Authorization Levels

Agents can approve refunds up to $150 without manager sign-off. For refunds $150–$500, get manager approval via Slack DM to the on-duty manager. For refunds over $500, escalate to billing@acme-saas.com and cc your manager.

Goodwill Refunds

For long-tenured customers (12+ months), agents may offer a one-time goodwill credit of up to one month's subscription value even outside the normal policy. Document the reason in the ticket. This can only be offered once per customer account.

SLA Violation Credits

If the customer experienced a verified outage covered by our SLA:
- 99.9% SLA (Enterprise): 10x credit for each hour of downtime beyond the SLA
- Pro plan: 1 month credit for any month where uptime fell below 99.5%

Verify the outage against our status page history at status.acme-saas.com before approving SLA credits.

Processing a Refund

1. Confirm the original charge date and amount in Stripe (access via the Billing admin panel).
2. Get required approvals (see above).
3. Issue the refund in Stripe. Select the charge and click Refund. For partial refunds, enter the amount.
4. Note the refund ID in the Zendesk ticket.
5. Notify the customer: "We have issued a refund of $X. Please allow 5–10 business days for it to appear on your statement."
6. Tag the ticket "refund-issued" and close it.

If the customer disputes the refund amount or policy, escalate to billing@acme-saas.com. Do not get into extended policy debates in ticket replies.`;

// ---------------------------------------------------------------------------
// Main seeder function
// ---------------------------------------------------------------------------
export async function seedDocuments(tenants: TenantRef[]): Promise<void> {
  const acmeTenant = tenants.find((t) => t.slug === 'acme-saas');
  if (!acmeTenant) {
    logger.warn('acme-saas tenant not found — skipping document seed');
    return;
  }

  const tenantId = acmeTenant._id.toString();

  const admin = await UserModel.findOne({ tenantId: acmeTenant._id, role: 'admin' });
  if (!admin) throw new Error('acme-saas admin user not found — run seedUsers first');
  const addedBy = admin._id.toString();

  // Upsert a shared paste source and upload source
  const pasteSource = await SourceModel.findOneAndUpdate(
    { tenantId: acmeTenant._id, type: 'paste', subtype: 'text' },
    {
      $setOnInsert: {
        tenantId: acmeTenant._id,
        type: 'paste',
        subtype: 'text',
        config: { name: 'seed-paste' },
        status: 'active',
        addedBy: admin._id,
      },
    },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
  );

  const uploadSource = await SourceModel.findOneAndUpdate(
    { tenantId: acmeTenant._id, type: 'upload', subtype: 'file' },
    {
      $setOnInsert: {
        tenantId: acmeTenant._id,
        type: 'upload',
        subtype: 'file',
        config: { name: 'seed-uploads' },
        status: 'active',
        addedBy: admin._id,
      },
    },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
  );

  const { queue, pendingIds } = makeInlineQueue();
  const docService = new DocumentService(queue);
  const storage = getStorage();

  // 1. Markdown help articles (customer-facing)
  const articleFiles = (await readdir(ARTICLES_DIR)).filter((f) => f.endsWith('.md')).sort();
  for (const file of articleFiles) {
    const raw = await readFile(join(ARTICLES_DIR, file), 'utf8');
    const { title, content } = stripFrontmatter(raw);
    const externalId = `help-articles/${file}`;

    const existing = await DocumentModel.forTenant(tenantId).findOne({
      sourceId: pasteSource!._id,
      externalId,
      status: 'ready',
    });
    if (existing) {
      logger.info({ file }, 'article already ready — skipping');
      continue;
    }

    await docService.add({
      tenantId,
      sourceId: pasteSource!._id.toString(),
      sourceType: 'paste',
      externalId,
      title,
      content,
      visibility: 'customer-facing',
      addedBy,
    });
    logger.info({ file }, 'queued article for ingest');
  }

  // 2. PDF uploads (customer-facing)
  const pdfFixtures = [
    {
      fileKey: 'seeded/security-whitepaper.pdf',
      externalId: 'uploads/security-whitepaper',
      title: 'Security Whitepaper',
      content: SECURITY_WHITEPAPER,
    },
    {
      fileKey: 'seeded/pricing-guide.pdf',
      externalId: 'uploads/pricing-guide',
      title: 'Pricing Guide',
      content: PRICING_GUIDE,
    },
  ];

  for (const pdf of pdfFixtures) {
    const existing = await DocumentModel.forTenant(tenantId).findOne({
      sourceId: uploadSource!._id,
      externalId: pdf.externalId,
      status: 'ready',
    });
    if (existing) {
      logger.info({ title: pdf.title }, 'PDF already ready — skipping');
      continue;
    }

    const pdfBuf = makePdf(pdf.title, pdf.content);
    await storage.put(tenantId, pdf.fileKey, pdfBuf, 'application/pdf');

    await docService.add({
      tenantId,
      sourceId: uploadSource!._id.toString(),
      sourceType: 'upload',
      externalId: pdf.externalId,
      title: pdf.title,
      content: pdf.content,
      fileKey: pdf.fileKey,
      fileMimeType: 'application/pdf',
      visibility: 'customer-facing',
      addedBy,
    });
    logger.info({ title: pdf.title }, 'queued PDF for ingest');
  }

  // 3. Internal-only docs (paste)
  const internalDocs = [
    {
      externalId: 'paste/escalation-playbook',
      title: 'Escalation Playbook',
      content: ESCALATION_PLAYBOOK,
    },
    {
      externalId: 'paste/refund-policy-internal',
      title: 'Refund Policy (Internal)',
      content: REFUND_POLICY_INTERNAL,
    },
  ];

  for (const doc of internalDocs) {
    const existing = await DocumentModel.forTenant(tenantId).findOne({
      sourceId: pasteSource!._id,
      externalId: doc.externalId,
      status: 'ready',
    });
    if (existing) {
      logger.info({ title: doc.title }, 'internal doc already ready — skipping');
      continue;
    }

    await docService.add({
      tenantId,
      sourceId: pasteSource!._id.toString(),
      sourceType: 'paste',
      externalId: doc.externalId,
      title: doc.title,
      content: doc.content,
      visibility: 'internal',
      addedBy,
    });
    logger.info({ title: doc.title }, 'queued internal doc for ingest');
  }

  if (pendingIds.length === 0) {
    logger.info('all documents already ready — nothing to ingest');
    return;
  }

  // 4. Drive ingest jobs inline (batches of 3)
  logger.info({ count: pendingIds.length }, 'running ingest jobs inline');
  const BATCH = 3;
  for (let i = 0; i < pendingIds.length; i += BATCH) {
    const batch = pendingIds.slice(i, i + BATCH);
    await Promise.all(batch.map((id) => runIngestDocument(id)));
    logger.info(
      { done: Math.min(i + BATCH, pendingIds.length), total: pendingIds.length },
      'ingest batch complete',
    );
  }

  logger.info('document seed complete');
}
