import { apiFetch } from './client';

export interface AuthUser {
  _id: string;
  tenantId: string;
  email: string;
  role: 'admin' | 'agent';
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuthTenant {
  _id: string;
  name: string;
  slug: string;
  plan: string;
  autoResolveEnabled: boolean;
  confidenceThreshold: number;
}

export interface MeResponse {
  user: AuthUser;
  tenant: AuthTenant;
}

export function login(
  email: string,
  password: string,
  tenantSlug: string,
): Promise<{ user: AuthUser }> {
  return apiFetch('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password, tenantSlug }),
  });
}

export function logout(): Promise<{ ok: boolean }> {
  return apiFetch('/auth/logout', { method: 'POST' });
}

export function me(): Promise<MeResponse> {
  return apiFetch('/auth/me');
}
