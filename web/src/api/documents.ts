import { apiFetch } from './client';

export type Visibility = 'customer-facing' | 'internal' | 'draft';
export type Status = 'processing' | 'ready' | 'failed' | 'purging' | 'purged';
export type SourceType = 'connector' | 'upload' | 'paste' | 'crawl';

export interface Document {
  _id: string;
  tenantId: string;
  sourceId?: string;
  sourceType: SourceType;
  title: string;
  url?: string;
  visibility: Visibility;
  status: Status;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface DocumentListResponse {
  results: Document[];
  total: number;
  page?: number;
  pageSize?: number;
}

export interface DocumentListParams {
  q?: string;
  visibility?: Visibility;
  sourceType?: SourceType;
  status?: Status;
  page?: number;
  pageSize?: number;
}

export function listDocuments(params: DocumentListParams): Promise<DocumentListResponse> {
  const sp = new URLSearchParams();
  if (params.q) sp.set('q', params.q);
  if (params.visibility) sp.set('visibility', params.visibility);
  if (params.sourceType) sp.set('sourceType', params.sourceType);
  if (params.status) sp.set('status', params.status);
  if (params.page) sp.set('page', String(params.page));
  if (params.pageSize) sp.set('pageSize', String(params.pageSize));
  const qs = sp.toString();
  return apiFetch<DocumentListResponse>(`/admin/documents${qs ? `?${qs}` : ''}`);
}

export function deleteDocument(id: string): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>(`/admin/documents/${id}`, { method: 'DELETE' });
}

export function updateVisibility(id: string, visibility: Visibility): Promise<Document> {
  return apiFetch<Document>(`/admin/documents/${id}/visibility`, {
    method: 'PATCH',
    body: JSON.stringify({ visibility }),
  });
}

export interface DocumentDetail extends Document {
  content?: string;
  contentTruncated?: boolean;
  contentHash?: string;
  externalId?: string;
  fileKey?: string;
  fileMimeType?: string;
  addedBy?: string;
  processingError?: string;
  metadata?: Record<string, unknown>;
}

export interface Chunk {
  _id: string;
  documentId: string;
  text: string;
  position: number;
  visibility: Visibility;
  qdrantPointId?: string;
}

export interface ChunksResponse {
  chunks: Chunk[];
  total: number;
}

export function getDocument(id: string): Promise<DocumentDetail> {
  return apiFetch<DocumentDetail>(`/admin/documents/${id}`);
}

export function getDocumentChunks(id: string): Promise<ChunksResponse> {
  return apiFetch<ChunksResponse>(`/admin/documents/${id}/chunks`);
}
