import { ImapFlow } from 'imapflow';
import nodemailer, { type Transporter } from 'nodemailer';
import mongoose from 'mongoose';
import { z } from 'zod';
import { TenantModel } from '../../infra/mongo/models/Tenant.js';
import { TicketModel } from '../../infra/mongo/models/Ticket.js';
import { ConversationModel } from '../../infra/mongo/models/Conversation.js';
import { getPipeline } from '../../domain/rag/pipeline.factory.js';
import { logger } from '../../observability/logger.js';

// ---------------------------------------------------------------------------
// Per-tenant email configuration (stored in tenant.settings.email)
// ---------------------------------------------------------------------------

export const EmailConfigSchema = z.object({
  imap: z.object({
    host: z.string(),
    port: z.number().int().positive(),
    secure: z.boolean().default(true),
    auth: z.object({ user: z.string(), pass: z.string() }),
  }),
  smtp: z.object({
    host: z.string(),
    port: z.number().int().positive(),
    secure: z.boolean().default(true),
    auth: z.object({ user: z.string(), pass: z.string() }),
  }),
  fromAddress: z.string().email(),
});

export type EmailConfig = z.infer<typeof EmailConfigSchema>;

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

export interface ParsedEmail {
  messageId: string;
  inReplyTo: string | undefined;
  references: string[];
  fromAddress: string;
  fromName: string | undefined;
  subject: string;
  bodyText: string;
}

interface PipelineLike {
  answer(
    query: string,
    ctx: {
      tenantId: string;
      audience: 'end-user' | 'internal-agent';
      autoResolveEnabled: boolean;
      confidenceThreshold: number;
      recentMessages?: string[];
    },
  ): Promise<{ text: string; confidence: number; route: 'auto' | 'draft' }>;
}

export interface EmailHandlerDeps {
  pipeline: PipelineLike;
  transporter: Transporter;
  config: EmailConfig;
  tenantId: string;
  autoResolveEnabled: boolean;
  confidenceThreshold: number;
}

// ---------------------------------------------------------------------------
// Header helpers
// ---------------------------------------------------------------------------

function stripAngles(s: string): string {
  return s.replace(/^<|>$/g, '').trim();
}

function parseRawHeaders(buf: Buffer): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of buf.toString('utf8').split(/\r?\n/)) {
    const colon = line.indexOf(':');
    if (colon > 0) {
      const key = line.slice(0, colon).toLowerCase().trim();
      const val = line.slice(colon + 1).trim();
      if (!out[key]) out[key] = val;
    }
  }
  return out;
}

function splitReferences(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw.split(/\s+/).map(stripAngles).filter(Boolean);
}

// ---------------------------------------------------------------------------
// Core handler — exported so tests can call it directly
// ---------------------------------------------------------------------------

export async function handleEmailMessage(
  email: ParsedEmail,
  deps: EmailHandlerDeps,
): Promise<void> {
  const { pipeline, transporter, config, tenantId, autoResolveEnabled, confidenceThreshold } = deps;
  const log = logger.child({ tenantId, messageId: email.messageId });

  // Collect all message-IDs from this thread to check for existing tickets
  const inReplyTo = email.inReplyTo ? stripAngles(email.inReplyTo) : undefined;
  const candidateIds = [
    ...(inReplyTo ? [inReplyTo] : []),
    ...email.references,
  ];

  let existingTicket = candidateIds.length > 0
    ? await TicketModel.forTenant(tenantId).findOne({
        channel: 'email',
        externalId: { $in: candidateIds },
      })
    : null;

  let existingConversation = existingTicket?.conversationId
    ? await ConversationModel.forTenant(tenantId).findOne({
        _id: existingTicket.conversationId,
      })
    : null;

  let ticketId: mongoose.Types.ObjectId;

  if (!existingTicket) {
    const cleanId = stripAngles(email.messageId);

    const created = await (async () => {
      try {
        return await TicketModel.create({
          tenantId: new mongoose.Types.ObjectId(tenantId),
          channel: 'email',
          externalId: cleanId,
          customer: {
            email: email.fromAddress,
            ...(email.fromName !== undefined ? { name: email.fromName } : {}),
          },
          subject: email.subject,
          body: email.bodyText,
          status: 'new',
        });
      } catch (err: unknown) {
        if ((err as { code?: number }).code === 11000) return null;
        throw err;
      }
    })();

    if (!created) {
      log.info('email already processed, skipping');
      return;
    }

    ticketId = created._id as mongoose.Types.ObjectId;

    const newConv = await ConversationModel.create({
      tenantId: new mongoose.Types.ObjectId(tenantId),
      ticketId,
      messages: [],
      confidenceScores: [],
    });

    await TicketModel.findByIdAndUpdate(ticketId, {
      $set: { conversationId: newConv._id },
    });

    existingConversation = newConv;
  } else {
    ticketId = existingTicket._id as mongoose.Types.ObjectId;
  }

  if (!existingConversation) {
    log.warn('conversation not found for existing ticket, skipping');
    return;
  }

  const conversation = existingConversation;
  const history = conversation.messages.slice(-10).map(m => `${m.role}: ${m.content}`);

  const answer = await pipeline.answer(email.bodyText, {
    tenantId,
    audience: 'end-user',
    autoResolveEnabled,
    confidenceThreshold,
    recentMessages: history,
  });

  conversation.messages.push({ role: 'user', content: email.bodyText, timestamp: new Date() });
  conversation.messages.push({ role: 'assistant', content: answer.text, timestamp: new Date() });
  conversation.confidenceScores.push(answer.confidence);
  await conversation.save();

  if (answer.route === 'auto') {
    const originalId = stripAngles(email.messageId);
    const refsChain = [...email.references, originalId].join(' ');
    const subject = email.subject.startsWith('Re:')
      ? email.subject
      : `Re: ${email.subject}`;

    await transporter.sendMail({
      from: config.fromAddress,
      to: email.fromAddress,
      subject,
      text: answer.text,
      inReplyTo: `<${originalId}>`,
      references: refsChain,
    });

    await TicketModel.findByIdAndUpdate(ticketId, { $set: { status: 'auto_resolved' } });
    log.info({ confidence: answer.confidence }, 'email: auto-resolved and replied');
  } else {
    await TicketModel.findByIdAndUpdate(ticketId, { $set: { status: 'awaiting_agent' } });
    log.info({ confidence: answer.confidence }, 'email: drafted, awaiting agent');
  }
}

// ---------------------------------------------------------------------------
// IMAPFlow parsing helper
// ---------------------------------------------------------------------------

function parseImapMessage(msg: {
  envelope?: {
    messageId?: string;
    subject?: string;
    from?: Array<{ name?: string; address?: string }>;
  };
  headers?: Buffer;
  bodyParts?: Map<string, Buffer>;
}): ParsedEmail | null {
  const messageId = msg.envelope?.messageId;
  const subject = msg.envelope?.subject;
  const fromEntry = msg.envelope?.from?.[0];

  if (!messageId || !subject || !fromEntry?.address) {
    return null;
  }

  const rawHeaders = msg.headers ? parseRawHeaders(msg.headers) : {};
  const bodyText = msg.bodyParts?.get('TEXT')?.toString('utf8')?.trim() ?? '(no text body)';

  return {
    messageId,
    inReplyTo: rawHeaders['in-reply-to'],
    references: splitReferences(rawHeaders['references']),
    fromAddress: fromEntry.address,
    fromName: fromEntry.name,
    subject,
    bodyText,
  };
}

// ---------------------------------------------------------------------------
// IMAP listener management
// ---------------------------------------------------------------------------

const activeClients = new Map<string, ImapFlow>();

async function processUnseen(
  client: ImapFlow,
  tenantId: string,
  config: EmailConfig,
  transporter: Transporter,
  tenant: { autoResolveEnabled: boolean; confidenceThreshold: number },
): Promise<void> {
  const pipeline = getPipeline();
  const deps: EmailHandlerDeps = {
    pipeline,
    transporter,
    config,
    tenantId,
    autoResolveEnabled: tenant.autoResolveEnabled,
    confidenceThreshold: tenant.confidenceThreshold,
  };

  const uids = await client.search({ seen: false }, { uid: true });
  if (!uids || uids.length === 0) return;

  for await (const msg of client.fetch(uids as number[], {
    envelope: true,
    bodyParts: ['TEXT'],
    headers: ['in-reply-to', 'references'],
    uid: true,
  }, { uid: true })) {
    const email = parseImapMessage(msg);
    if (!email) {
      logger.warn({ tenantId, uid: msg.uid }, 'email: skipping malformed message');
      continue;
    }

    try {
      await handleEmailMessage(email, deps);
    } catch (err) {
      logger.error({ err, tenantId, messageId: email.messageId }, 'email: handler error');
    }

    await client.messageFlagsAdd({ uid: msg.uid }, ['\\Seen'], { uid: true });
  }
}

export async function startEmailListener(
  tenantId: string,
  config: EmailConfig,
  tenant: { autoResolveEnabled: boolean; confidenceThreshold: number },
): Promise<void> {
  if (activeClients.has(tenantId)) {
    logger.warn({ tenantId }, 'email: listener already running');
    return;
  }

  const transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: config.smtp.auth,
  });

  const client = new ImapFlow({
    host: config.imap.host,
    port: config.imap.port,
    secure: config.imap.secure,
    auth: config.imap.auth,
    logger: false,
  });

  activeClients.set(tenantId, client);

  const log = logger.child({ tenantId });

  const run = async () => {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');

    try {
      await processUnseen(client, tenantId, config, transporter, tenant);

      while (client.usable) {
        try {
          await client.idle();
          if (client.usable) {
            await processUnseen(client, tenantId, config, transporter, tenant);
          }
        } catch (err) {
          if (!client.usable) break;
          log.warn({ err }, 'email: IDLE interrupted, retrying');
          await new Promise(r => setTimeout(r, 5_000));
        }
      }
    } finally {
      lock.release();
    }
  };

  run().catch(err => {
    log.error({ err }, 'email: listener crashed');
    activeClients.delete(tenantId);
  });

  log.info({ host: config.imap.host }, 'email: listener started');
}

export async function stopEmailListener(tenantId: string): Promise<void> {
  const client = activeClients.get(tenantId);
  if (!client) return;
  activeClients.delete(tenantId);
  try {
    await client.logout();
  } catch {
    // already disconnected
  }
}

export async function startAllEmailListeners(): Promise<void> {
  const tenants = await TenantModel.find({});
  for (const tenant of tenants) {
    const raw = (tenant.settings as Record<string, unknown>)?.email;
    const parsed = EmailConfigSchema.safeParse(raw);
    if (!parsed.success) continue;

    await startEmailListener(
      (tenant._id as mongoose.Types.ObjectId).toString(),
      parsed.data,
      { autoResolveEnabled: tenant.autoResolveEnabled, confidenceThreshold: tenant.confidenceThreshold },
    );
  }
}

export async function stopAllEmailListeners(): Promise<void> {
  await Promise.allSettled(
    [...activeClients.keys()].map(id => stopEmailListener(id)),
  );
}
