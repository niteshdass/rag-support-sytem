import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import type { HydratedDocument } from 'mongoose';
import type { SourceDocument } from '../../src/infra/mongo/models/Source.js';

import '../../src/domain/ingestion/connectors/confluence.js';
import { getConnector } from '../../src/domain/ingestion/connectors/base.js';

function makeSource(config: Record<string, unknown>): HydratedDocument<SourceDocument> {
  return {
    tenantId: 'tenant-abc',
    type: 'connector',
    subtype: 'confluence',
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

// ---------------------------------------------------------------------------
// Fixture mode
// ---------------------------------------------------------------------------

describe('confluence connector — fixture mode', () => {
  it('yields all pages from fixture', async () => {
    const connector = getConnector('confluence');
    const source = makeSource({
      domain: 'acme-saas.atlassian.net',
      email: 'admin@acme.com',
      apiToken: 'tok',
      spaceKeys: ['DOCS'],
      fixtureMode: true,
    });
    const docs = await collect(connector.sync(source));
    expect(docs.length).toBe(3);
  });

  it('converts HTML body to markdown', async () => {
    const connector = getConnector('confluence');
    const source = makeSource({
      domain: 'acme-saas.atlassian.net',
      email: 'admin@acme.com',
      apiToken: 'tok',
      spaceKeys: ['DOCS'],
      fixtureMode: true,
    });
    const docs = await collect(connector.sync(source));
    expect(docs[0]!.content).not.toContain('<h1>');
    expect(docs[0]!.content).toContain('Onboarding Guide');
  });

  it('defaults visibility to customer-facing', async () => {
    const connector = getConnector('confluence');
    const source = makeSource({
      domain: 'acme-saas.atlassian.net',
      email: 'admin@acme.com',
      apiToken: 'tok',
      spaceKeys: ['DOCS'],
      fixtureMode: true,
    });
    const docs = await collect(connector.sync(source));
    expect(docs.every((d) => d.visibility === 'customer-facing')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// HTTP mode
// ---------------------------------------------------------------------------

const mockPages = [
  {
    id: 'p1',
    title: 'Page One',
    _links: { webui: '/spaces/TEST/pages/p1', base: 'https://demo.atlassian.net/wiki' },
    body: { storage: { value: '<p>Hello from page one</p>' } },
    version: { when: '2026-04-01T00:00:00Z' },
  },
];

const server = setupServer(
  http.get('https://demo.atlassian.net/wiki/rest/api/content', () =>
    HttpResponse.json({ results: mockPages, size: 1 }),
  ),
);

describe('confluence connector — HTTP mode', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  it('fetches pages from space and yields connector docs', async () => {
    const connector = getConnector('confluence');
    const source = makeSource({
      domain: 'demo.atlassian.net',
      email: 'user@demo.com',
      apiToken: 'secret',
      spaceKeys: ['TEST'],
    });

    const docs = await collect(connector.sync(source));
    expect(docs.length).toBe(1);
    expect(docs[0]!.externalId).toBe('p1');
    expect(docs[0]!.title).toBe('Page One');
    expect(docs[0]!.content).toContain('Hello from page one');
    expect(docs[0]!.mimeType).toBe('text/markdown');
  });

  it('throws on non-2xx response', async () => {
    server.use(
      http.get('https://demo.atlassian.net/wiki/rest/api/content', () =>
        HttpResponse.json({ error: 'Unauthorized' }, { status: 401 }),
      ),
    );

    const connector = getConnector('confluence');
    const source = makeSource({
      domain: 'demo.atlassian.net',
      email: 'bad@demo.com',
      apiToken: 'wrong',
      spaceKeys: ['TEST'],
    });

    await expect(collect(connector.sync(source))).rejects.toThrow('Confluence API error: 401');
  });

  it('sends Basic auth header', async () => {
    let captured: string | null = null;
    server.use(
      http.get('https://demo.atlassian.net/wiki/rest/api/content', ({ request }) => {
        captured = request.headers.get('Authorization');
        return HttpResponse.json({ results: [], size: 0 });
      }),
    );

    const connector = getConnector('confluence');
    const source = makeSource({
      domain: 'demo.atlassian.net',
      email: 'user@demo.com',
      apiToken: 'mytoken',
      spaceKeys: ['TEST'],
    });

    await collect(connector.sync(source));
    const expected = `Basic ${Buffer.from('user@demo.com:mytoken').toString('base64')}`;
    expect(captured).toBe(expected);
  });
});
