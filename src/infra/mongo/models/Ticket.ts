import mongoose, { Schema, type Document } from 'mongoose';
import { z } from 'zod';
import {
  tenantScopePlugin,
  type WithTenantScope,
} from '../plugins/tenantScope.js';

export const TicketCreateSchema = z.object({
  tenantId: z.string().min(1),
  channel: z.enum(['zendesk', 'intercom', 'email', 'chat', 'slack']),
  externalId: z.string().min(1),
  customer: z.object({
    email: z.string().email().optional(),
    name: z.string().optional(),
    externalId: z.string().optional(),
  }),
  subject: z.string().min(1),
  body: z.string().min(1),
  status: z
    .enum(['new', 'awaiting_agent', 'drafted', 'auto_resolved', 'escalated', 'closed'])
    .default('new'),
  conversationId: z.string().optional(),
});

export type TicketCreate = z.infer<typeof TicketCreateSchema>;

export interface TicketDocument extends Document {
  tenantId: mongoose.Types.ObjectId;
  channel: 'zendesk' | 'intercom' | 'email' | 'chat' | 'slack';
  externalId: string;
  customer: {
    email?: string;
    name?: string;
    externalId?: string;
  };
  subject: string;
  body: string;
  status: 'new' | 'awaiting_agent' | 'drafted' | 'auto_resolved' | 'escalated' | 'closed';
  conversationId?: mongoose.Types.ObjectId;
}

const ticketSchema = new Schema<TicketDocument>(
  {
    tenantId: { type: Schema.Types.ObjectId, required: true, index: true },
    channel: {
      type: String,
      enum: ['zendesk', 'intercom', 'email', 'chat', 'slack'],
      required: true,
    },
    externalId: { type: String, required: true },
    customer: {
      email: { type: String },
      name: { type: String },
      externalId: { type: String },
    },
    subject: { type: String, required: true },
    body: { type: String, required: true },
    status: {
      type: String,
      enum: ['new', 'awaiting_agent', 'drafted', 'auto_resolved', 'escalated', 'closed'],
      required: true,
      default: 'new',
    },
    conversationId: { type: Schema.Types.ObjectId },
  },
  { timestamps: true },
);

ticketSchema.index({ tenantId: 1, channel: 1, externalId: 1 }, { unique: true });
ticketSchema.index({ tenantId: 1, status: 1 });

ticketSchema.plugin(tenantScopePlugin);

export const TicketModel: WithTenantScope<TicketDocument> = (
  mongoose.models['Ticket'] ??
  mongoose.model<TicketDocument>('Ticket', ticketSchema)
) as WithTenantScope<TicketDocument>;
