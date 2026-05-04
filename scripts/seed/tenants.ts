import { TenantModel, type TenantDocument } from '../../src/infra/mongo/models/Tenant.js';
import { logger } from '../../src/observability/logger.js';

const TENANT_FIXTURES = [
  { name: 'Acme SaaS', slug: 'acme-saas', plan: 'pro' },
  { name: 'ByteStore', slug: 'bytestore', plan: 'free' },
  { name: 'Internal', slug: 'internal', plan: 'internal' },
] as const;

export async function seedTenants(): Promise<TenantDocument[]> {
  const results: TenantDocument[] = [];

  for (const fixture of TENANT_FIXTURES) {
    let tenant = await TenantModel.findOne({ slug: fixture.slug });
    if (!tenant) {
      tenant = await TenantModel.create({ name: fixture.name, slug: fixture.slug, plan: fixture.plan });
      logger.info({ slug: fixture.slug }, 'tenant created');
    } else {
      logger.info({ slug: fixture.slug }, 'tenant exists — skipping');
    }
    results.push(tenant);
  }

  return results;
}
