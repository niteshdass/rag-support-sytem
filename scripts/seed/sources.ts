import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import { SourceModel } from '../../src/infra/mongo/models/Source.js';
import { UserModel } from '../../src/infra/mongo/models/User.js';
import { logger } from '../../src/observability/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

type TenantRef = { _id: mongoose.Types.ObjectId; slug: string };

export async function seedZendeskSource(
  tenants: TenantRef[],
): Promise<{ sourceId: string } | null> {
  const acmeTenant = tenants.find((t) => t.slug === 'acme-saas');
  if (!acmeTenant) {
    logger.warn('acme-saas tenant not found — skipping Zendesk source seed');
    return null;
  }

  const admin = await UserModel.findOne({ tenantId: acmeTenant._id, role: 'admin' });
  if (!admin) throw new Error('acme-saas admin user not found — run seedUsers first');

  const fixturePath = join(__dirname, 'fixtures', 'zendesk-articles.json');
  const ticketFixturePath = join(__dirname, 'fixtures', 'zendesk-tickets.json');

  const source = await SourceModel.findOneAndUpdate(
    { tenantId: acmeTenant._id, type: 'connector', subtype: 'zendesk' },
    {
      $setOnInsert: {
        tenantId: acmeTenant._id,
        type: 'connector',
        subtype: 'zendesk',
        config: {
          subdomain: 'acme-saas',
          email: 'support@acme-saas.com',
          apiToken: 'seed-fixture-token',
          fixtureMode: true,
          fixturePath,
          ticketFixturePath,
        },
        status: 'active',
        addedBy: admin._id,
      },
    },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
  );

  if (!source) throw new Error('Failed to upsert Zendesk source');

  logger.info({ sourceId: source._id.toString() }, 'Zendesk source ready');
  return { sourceId: source._id.toString() };
}
