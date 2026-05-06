import { LRUCache } from 'lru-cache';
import { TenantModel } from '../../infra/mongo/models/Tenant.js';

const CACHE_TTL_MS = 30_000;

export interface CachedTenantSettings {
  autoResolveEnabled: boolean;
  confidenceThreshold: number;
  channelSettings: Record<string, { autoResolveEnabled?: boolean }>;
  slackEscalationWebhookUrl: string | undefined;
}

const cache = new LRUCache<string, CachedTenantSettings>({ max: 500, ttl: CACHE_TTL_MS });

export async function getTenantSettings(tenantId: string): Promise<CachedTenantSettings | null> {
  const hit = cache.get(tenantId);
  if (hit) return hit;

  const tenant = await TenantModel.findById(tenantId).lean();
  if (!tenant) return null;

  const settings: CachedTenantSettings = {
    autoResolveEnabled: tenant.autoResolveEnabled,
    confidenceThreshold: tenant.confidenceThreshold,
    channelSettings: (tenant.channelSettings as Record<string, { autoResolveEnabled?: boolean }>) ?? {},
    slackEscalationWebhookUrl: (
      tenant.settings as Record<string, unknown>
    )?.slackEscalationWebhookUrl as string | undefined,
  };

  cache.set(tenantId, settings);
  return settings;
}

export function invalidateTenantSettings(tenantId: string): void {
  cache.delete(tenantId);
}

export function channelAutoResolveEnabled(
  settings: CachedTenantSettings,
  channel: string,
): boolean {
  return settings.channelSettings[channel]?.autoResolveEnabled ?? settings.autoResolveEnabled;
}
