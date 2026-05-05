import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import type { HydratedDocument } from 'mongoose';
import type { SourceDocument } from '../../src/infra/mongo/models/Source.js';

// Import connector to trigger registerConnector side-effect
import '../../src/domain/ingestion/connectors/zendesk.js';
import { getConnector, _resetRegistry } from '../../src/domain/ingestion/connectors/base.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSource(config: Record<string, unknown>): HydratedDocument<SourceDocument> {
  return {
    tenantId: 'tenant-abc',
    type: 'connector',
    subtype: 'zendesk',
    config,
    addedBy: 'user-1',
    status: 'active',
  } as unknown as HydratedDocument<SourceDocument>;
}

async function collect<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const results: T[] = [];
  for await (const item of iterable) {
    results.push(item);
  }
  return results;
}

// ---------------------------------------------------------------------------
// Fixture mode
// ---------------------------------------------------------------------------

describe('zendesk connector — fixture mode', () => {
  it('yields one ConnectorDocument per fixture article', async () => {
    const connector = getConnector('zendesk');
    const source = makeSource({
      subdomain: 'acme-saas',
      email: 'admin@acme.com',
      apiToken: 'tok_test',
      fixtureMode: true,
    });

    const docs = await collect(connector.sync(source));

    expect(docs.length).toBe(5); // matches zendesk-articles.json
    expect(docs[0]!.externalId).toBe('1001');
    expect(docs[0]!.title).toBe('Getting Started with Acme SaaS');
    expect(docs[0]!.url).toBe('https://acme-saas.zendesk.com/hc/en-us/articles/1001');
    // HTML body should be converted to markdown
    expect(docs[0]!.content).toContain('Acme SaaS');
    expect(docs[0]!.content).not.toContain('<h1>');
  });

  it('populates metadata.updatedAt', async () => {
    const connector = getConnector('zendesk');
    const source = makeSource({
      subdomain: 'acme-saas',
      email: 'admin@acme.com',
      apiToken: 'tok_test',
      fixtureMode: true,
    });

    const docs = await collect(connector.sync(source));
    expect((docs[0]!.metadata as Record<string, unknown>)['updatedAt']).toBe('2026-04-01T10:00:00Z');
  });
});

// ---------------------------------------------------------------------------
// HTTP mode (msw)
// ---------------------------------------------------------------------------

const page1 = {
  articles: [
    {
      id: 101,
      title: 'Article One',
      html_url: 'https://demo.zendesk.com/hc/articles/101',
      body: '<p>Content one</p>',
      updated_at: '2026-03-01T00:00:00Z',
    },
    {
      id: 102,
      title: 'Article Two',
      html_url: 'https://demo.zendesk.com/hc/articles/102',
      body: '<p>Content two</p>',
      updated_at: '2026-03-02T00:00:00Z',
    },
  ],
  next_page: 'https://demo.zendesk.com/api/v2/help_center/articles.json?page=2',
};

const page2 = {
  articles: [
    {
      id: 103,
      title: 'Article Three',
      html_url: 'https://demo.zendesk.com/hc/articles/103',
      body: '<p>Content three</p>',
      updated_at: '2026-03-03T00:00:00Z',
    },
  ],
  next_page: null,
};

const server = setupServer(
  http.get('https://demo.zendesk.com/api/v2/help_center/articles.json', ({ request }) => {
    const url = new URL(request.url);
    const page = url.searchParams.get('page');
    return HttpResponse.json(page === '2' ? page2 : page1);
  }),
);

describe('zendesk connector — HTTP mode', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  it('fetches all pages and yields all articles', async () => {
    const connector = getConnector('zendesk');
    const source = makeSource({
      subdomain: 'demo',
      email: 'admin@demo.com',
      apiToken: 'tok_live',
    });

    const docs = await collect(connector.sync(source));

    expect(docs.length).toBe(3);
    expect(docs.map((d) => d.externalId)).toEqual(['101', '102', '103']);
  });

  it('sends Basic auth header', async () => {
    let capturedAuth: string | null = null;
    server.use(
      http.get('https://demo.zendesk.com/api/v2/help_center/articles.json', ({ request }) => {
        capturedAuth = request.headers.get('Authorization');
        return HttpResponse.json({ articles: [], next_page: null });
      }),
    );

    const connector = getConnector('zendesk');
    const source = makeSource({
      subdomain: 'demo',
      email: 'user@demo.com',
      apiToken: 'secret',
    });

    await collect(connector.sync(source));

    const expected = `Basic ${Buffer.from('user@demo.com/token:secret').toString('base64')}`;
    expect(capturedAuth).toBe(expected);
  });

  it('throws on non-2xx response', async () => {
    server.use(
      http.get('https://demo.zendesk.com/api/v2/help_center/articles.json', () =>
        HttpResponse.json({ error: 'Forbidden' }, { status: 403 }),
      ),
    );

    const connector = getConnector('zendesk');
    const source = makeSource({
      subdomain: 'demo',
      email: 'admin@demo.com',
      apiToken: 'bad',
    });

    await expect(collect(connector.sync(source))).rejects.toThrow('Zendesk API error: 403');
  });
});
