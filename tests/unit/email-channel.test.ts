import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import type { Transporter } from 'nodemailer';

vi.mock('../../src/infra/notifications/slack.js', () => ({
  notifyEscalation: vi.fn().mockResolvedValue(undefined),
}));

import {
  handleEmailMessage,
  type ParsedEmail,
  type EmailHandlerDeps,
  type EmailConfig,
} from '../../src/channels/email/channel.js';
import { notifyEscalation } from '../../src/infra/notifications/slack.js';
import { TicketModel } from '../../src/infra/mongo/models/Ticket.js';
import { ConversationModel } from '../../src/infra/mongo/models/Conversation.js';

const notifyEscalationMock = vi.mocked(notifyEscalation);

// ---------------------------------------------------------------------------
// MongoDB setup
// ---------------------------------------------------------------------------

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

beforeEach(async () => {
  await TicketModel.deleteMany({});
  await ConversationModel.deleteMany({});
  notifyEscalationMock.mockClear();
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CONFIG: EmailConfig = {
  imap: { host: 'imap.example.com', port: 993, secure: true, auth: { user: 'u', pass: 'p' } },
  smtp: { host: 'smtp.example.com', port: 465, secure: true, auth: { user: 'u', pass: 'p' } },
  fromAddress: 'support@example.com',
};

const TENANT_ID = new mongoose.Types.ObjectId().toString();

function makeEmail(overrides: Partial<ParsedEmail> = {}): ParsedEmail {
  return {
    messageId: '<msg-001@mail.example.com>',
    inReplyTo: undefined,
    references: [],
    fromAddress: 'customer@acme.com',
    fromName: 'Alice',
    subject: 'Cannot export CSV',
    bodyText: 'Hi, I cannot find the export button for CSV. Help?',
    ...overrides,
  };
}

function makePipeline(route: 'auto' | 'draft' = 'auto', confidence = 0.9) {
  return {
    answer: vi.fn().mockResolvedValue({
      text: 'Click File → Export → CSV.',
      confidence,
      route,
    }),
  };
}

function makeTransporter() {
  return {
    sendMail: vi.fn().mockResolvedValue({ messageId: '<reply-001@smtp>' }),
  } as unknown as Transporter;
}

function makeDeps(
  overrides: Partial<EmailHandlerDeps> = {},
): EmailHandlerDeps {
  return {
    pipeline: makePipeline(),
    transporter: makeTransporter(),
    config: CONFIG,
    tenantId: TENANT_ID,
    autoResolveEnabled: true,
    confidenceThreshold: 0.7,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('handleEmailMessage — new thread, auto-resolve', () => {
  it('creates ticket + conversation and sends reply', async () => {
    const deps = makeDeps();
    const email = makeEmail();

    await handleEmailMessage(email, deps);

    const ticket = await TicketModel.findOne({ channel: 'email', externalId: 'msg-001@mail.example.com' });
    expect(ticket).not.toBeNull();
    expect(ticket!.status).toBe('auto_resolved');
    expect(ticket!.customer.email).toBe('customer@acme.com');

    const conv = await ConversationModel.findOne({ ticketId: ticket!._id });
    expect(conv).not.toBeNull();
    expect(conv!.messages).toHaveLength(2);
    expect(conv!.messages[0]?.role).toBe('user');
    expect(conv!.messages[1]?.role).toBe('assistant');

    expect((deps.transporter.sendMail as ReturnType<typeof vi.fn>)).toHaveBeenCalledOnce();
    const mailCall = (deps.transporter.sendMail as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(mailCall.to).toBe('customer@acme.com');
    expect(mailCall.subject).toBe('Re: Cannot export CSV');
    expect(mailCall.inReplyTo).toContain('msg-001@mail.example.com');
  });
});

describe('handleEmailMessage — new thread, draft route', () => {
  it('creates ticket with awaiting_agent status, no reply sent', async () => {
    const deps = makeDeps({ pipeline: makePipeline('draft', 0.5) });
    await handleEmailMessage(makeEmail(), deps);

    const ticket = await TicketModel.findOne({ channel: 'email' });
    expect(ticket!.status).toBe('awaiting_agent');
    expect((deps.transporter.sendMail as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });
});

describe('handleEmailMessage — reply to existing thread', () => {
  it('continues existing conversation and replies', async () => {
    // Seed original ticket + conversation
    const originalMsgId = 'original-001@mail.example.com';
    const ticket = await TicketModel.create({
      tenantId: new mongoose.Types.ObjectId(TENANT_ID),
      channel: 'email',
      externalId: originalMsgId,
      customer: { email: 'customer@acme.com', name: 'Alice' },
      subject: 'Cannot export CSV',
      body: 'Initial question',
      status: 'auto_resolved',
    });
    const conv = await ConversationModel.create({
      tenantId: new mongoose.Types.ObjectId(TENANT_ID),
      ticketId: ticket._id,
      messages: [
        { role: 'user', content: 'Initial question', timestamp: new Date() },
        { role: 'assistant', content: 'Click Export.', timestamp: new Date() },
      ],
      confidenceScores: [0.9],
    });
    await TicketModel.findByIdAndUpdate(ticket._id, { $set: { conversationId: conv._id } });

    // Customer replies
    const replyEmail = makeEmail({
      messageId: '<reply-from-customer@mail.example.com>',
      inReplyTo: `<${originalMsgId}>`,
      references: [originalMsgId],
      bodyText: 'Thanks! But now the file is corrupted.',
    });

    const deps = makeDeps();
    await handleEmailMessage(replyEmail, deps);

    const updatedConv = await ConversationModel.findById(conv._id);
    expect(updatedConv!.messages).toHaveLength(4);

    // Pipeline should see prior message history
    const pipelineCall = (deps.pipeline.answer as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(pipelineCall[1].recentMessages).toHaveLength(2);
  });
});

describe('handleEmailMessage — duplicate message', () => {
  it('skips silently on duplicate message-id', async () => {
    const deps = makeDeps();
    const email = makeEmail();

    // First call: creates ticket
    await handleEmailMessage(email, deps);
    // Second call: same messageId → should not throw
    await expect(handleEmailMessage(email, deps)).resolves.not.toThrow();

    // Still only one ticket
    const count = await TicketModel.countDocuments({ channel: 'email' });
    expect(count).toBe(1);
  });
});

describe('handleEmailMessage — threading via References header', () => {
  it('finds existing ticket by reference chain', async () => {
    const originalMsgId = 'thread-root@mail.example.com';
    const ticket = await TicketModel.create({
      tenantId: new mongoose.Types.ObjectId(TENANT_ID),
      channel: 'email',
      externalId: originalMsgId,
      customer: { email: 'customer@acme.com' },
      subject: 'Billing issue',
      body: 'First message',
      status: 'auto_resolved',
    });
    const conv = await ConversationModel.create({
      tenantId: new mongoose.Types.ObjectId(TENANT_ID),
      ticketId: ticket._id,
      messages: [{ role: 'user', content: 'First message', timestamp: new Date() }],
      confidenceScores: [],
    });
    await TicketModel.findByIdAndUpdate(ticket._id, { $set: { conversationId: conv._id } });

    // Third message in chain — In-Reply-To points to second message, but References includes root
    const email = makeEmail({
      messageId: '<third@mail.example.com>',
      inReplyTo: '<second@mail.example.com>',
      references: [originalMsgId, 'second@mail.example.com'],
      subject: 'Billing issue',
      bodyText: 'Still not fixed.',
    });

    const deps = makeDeps();
    await handleEmailMessage(email, deps);

    const updatedConv = await ConversationModel.findById(conv._id);
    expect(updatedConv!.messages).toHaveLength(3);
    // No new ticket created
    const ticketCount = await TicketModel.countDocuments({ channel: 'email' });
    expect(ticketCount).toBe(1);
  });
});

describe('handleEmailMessage — Re: prefix not doubled', () => {
  it('does not add Re: when subject already starts with Re:', async () => {
    const deps = makeDeps();
    const email = makeEmail({ subject: 'Re: Cannot export CSV' });
    await handleEmailMessage(email, deps);

    const mailCall = (deps.transporter.sendMail as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(mailCall.subject).toBe('Re: Cannot export CSV');
  });
});

describe('handleEmailMessage — escape hatch footer', () => {
  it('auto-reply includes ESCALATE footer', async () => {
    const deps = makeDeps();
    await handleEmailMessage(makeEmail(), deps);

    const mailCall = (deps.transporter.sendMail as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(mailCall.text).toContain('ESCALATE');
    expect(mailCall.text).toContain('human agent');
  });
});

describe('handleEmailMessage — ESCALATE keyword escape hatch', () => {
  it('marks existing ticket escalated when customer replies ESCALATE', async () => {
    const originalMsgId = 'escalate-root@mail.example.com';
    const ticket = await TicketModel.create({
      tenantId: new mongoose.Types.ObjectId(TENANT_ID),
      channel: 'email',
      externalId: originalMsgId,
      customer: { email: 'customer@acme.com', name: 'Alice' },
      subject: 'Export issue',
      body: 'First question',
      status: 'auto_resolved',
    });
    const conv = await ConversationModel.create({
      tenantId: new mongoose.Types.ObjectId(TENANT_ID),
      ticketId: ticket._id,
      messages: [],
      confidenceScores: [],
    });
    await TicketModel.findByIdAndUpdate(ticket._id, { $set: { conversationId: conv._id } });

    const escalateEmail = makeEmail({
      messageId: '<escalate-reply@mail.example.com>',
      inReplyTo: `<${originalMsgId}>`,
      references: [originalMsgId],
      bodyText: 'ESCALATE',
    });

    const deps = makeDeps({ slackEscalationWebhookUrl: 'https://hooks.slack.com/test' });
    await handleEmailMessage(escalateEmail, deps);

    const updated = await TicketModel.findById(ticket._id);
    expect(updated!.status).toBe('escalated');

    // RAG pipeline NOT called
    expect((deps.pipeline.answer as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();

    // Slack notification sent
    expect(notifyEscalationMock).toHaveBeenCalledOnce();
    const call = notifyEscalationMock.mock.calls[0][0] as {
      channel: string;
      webhookUrl: string;
    };
    expect(call.channel).toBe('email');
    expect(call.webhookUrl).toBe('https://hooks.slack.com/test');
  });

  it('does not send Slack notification when no webhook configured', async () => {
    const originalMsgId = 'no-webhook-root@mail.example.com';
    const ticket = await TicketModel.create({
      tenantId: new mongoose.Types.ObjectId(TENANT_ID),
      channel: 'email',
      externalId: originalMsgId,
      customer: { email: 'customer@acme.com' },
      subject: 'Some issue',
      body: 'Question',
      status: 'auto_resolved',
    });
    const conv = await ConversationModel.create({
      tenantId: new mongoose.Types.ObjectId(TENANT_ID),
      ticketId: ticket._id,
      messages: [],
      confidenceScores: [],
    });
    await TicketModel.findByIdAndUpdate(ticket._id, { $set: { conversationId: conv._id } });

    const escalateEmail = makeEmail({
      messageId: '<no-webhook-reply@mail.example.com>',
      inReplyTo: `<${originalMsgId}>`,
      references: [originalMsgId],
      bodyText: 'ESCALATE',
    });

    // No slackEscalationWebhookUrl
    await handleEmailMessage(escalateEmail, makeDeps());

    const updated = await TicketModel.findById(ticket._id);
    expect(updated!.status).toBe('escalated');
    expect(notifyEscalationMock).not.toHaveBeenCalled();
  });

  it('ESCALATE keyword is case-insensitive', async () => {
    const originalMsgId = 'case-root@mail.example.com';
    const ticket = await TicketModel.create({
      tenantId: new mongoose.Types.ObjectId(TENANT_ID),
      channel: 'email',
      externalId: originalMsgId,
      customer: { email: 'customer@acme.com' },
      subject: 'Issue',
      body: 'Question',
      status: 'auto_resolved',
    });
    const conv = await ConversationModel.create({
      tenantId: new mongoose.Types.ObjectId(TENANT_ID),
      ticketId: ticket._id,
      messages: [],
      confidenceScores: [],
    });
    await TicketModel.findByIdAndUpdate(ticket._id, { $set: { conversationId: conv._id } });

    const escalateEmail = makeEmail({
      messageId: '<case-reply@mail.example.com>',
      inReplyTo: `<${originalMsgId}>`,
      references: [originalMsgId],
      bodyText: 'escalate',
    });

    await handleEmailMessage(escalateEmail, makeDeps());

    const updated = await TicketModel.findById(ticket._id);
    expect(updated!.status).toBe('escalated');
  });

  it('does NOT treat ESCALATE embedded in larger text as escape hatch', async () => {
    const deps = makeDeps();
    const email = makeEmail({
      bodyText: 'Please ESCALATE this to your manager for review of my account settings.',
    });

    await handleEmailMessage(email, deps);

    // Pipeline ran normally — ESCALATE is not alone on a line
    expect((deps.pipeline.answer as ReturnType<typeof vi.fn>)).toHaveBeenCalledOnce();
    expect(notifyEscalationMock).not.toHaveBeenCalled();
  });
});
