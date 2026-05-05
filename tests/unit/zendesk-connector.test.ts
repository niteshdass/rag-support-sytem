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
  it('yields articles and tickets from fixtures (5 articles + 3 tickets)', async () => {
    const connector = getConnector('zendesk');
    const source = makeSource({
      subdomain: 'acme-saas',
      email: 'admin@acme.com',
      apiToken: 'tok_test',
      fixtureMode: true,
    });

    const docs = await collect(connector.sync(source));

    expect(docs.length).toBe(8);
    // Articles come first
    expect(docs[0]!.externalId).toBe('1001');
    expect(docs[0]!.title).toBe('Getting Started with Acme SaaS');
    expect(docs[0]!.url).toBe('https://acme-saas.zendesk.com/hc/en-us/articles/1001');
    expect(docs[0]!.content).toContain('Acme SaaS');
    expect(docs[0]!.content).not.toContain('<h1>');
  });

  it('populates metadata.updatedAt for articles', async () => {
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

  it('yields solved tickets after articles with correct content format', async () => {
    const connector = getConnector('zendesk');
    const source = makeSource({
      subdomain: 'acme-saas',
      email: 'admin@acme.com',
      apiToken: 'tok_test',
      fixtureMode: true,
    });

    const docs = await collect(connector.sync(source));
    // Tickets start at index 5
    const ticket = docs[5]!;

    expect(ticket.externalId).toBe('ticket:2001');
    expect(ticket.title).toBe('Cannot export data as CSV');
    expect(ticket.content).toMatch(/^Subject: Cannot export data as CSV\n/);
    expect(ticket.content).toContain('Question:');
    expect(ticket.content).toContain('Resolution:');
    expect(ticket.mimeType).toBe('text/plain');
  });

  it('populates ticket metadata', async () => {
    const connector = getConnector('zendesk');
    const source = makeSource({
      subdomain: 'acme-saas',
      email: 'admin@acme.com',
      apiToken: 'tok_test',
      fixtureMode: true,
    });

    const docs = await collect(connector.sync(source));
    const meta = docs[5]!.metadata as Record<string, unknown>;

    expect(meta['ticketId']).toBe(2001);
    expect(meta['requesterId']).toBe(12345);
    expect(meta['tags']).toEqual(['export', 'csv', 'data']);
    expect(meta['resolvedAt']).toBe('2026-04-10T12:00:00Z');
  });

  it('public ticket gets visibility=customer-facing', async () => {
    const connector = getConnector('zendesk');
    const source = makeSource({
      subdomain: 'acme-saas',
      email: 'admin@acme.com',
      apiToken: 'tok_test',
      fixtureMode: true,
    });

    const docs = await collect(connector.sync(source));
    // tickets 2001 and 2002 are public
    expect(docs[5]!.visibility).toBe('customer-facing');
    expect(docs[6]!.visibility).toBe('customer-facing');
  });

  it('internal ticket (is_public=false) gets visibility=internal', async () => {
    const connector = getConnector('zendesk');
    const source = makeSource({
      subdomain: 'acme-saas',
      email: 'admin@acme.com',
      apiToken: 'tok_test',
      fixtureMode: true,
    });

    const docs = await collect(connector.sync(source));
    // ticket 2003 is private
    const internalTicket = docs[7]!;
    expect(internalTicket.externalId).toBe('ticket:2003');
    expect(internalTicket.visibility).toBe('internal');
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
  // Default: no solved tickets so existing article tests are unaffected
  http.get('https://demo.zendesk.com/api/v2/tickets.json', () =>
    HttpResponse.json({ tickets: [], next_page: null }),
  ),
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

  it('fetches solved tickets and yields them alongside articles', async () => {
    server.use(
      http.get('https://demo.zendesk.com/api/v2/tickets.json', () =>
        HttpResponse.json({
          tickets: [
            {
              id: 501,
              subject: 'Login issue',
              description: 'Cannot log in after password change.',
              status: 'solved',
              is_public: true,
              requester_id: 55001,
              tags: ['login', 'auth'],
              updated_at: '2026-04-20T10:00:00Z',
            },
          ],
          next_page: null,
        }),
      ),
      http.get('https://demo.zendesk.com/api/v2/tickets/501/comments.json', () =>
        HttpResponse.json({
          comments: [
            { id: 1, body: 'Cannot log in after password change.', public: true, author_id: 55001 },
            { id: 2, body: 'Clear browser cache and try again. If persists, use forgot-password flow.', public: true, author_id: 77001 },
          ],
        }),
      ),
    );

    const connector = getConnector('zendesk');
    const source = makeSource({
      subdomain: 'demo',
      email: 'admin@demo.com',
      apiToken: 'tok_live',
    });

    const docs = await collect(connector.sync(source));

    // 3 articles + 1 ticket
    expect(docs.length).toBe(4);
    const ticket = docs[3]!;
    expect(ticket.externalId).toBe('ticket:501');
    expect(ticket.title).toBe('Login issue');
    expect(ticket.content).toBe(
      'Subject: Login issue\nQuestion: Cannot log in after password change.\nResolution: Clear browser cache and try again. If persists, use forgot-password flow.',
    );
    expect(ticket.visibility).toBe('customer-facing');
    expect((ticket.metadata as Record<string, unknown>)['ticketId']).toBe(501);
    expect((ticket.metadata as Record<string, unknown>)['tags']).toEqual(['login', 'auth']);
  });

  it('internal ticket (is_public=false) gets visibility=internal in HTTP mode', async () => {
    server.use(
      http.get('https://demo.zendesk.com/api/v2/tickets.json', () =>
        HttpResponse.json({
          tickets: [
            {
              id: 502,
              subject: 'Internal escalation note',
              description: 'Agent needs guidance on edge case.',
              status: 'solved',
              is_public: false,
              requester_id: 99001,
              tags: ['internal'],
              updated_at: '2026-04-21T08:00:00Z',
            },
          ],
          next_page: null,
        }),
      ),
      http.get('https://demo.zendesk.com/api/v2/tickets/502/comments.json', () =>
        HttpResponse.json({
          comments: [
            { id: 10, body: 'Escalate to tier-2 and notify team lead.', public: false, author_id: 88001 },
          ],
        }),
      ),
    );

    const connector = getConnector('zendesk');
    const source = makeSource({
      subdomain: 'demo',
      email: 'admin@demo.com',
      apiToken: 'tok_live',
    });

    const docs = await collect(connector.sync(source));
    const ticket = docs.find((d) => d.externalId === 'ticket:502')!;

    expect(ticket.visibility).toBe('internal');
  });

  it('sends Basic auth header to comments endpoint', async () => {
    let capturedCommentAuth: string | null = null;

    server.use(
      http.get('https://demo.zendesk.com/api/v2/tickets.json', () =>
        HttpResponse.json({
          tickets: [
            {
              id: 503,
              subject: 'Test',
              description: 'Test question.',
              status: 'solved',
              is_public: true,
              requester_id: 1,
              tags: [],
              updated_at: '2026-04-22T00:00:00Z',
            },
          ],
          next_page: null,
        }),
      ),
      http.get('https://demo.zendesk.com/api/v2/tickets/503/comments.json', ({ request }) => {
        capturedCommentAuth = request.headers.get('Authorization');
        return HttpResponse.json({ comments: [{ id: 1, body: 'Resolution.', public: true, author_id: 2 }] });
      }),
    );

    const connector = getConnector('zendesk');
    const source = makeSource({
      subdomain: 'demo',
      email: 'agent@demo.com',
      apiToken: 'mytoken',
    });

    await collect(connector.sync(source));

    const expected = `Basic ${Buffer.from('agent@demo.com/token:mytoken').toString('base64')}`;
    expect(capturedCommentAuth).toBe(expected);
  });
});
