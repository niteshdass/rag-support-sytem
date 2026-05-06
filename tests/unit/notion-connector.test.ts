import { describe, it, expect, beforeEach } from 'vitest';
import type { HydratedDocument } from 'mongoose';
import type { SourceDocument } from '../../src/infra/mongo/models/Source.js';

import '../../src/domain/ingestion/connectors/notion.js';
import { getConnector, _resetRegistry } from '../../src/domain/ingestion/connectors/base.js';

function makeSource(config: Record<string, unknown>): HydratedDocument<SourceDocument> {
  return {
    tenantId: 'tenant-abc',
    type: 'connector',
    subtype: 'notion',
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

describe('notion connector — fixture mode', () => {
  it('yields all pages from fixture', async () => {
    const connector = getConnector('notion');
    const source = makeSource({ token: 'ntn_test', fixtureMode: true });
    const docs = await collect(connector.sync(source));
    expect(docs.length).toBe(5);
  });

  it('page has expected fields', async () => {
    const connector = getConnector('notion');
    const source = makeSource({ token: 'ntn_test', fixtureMode: true });
    const docs = await collect(connector.sync(source));
    const first = docs[0]!;
    expect(first.externalId).toBe('page-001');
    expect(first.title).toBe('Getting Started with Acme SaaS');
    expect(first.url).toBe('https://notion.so/page-001');
    expect(first.mimeType).toBe('text/markdown');
    expect(first.content).toContain('Getting Started with Acme SaaS');
    expect(first.content).not.toContain('{');
  });

  it('defaults visibility to customer-facing', async () => {
    const connector = getConnector('notion');
    const source = makeSource({ token: 'ntn_test', fixtureMode: true });
    const docs = await collect(connector.sync(source));
    expect(docs.every((d) => d.visibility === 'customer-facing')).toBe(true);
  });

  it('respects custom visibility', async () => {
    const connector = getConnector('notion');
    const source = makeSource({ token: 'ntn_test', fixtureMode: true, visibility: 'internal' });
    const docs = await collect(connector.sync(source));
    expect(docs.every((d) => d.visibility === 'internal')).toBe(true);
  });

  it('renders heading_1 blocks as # markdown', async () => {
    const connector = getConnector('notion');
    const source = makeSource({ token: 'ntn_test', fixtureMode: true });
    const docs = await collect(connector.sync(source));
    expect(docs[0]!.content).toMatch(/^# Getting Started with Acme SaaS/m);
  });

  it('renders bulleted_list_item as - markdown', async () => {
    const connector = getConnector('notion');
    const source = makeSource({ token: 'ntn_test', fixtureMode: true });
    const docs = await collect(connector.sync(source));
    expect(docs[0]!.content).toMatch(/^- Name your project/m);
  });
});
