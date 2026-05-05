import { apiFetch } from './client';

export type TicketStatus = 'new' | 'awaiting_agent' | 'drafted' | 'auto_resolved' | 'escalated' | 'closed';
export type Route = 'auto' | 'draft';
export type FeedbackType = 'thumbs' | 'edit' | 'rating';

export interface Citation {
  documentId: string;
  chunkId: string;
  score: number;
  snippet: string;
}

export interface DraftSummary {
  id: string;
  text: string;
  citations: Citation[];
  confidence: number;
  route: Route;
  agentEdits?: string;
  sentAt?: string;
}

export interface FeedbackItem {
  _id?: string;
  type: FeedbackType;
  payload: unknown;
  userId?: string;
}

export interface ActivityItem {
  ticketId: string;
  channel: string;
  subject: string;
  customer: { email: string; name?: string; externalId?: string };
  status: TicketStatus;
  draft: DraftSummary;
  feedback: FeedbackItem[];
  createdAt: string;
  updatedAt: string;
}

export interface ActivityListResponse {
  results: ActivityItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ActivityListParams {
  q?: string;
  status?: TicketStatus;
  route?: Route;
  confidenceMin?: number;
  confidenceMax?: number;
  page?: number;
  pageSize?: number;
}

export function listActivity(params: ActivityListParams = {}): Promise<ActivityListResponse> {
  const sp = new URLSearchParams();
  if (params.q) sp.set('q', params.q);
  if (params.status) sp.set('status', params.status);
  if (params.route) sp.set('route', params.route);
  if (params.confidenceMin !== undefined) sp.set('confidenceMin', String(params.confidenceMin));
  if (params.confidenceMax !== undefined) sp.set('confidenceMax', String(params.confidenceMax));
  if (params.page) sp.set('page', String(params.page));
  if (params.pageSize) sp.set('pageSize', String(params.pageSize));
  const qs = sp.toString();
  return apiFetch<ActivityListResponse>(`/admin/activity${qs ? `?${qs}` : ''}`);
}
