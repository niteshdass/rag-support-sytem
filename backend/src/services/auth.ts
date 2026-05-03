import { createHash, randomBytes } from 'node:crypto';
import { eq, and, isNull } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { apiKeys } from '../db/schema.js';

export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

export function generateApiKey(): { key: string; prefix: string; hash: string } {
  const random = randomBytes(32).toString('hex');
  const key = `sk_live_${random}`;
  const prefix = key.slice(0, 14);
  const hash = hashApiKey(key);
  return { key, prefix, hash };
}

export async function validateApiKey(
  rawKey: string,
  db: Db,
): Promise<{ organizationId: string } | null> {
  const hash = hashApiKey(rawKey);

  const result = await db
    .select({ organizationId: apiKeys.organizationId })
    .from(apiKeys)
    .where(and(eq(apiKeys.keyHash, hash), isNull(apiKeys.revokedAt)))
    .limit(1);

  const row = result[0];
  if (!row) return null;

  void db
    .update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.keyHash, hash));

  return row;
}
