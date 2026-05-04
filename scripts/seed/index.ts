import 'dotenv/config';
import mongoose from 'mongoose';
import { connect, disconnect } from '../../src/infra/mongo/client.js';
import { logger } from '../../src/observability/logger.js';
import { assertSafeUri } from './safety.js';
import { seedTenants } from './tenants.js';
import { seedUsers } from './users.js';
import { seedDocuments } from './documents.js';

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

  logger.info({ tenantCount: tenants.length }, 'seed complete');
  await disconnect();
}

main().catch((err) => {
  process.stderr.write(`Seed failed: ${String(err)}\n`);
  process.exit(1);
});
