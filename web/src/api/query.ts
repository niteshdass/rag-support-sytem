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

export function sendQuery(body: {
  query: string;
  history?: string[];
  audience: 'end-user' | 'agent';
}): Promise<QueryResponse> {
  return apiFetch<QueryResponse>('/query', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}
