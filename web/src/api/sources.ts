import { apiFetch } from './client';

export type SourceStatus = 'active' | 'syncing' | 'error' | 'disabled';
export type SourceType = 'connector' | 'upload' | 'paste' | 'crawl';

export interface Source {
  _id: string;
  tenantId: string;
  type: SourceType;
  subtype: string;
  config: Record<string, unknown>;
  lastSyncedAt?: string;
  status: SourceStatus;
  addedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface SourceListResponse {
  results: Source[];
  total: number;
}

export function listSources(params?: { type?: SourceType; status?: SourceStatus }): Promise<SourceListResponse> {
  const sp = new URLSearchParams();
  if (params?.type) sp.set('type', params.type);
  if (params?.status) sp.set('status', params.status);
  const qs = sp.toString();
  return apiFetch<SourceListResponse>(`/admin/sources${qs ? `?${qs}` : ''}`);
}

export function deleteSource(id: string): Promise<{ ok: true; purged: number }> {
  return apiFetch<{ ok: true; purged: number }>(`/admin/sources/${id}`, { method: 'DELETE' });
}

export function syncSource(id: string): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>(`/admin/sources/${id}/sync`, { method: 'POST' });
}
