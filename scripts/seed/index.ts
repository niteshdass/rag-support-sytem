import 'dotenv/config';
import mongoose from 'mongoose';
import { connect, disconnect } from '../../src/infra/mongo/client.js';
import { logger } from '../../src/observability/logger.js';
import { assertSafeUri } from './safety.js';
import { seedTenants } from './tenants.js';
import { seedUsers } from './users.js';
import { seedDocuments } from './documents.js';
import { seedZendeskSource } from './sources.js';
import { runSyncSource } from '../../src/jobs/syncSource.js';
import type { JobQueue } from '../../src/domain/knowledge/documentService.js';
import { runIngestDocument } from '../../src/jobs/ingestDocument.js';

const args = process.argv.slice(2);
const resetFlag = args.includes('--reset');
const tenantFlagIdx = args.indexOf('--tenant');
const tenantSlug = tenantFlagIdx !== -1 ? args[tenantFlagIdx + 1] : undefined;

const RESET_COLLECTIONS = [
  'tenants',
  'users',
  'sources',
  'documents',
  'chunks',
  'embeddingcaches',
  'responsecaches',
  'auditlogs',
  'jobs',
];

async function main(): Promise<void> {
  const uri = process.env.MONGODB_URI ?? '';
  assertSafeUri(uri);

  await connect();

  if (resetFlag) {
    logger.info({ collections: RESET_COLLECTIONS }, '--reset: wiping collections');
    await Promise.all(
      RESET_COLLECTIONS.map((col) => mongoose.connection.collection(col).deleteMany({})),
    );
  }

  logger.info('seeding tenants...');
  let tenants = await seedTenants();

  if (tenantSlug) {
    tenants = tenants.filter((t) => t.slug === tenantSlug);
    if (tenants.length === 0) {
      throw new Error(`No tenant with slug "${tenantSlug}" found after seeding`);
    }
  }

  logger.info('seeding users...');
  await seedUsers(tenants);

  logger.info('seeding documents...');
  await seedDocuments(tenants);

  logger.info('seeding Zendesk source...');
  const zendeskResult = await seedZendeskSource(tenants);

  if (zendeskResult) {
    logger.info({ sourceId: zendeskResult.sourceId }, 'running Zendesk sync-source inline');

    const pendingIngestIds: string[] = [];
    const inlineQueue: JobQueue = {
      async enqueue(_name: string, data: Record<string, unknown>) {
        if (typeof data.documentId === 'string') pendingIngestIds.push(data.documentId);
      },
    };

    await runSyncSource(zendeskResult.sourceId, inlineQueue);

    if (pendingIngestIds.length > 0) {
      logger.info({ count: pendingIngestIds.length }, 'running Zendesk ingest jobs inline');
      const BATCH = 3;
      for (let i = 0; i < pendingIngestIds.length; i += BATCH) {
        const batch = pendingIngestIds.slice(i, i + BATCH);
        await Promise.all(batch.map((id) => runIngestDocument(id)));
        logger.info(
          { done: Math.min(i + BATCH, pendingIngestIds.length), total: pendingIngestIds.length },
          'Zendesk ingest batch complete',
        );
      }
    } else {
      logger.info('all Zendesk documents already ingested — nothing to process');
    }
  }

  logger.info({ tenantCount: tenants.length }, 'seed complete');
  await disconnect();
}

main().catch((err) => {
  process.stderr.write(`Seed failed: ${String(err)}\n`);
  process.exit(1);
});
