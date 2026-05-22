import { apiFetch } from './client';

export interface Citation {
  chunkId: string;
  documentId: string;
  snippet: string;
  score: number;
}

export interface QueryResponse {
  text: string;
  citations: Citation[];
  confidence: number;
  route: 'auto' | 'draft';
  traceId: string;
}

export interface SessionMessage {
  role: 'user' | 'assistant' | 'agent';
  content: string;
  timestamp: string;
}

export function createSession(): Promise<{ sessionId: string }> {
  return apiFetch<{ sessionId: string }>('/query/sessions', { method: 'POST' });
}

export function getSession(sessionId: string): Promise<{ messages: SessionMessage[]; confidenceScores: number[] }> {
  return apiFetch(`/query/sessions/${sessionId}`);
}

export function sendQuery(body: {
  query: string;
  history?: string[];
  audience: 'end-user' | 'agent';
  sessionId?: string;
}): Promise<QueryResponse> {
  return apiFetch<QueryResponse>('/query', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}
