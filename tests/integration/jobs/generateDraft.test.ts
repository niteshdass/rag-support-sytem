import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

vi.mock('../../../src/domain/rag/pipeline.factory.js', () => ({
  getPipeline: vi.fn(),
  setPipeline: vi.fn(),
}));

vi.mock('../../../src/infra/llm/factory.js', () => ({
  getLLMClient: vi.fn(),
}));

import { runGenerateDraft } from '../../../src/jobs/generateDraft.js';
import { getPipeline } from '../../../src/domain/rag/pipeline.factory.js';
import { TenantModel } from '../../../src/infra/mongo/models/Tenant.js';
import { TicketModel } from '../../../src/infra/mongo/models/Ticket.js';
import { ConversationModel } from '../../../src/infra/mongo/models/Conversation.js';
import { DraftModel } from '../../../src/infra/mongo/models/Draft.js';
import type { PipelineAnswer } from '../../../src/domain/rag/pipeline.js';

const FIXED_ANSWER: PipelineAnswer = {
  text: 'You can find the export button in Settings > Data > Export. [1]',
  citations: [
    {
      chunkId: new mongoose.Types.ObjectId().toString(),
      documentId: new mongoose.Types.ObjectId().toString(),
      snippet: 'The export button is located in Settings > Data > Export.',
      score: 0.92,
    },
  ],
  confidence: 0.91,
  route: 'draft',
  traceId: 'trace-test-001',
};

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

const TENANT_ID = new mongoose.Types.ObjectId();

beforeEach(async () => {
  await Promise.all([
    TicketModel.deleteMany({ tenantId: TENANT_ID }),
    ConversationModel.deleteMany({ tenantId: TENANT_ID }),
    DraftModel.deleteMany({ tenantId: TENANT_ID }),
  ]);

  vi.mocked(getPipeline).mockReturnValue({
    answer: vi.fn().mockResolvedValue(FIXED_ANSWER),
  } as unknown as ReturnType<typeof getPipeline>);
});

afterEach(() => {
  vi.clearAllMocks();
});

async function createTenant() {
  return TenantModel.findByIdAndUpdate(
    TENANT_ID,
    { $setOnInsert: { name: 'Acme', slug: 'acme', confidenceThreshold: 0.8 } },
    { upsert: true, new: true },
  );
}

async function createTicketWithConversation() {
  const ticket = await TicketModel.create({
    tenantId: TENANT_ID,
    channel: 'zendesk',
    externalId: `zd-${Date.now()}`,
    subject: 'Cannot export CSV',
    body: 'Where is the export button?',
    customer: { email: 'user@example.com' },
    status: 'new',
  });

  const conversation = await ConversationModel.create({
    tenantId: TENANT_ID,
    ticketId: ticket._id,
    messages: [{ role: 'user', content: ticket.body, timestamp: new Date() }],
    confidenceScores: [],
  });

  await TicketModel.findByIdAndUpdate(ticket._id, {
    $set: { conversationId: conversation._id },
  });

  return { ticket, conversation };
}

describe('runGenerateDraft', () => {
  describe('happy path', () => {
    it('creates a Draft with text, citations, and confidence', async () => {
      await createTenant();
      const { ticket } = await createTicketWithConversation();

      await runGenerateDraft(ticket._id.toString());

      const drafts = await DraftModel.find({ tenantId: TENANT_ID, ticketId: ticket._id });
      expect(drafts).toHaveLength(1);

      const draft = drafts[0]!;
      expect(draft.text).toBe(FIXED_ANSWER.text);
      expect(draft.confidence).toBe(FIXED_ANSWER.confidence);
      expect(draft.route).toBe(FIXED_ANSWER.route);
      expect(draft.citations).toHaveLength(1);
      expect(draft.citations[0]!.snippet).toBe(FIXED_ANSWER.citations[0]!.snippet);
      expect(draft.citations[0]!.score).toBe(FIXED_ANSWER.citations[0]!.score);
    });

    it('updates ticket status to drafted', async () => {
      await createTenant();
      const { ticket } = await createTicketWithConversation();

      await runGenerateDraft(ticket._id.toString());

      const updated = await TicketModel.findById(ticket._id);
      expect(updated?.status).toBe('drafted');
    });

    it('passes correct tenantId and audience to pipeline', async () => {
      await createTenant();
      const { ticket } = await createTicketWithConversation();
      const mockAnswer = vi.fn().mockResolvedValue(FIXED_ANSWER);
      vi.mocked(getPipeline).mockReturnValue({ answer: mockAnswer } as unknown as ReturnType<typeof getPipeline>);

      await runGenerateDraft(ticket._id.toString());

      expect(mockAnswer).toHaveBeenCalledOnce();
      const [query, ctx] = mockAnswer.mock.calls[0]!;
      expect(query).toBe(ticket.body);
      expect(ctx.tenantId).toBe(TENANT_ID.toString());
      expect(ctx.audience).toBe('internal-agent');
      expect(ctx.confidenceThreshold).toBe(0.8);
    });
  });

  describe('failure path', () => {
    it('throws when ticket not found', async () => {
      const fakeId = new mongoose.Types.ObjectId().toString();
      await expect(runGenerateDraft(fakeId)).rejects.toThrow('Ticket not found');
    });

    it('throws when tenant not found', async () => {
      const ticket = await TicketModel.create({
        tenantId: TENANT_ID,
        channel: 'zendesk',
        externalId: `zd-orphan-${Date.now()}`,
        subject: 'Orphan',
        body: 'No tenant for this.',
        customer: {},
        status: 'new',
      });

      await TenantModel.findByIdAndDelete(TENANT_ID);

      await expect(runGenerateDraft(ticket._id.toString())).rejects.toThrow('Tenant not found');

      await createTenant();
    });
  });
});
