import { apiFetch } from './client';

export interface InboxCitation {
  documentId: string;
  chunkId: string;
  score: number;
  snippet: string;
}

export interface InboxDraft {
  id: string;
  text: string;
  confidence: number;
  route: 'auto' | 'draft';
  citations: InboxCitation[];
}

export interface InboxMessage {
  role: 'user' | 'assistant' | 'agent';
  content: string;
  timestamp: string;
}

export interface InboxSession {
  conversationId: string;
  ticketId: string;
  subject: string;
  customer: { email?: string; name?: string };
  status: string;
  updatedAt: string;
  messageCount: number;
  lastMessage?: InboxMessage;
  latestDraft?: InboxDraft | null;
}

export interface InboxThread {
  conversationId: string;
  ticketId: string;
  subject: string;
  customer: { email?: string; name?: string };
  status: string;
  messages: InboxMessage[];
  latestDraft: InboxDraft | null;
}

export function listSessions(): Promise<{ sessions: InboxSession[] }> {
  return apiFetch('/admin/inbox');
}

export function getThread(conversationId: string): Promise<InboxThread> {
  return apiFetch(`/admin/inbox/${conversationId}`);
}

export function sendReply(conversationId: string, text: string, draftId?: string): Promise<{ ok: boolean }> {
  return apiFetch(`/admin/inbox/${conversationId}/reply`, {
    method: 'POST',
    body: JSON.stringify({ text, draftId }),
  });
}

export function escalateSession(conversationId: string): Promise<{ ok: boolean }> {
  return apiFetch(`/admin/inbox/${conversationId}/escalate`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}
