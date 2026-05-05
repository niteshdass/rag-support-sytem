export interface Citation {
  documentId: string;
  chunkId: string;
  score: number;
  snippet: string;
}

export interface DraftResponse {
  draftId: string | null;
  text: string;
  citations: Citation[];
  confidence: number;
  route: 'auto' | 'draft';
}

interface FetchDraftParams {
  apiUrl: string;
  apiKey: string;
  query: string;
  ticketId?: string;
}

export async function fetchDraft(params: FetchDraftParams): Promise<DraftResponse> {
  const { apiUrl, apiKey, query, ticketId } = params;
  const res = await fetch(`${apiUrl}/copilot/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
    body: JSON.stringify({ query, ticketId }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText })) as { error?: string };
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }
  return res.json() as Promise<DraftResponse>;
}

interface SubmitFeedbackParams {
  apiUrl: string;
  apiKey: string;
  draftId: string;
  type: 'thumbs' | 'edit' | 'rating';
  payload: Record<string, unknown>;
}

export async function submitFeedback(params: SubmitFeedbackParams): Promise<void> {
  const { apiUrl, apiKey, draftId, type, payload } = params;
  await fetch(`${apiUrl}/copilot/feedback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
    body: JSON.stringify({ draftId, type, payload }),
  });
}
