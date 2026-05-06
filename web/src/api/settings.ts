import { apiFetch } from './client';

export interface TenantSettings {
  autoResolveEnabled: boolean;
  confidenceThreshold: number;
}

export function getSettings(): Promise<TenantSettings> {
  return apiFetch<TenantSettings>('/admin/settings');
}

export function patchSettings(data: Partial<TenantSettings>): Promise<TenantSettings> {
  return apiFetch<TenantSettings>('/admin/settings', {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}
