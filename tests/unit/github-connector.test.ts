import { describe, it, expect } from 'vitest';
import type { HydratedDocument } from 'mongoose';
import type { SourceDocument } from '../../src/infra/mongo/models/Source.js';

import '../../src/domain/ingestion/connectors/github.js';
import { getConnector } from '../../src/domain/ingestion/connectors/base.js';

function makeSource(config: Record<string, unknown>): HydratedDocument<SourceDocument> {
  return {
    tenantId: 'tenant-abc',
    type: 'connector',
    subtype: 'github',
    config,
    addedBy: 'user-1',
    status: 'active',
  } as unknown as HydratedDocument<SourceDocument>;
}

async function collect<T>(it: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const item of it) out.push(item);
  return out;
}

describe('github connector — fixture mode', () => {
  it('yields all docs from fixture', async () => {
    const connector = getConnector('github');
    const source = makeSource({
      token: 'ghp_test',
      repos: [{ owner: 'acme-org', repo: 'acme-saas' }],
      fixtureMode: true,
    });
    const docs = await collect(connector.sync(source));
    expect(docs.length).toBe(3);
  });

  it('README doc has correct fields', async () => {
    const connector = getConnector('github');
    const source = makeSource({
      token: 'ghp_test',
      repos: [{ owner: 'acme-org', repo: 'acme-saas' }],
      fixtureMode: true,
    });
    const docs = await collect(connector.sync(source));
    const readme = docs.find((d) => d.externalId.endsWith('/README'))!;
    expect(readme).toBeDefined();
    expect(readme.title).toBe('acme-saas README');
    expect(readme.content).toContain('Acme SaaS');
    expect(readme.visibility).toBe('customer-facing');
  });

  it('issue doc has subject + resolution content format', async () => {
    const connector = getConnector('github');
    const source = makeSource({
      token: 'ghp_test',
      repos: [{ owner: 'acme-org', repo: 'acme-saas' }],
      fixtureMode: true,
    });
    const docs = await collect(connector.sync(source));
    const issue = docs.find((d) => d.externalId.includes('/issues/'))!;
    expect(issue).toBeDefined();
    expect(issue.content).toContain('Resolution:');
    expect(issue.mimeType).toBe('text/markdown');
  });
});
