import mongoose, { Schema, type Document } from 'mongoose';
import { z } from 'zod';
import {
  tenantScopePlugin,
  type WithTenantScope,
} from '../plugins/tenantScope.js';

export const MessageSchema = z.object({
  role: z.enum(['user', 'assistant', 'agent']),
  content: z.string().min(1),
  timestamp: z.date().default(() => new Date()),
});

export const ConversationCreateSchema = z.object({
  tenantId: z.string().min(1),
  ticketId: z.string().min(1),
  messages: z.array(MessageSchema).default([]),
  confidenceScores: z.array(z.number().min(0).max(1)).default([]),
});

export type ConversationCreate = z.infer<typeof ConversationCreateSchema>;

interface Message {
  role: 'user' | 'assistant' | 'agent';
  content: string;
  timestamp: Date;
}

export interface ConversationDocument extends Document {
  tenantId: mongoose.Types.ObjectId;
  ticketId: mongoose.Types.ObjectId;
  messages: Message[];
  confidenceScores: number[];
}

const messageSchema = new Schema<Message>(
  {
    role: { type: String, enum: ['user', 'assistant', 'agent'], required: true },
    content: { type: String, required: true },
    timestamp: { type: Date, default: () => new Date() },
  },
  { _id: false },
);

const conversationSchema = new Schema<ConversationDocument>(
  {
    tenantId: { type: Schema.Types.ObjectId, required: true, index: true },
    ticketId: { type: Schema.Types.ObjectId, required: true },
    messages: { type: [messageSchema], default: [] },
    confidenceScores: { type: [Number], default: [] },
  },
  { timestamps: true },
);

conversationSchema.index({ tenantId: 1, ticketId: 1 });

conversationSchema.plugin(tenantScopePlugin);

export const ConversationModel: WithTenantScope<ConversationDocument> = (
  mongoose.models['Conversation'] ??
  mongoose.model<ConversationDocument>('Conversation', conversationSchema)
) as WithTenantScope<ConversationDocument>;
