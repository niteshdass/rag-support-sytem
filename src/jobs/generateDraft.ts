import Agenda, { type Job } from 'agenda';
import mongoose from 'mongoose';
import { TicketModel } from '../infra/mongo/models/Ticket.js';
import { ConversationModel } from '../infra/mongo/models/Conversation.js';
import { TenantModel } from '../infra/mongo/models/Tenant.js';
import { DraftModel } from '../infra/mongo/models/Draft.js';
import { getPipeline } from '../domain/rag/pipeline.factory.js';
import { logger } from '../observability/logger.js';

export function defineGenerateDraft(agenda: Agenda): void {
  agenda.define('generate-draft', { concurrency: 3 }, async (job: Job) => {
    const { ticketId } = job.attrs.data as { ticketId: string };
    await runGenerateDraft(ticketId);
  });
}

export async function runGenerateDraft(ticketId: string): Promise<void> {
  const log = logger.child({ job: 'generate-draft', ticketId });
  log.info('starting');

  const ticket = await TicketModel.findById(ticketId);
  if (!ticket) {
    throw new Error(`Ticket not found: ${ticketId}`);
  }

  const tenantId = ticket.tenantId.toString();

  const [tenant, conversation] = await Promise.all([
    TenantModel.findById(ticket.tenantId).lean(),
    ticket.conversationId
      ? ConversationModel.findById(ticket.conversationId).lean()
      : Promise.resolve(null),
  ]);

  if (!tenant) {
    throw new Error(`Tenant not found: ${tenantId}`);
  }

  const recentMessages = conversation?.messages
    .slice(0, -1)
    .map(m => `${m.role}: ${m.content}`) ?? [];

  const answer = await getPipeline().answer(ticket.body, {
    tenantId,
    audience: 'internal-agent',
    confidenceThreshold: tenant.confidenceThreshold,
    recentMessages,
  });

  const citations = answer.citations.map(c => ({
    documentId: new mongoose.Types.ObjectId(c.documentId),
    chunkId: new mongoose.Types.ObjectId(c.chunkId),
    score: c.score,
    snippet: c.snippet,
  }));

  await DraftModel.create({
    tenantId: ticket.tenantId,
    ticketId: ticket._id,
    text: answer.text,
    citations,
    confidence: answer.confidence,
    route: answer.route,
  });

  await TicketModel.findByIdAndUpdate(ticketId, {
    $set: { status: 'drafted' },
  });

  log.info({ confidence: answer.confidence, route: answer.route }, 'generate-draft complete');
}
