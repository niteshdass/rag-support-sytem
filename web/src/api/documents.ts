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

export function bulkDeleteDocuments(ids: string[]): Promise<{ deleted: number; failed: number }> {
  return apiFetch<{ deleted: number; failed: number }>('/admin/documents', {
    method: 'DELETE',
    body: JSON.stringify({ ids }),
  });
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

export interface PasteResponse {
  documentId: string;
  status: Status;
}

export function pasteDocument(body: {
  title?: string;
  content: string;
  visibility: Visibility;
  tags?: string[];
}): Promise<PasteResponse> {
  return apiFetch<PasteResponse>('/admin/paste', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export interface UploadResponse {
  documentId: string;
  status: Status;
}

export async function uploadDocument(
  file: File,
  visibility: Visibility,
  tags: string[],
): Promise<UploadResponse> {
  const form = new FormData();
  form.append('file', file);
  form.append('visibility', visibility);
  form.append('tags', tags.join(','));

  const res = await fetch('/api/admin/uploads', {
    method: 'POST',
    credentials: 'include',
    body: form,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((body as { error?: string }).error ?? res.statusText);
  }

  return res.json() as Promise<UploadResponse>;
}
