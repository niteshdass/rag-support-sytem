import 'dotenv/config';
import mongoose from 'mongoose';
import { connect, disconnect } from '../../src/infra/mongo/client.js';
import { logger } from '../../src/observability/logger.js';
import { assertSafeUri } from './safety.js';
import { seedTenants } from './tenants.js';
import { seedUsers } from './users.js';

const args = process.argv.slice(2);
const resetFlag = args.includes('--reset');
const tenantFlagIdx = args.indexOf('--tenant');
const tenantSlug = tenantFlagIdx !== -1 ? args[tenantFlagIdx + 1] : undefined;

async function main(): Promise<void> {
  const uri = process.env.MONGODB_URI ?? '';
  assertSafeUri(uri);

  await connect();

  if (resetFlag) {
    logger.info('--reset: wiping tenants and users');
    await mongoose.connection.collection('tenants').deleteMany({});
    await mongoose.connection.collection('users').deleteMany({});
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

  logger.info({ tenantCount: tenants.length }, 'seed complete');
  await disconnect();
}

main().catch((err) => {
  process.stderr.write(`Seed failed: ${String(err)}\n`);
  process.exit(1);
});
