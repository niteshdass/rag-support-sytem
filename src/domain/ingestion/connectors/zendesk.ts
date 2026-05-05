import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import type { HydratedDocument } from 'mongoose';
import { htmlParser } from '../parsers/html.js';
import type { SourceDocument } from '../../../infra/mongo/models/Source.js';
import { logger } from '../../../observability/logger.js';
import { registerConnector, type ConnectorDocument } from './base.js';

const ZendeskConfigSchema = z.object({
  subdomain: z.string().min(1),
  email: z.string().email(),
  apiToken: z.string().min(1),
  fixtureMode: z.boolean().optional(),
  fixturePath: z.string().optional(),
  ticketFixturePath: z.string().optional(),
});

type ZendeskConfig = z.infer<typeof ZendeskConfigSchema>;

interface ZendeskArticle {
  id: number;
  title: string;
  html_url: string;
  body: string;
  updated_at: string;
}

interface ZendeskArticlesResponse {
  articles: ZendeskArticle[];
  next_page: string | null;
}

interface ZendeskTicket {
  id: number;
  subject: string;
  description: string;
  status: string;
  is_public: boolean;
  requester_id: number;
  tags: string[];
  updated_at: string;
}

interface ZendeskTicketsResponse {
  tickets: ZendeskTicket[];
  next_page: string | null;
}

interface ZendeskComment {
  id: number;
  body: string;
  public: boolean;
  author_id: number;
}

interface ZendeskCommentsResponse {
  comments: ZendeskComment[];
}

interface ZendeskTicketFixture extends ZendeskTicket {
  resolution: string;
}

const DEFAULT_FIXTURE_PATH = new URL(
  '../../../../scripts/seed/fixtures/zendesk-articles.json',
  import.meta.url,
).pathname;

const DEFAULT_TICKET_FIXTURE_PATH = new URL(
  '../../../../scripts/seed/fixtures/zendesk-tickets.json',
  import.meta.url,
).pathname;

function makeAuthHeaders(config: ZendeskConfig): Record<string, string> {
  const credentials = Buffer.from(`${config.email}/token:${config.apiToken}`).toString('base64');
  return {
    Authorization: `Basic ${credentials}`,
    'Content-Type': 'application/json',
  };
}

async function* fetchArticlesHttp(
  config: ZendeskConfig,
): AsyncIterable<ZendeskArticle> {
  const headers = makeAuthHeaders(config);

  let url: string | null =
    `https://${config.subdomain}.zendesk.com/api/v2/help_center/articles.json?per_page=100`;

  while (url !== null) {
    const response = await fetch(url, { headers });
    if (!response.ok) {
      throw new Error(`Zendesk API error: ${response.status} ${response.statusText}`);
    }
    const data = (await response.json()) as ZendeskArticlesResponse;
    for (const article of data.articles) {
      yield article;
    }
    url = data.next_page;
  }
}

async function* fetchArticlesFixture(fixturePath: string): AsyncIterable<ZendeskArticle> {
  const raw = await readFile(fixturePath, 'utf-8');
  const articles = JSON.parse(raw) as ZendeskArticle[];
  for (const article of articles) {
    yield article;
  }
}

async function articleToConnectorDoc(article: ZendeskArticle): Promise<ConnectorDocument> {
  const parsed = await htmlParser.parse(Buffer.from(article.body, 'utf-8'), 'text/html');
  return {
    externalId: String(article.id),
    title: article.title,
    url: article.html_url,
    content: parsed.content,
    mimeType: 'text/markdown',
    metadata: { updatedAt: article.updated_at },
  };
}

async function* fetchTicketsHttp(config: ZendeskConfig): AsyncIterable<ConnectorDocument> {
  const headers = makeAuthHeaders(config);

  let url: string | null =
    `https://${config.subdomain}.zendesk.com/api/v2/tickets.json?status=solved&per_page=100`;

  while (url !== null) {
    const response = await fetch(url, { headers });
    if (!response.ok) {
      throw new Error(`Zendesk API error: ${response.status} ${response.statusText}`);
    }
    const data = (await response.json()) as ZendeskTicketsResponse;

    for (const ticket of data.tickets) {
      const commentsRes = await fetch(
        `https://${config.subdomain}.zendesk.com/api/v2/tickets/${ticket.id}/comments.json`,
        { headers },
      );
      let resolution = '';
      if (commentsRes.ok) {
        const commentsData = (await commentsRes.json()) as ZendeskCommentsResponse;
        const last = commentsData.comments[commentsData.comments.length - 1];
        resolution = last?.body ?? '';
      }
      yield ticketToConnectorDoc(ticket, resolution);
    }

    url = data.next_page;
  }
}

async function* fetchTicketsFixture(fixturePath: string): AsyncIterable<ConnectorDocument> {
  const raw = await readFile(fixturePath, 'utf-8');
  const tickets = JSON.parse(raw) as ZendeskTicketFixture[];
  for (const ticket of tickets) {
    yield ticketToConnectorDoc(ticket, ticket.resolution);
  }
}

function ticketToConnectorDoc(ticket: ZendeskTicket, resolution: string): ConnectorDocument {
  return {
    externalId: `ticket:${ticket.id}`,
    title: ticket.subject,
    content: `Subject: ${ticket.subject}\nQuestion: ${ticket.description}\nResolution: ${resolution}`,
    mimeType: 'text/plain',
    visibility: ticket.is_public ? 'customer-facing' : 'internal',
    metadata: {
      ticketId: ticket.id,
      requesterId: ticket.requester_id,
      tags: ticket.tags,
      resolvedAt: ticket.updated_at,
    },
  };
}

registerConnector({
  type: 'zendesk',

  async *sync(source: HydratedDocument<SourceDocument>): AsyncIterable<ConnectorDocument> {
    const config = ZendeskConfigSchema.parse(source.config);
    const log = logger.child({ connector: 'zendesk', tenantId: source.tenantId });

    const articles =
      config.fixtureMode === true
        ? fetchArticlesFixture(config.fixturePath ?? DEFAULT_FIXTURE_PATH)
        : fetchArticlesHttp(config);

    let articleCount = 0;
    for await (const article of articles) {
      yield await articleToConnectorDoc(article);
      articleCount++;
    }

    const tickets =
      config.fixtureMode === true
        ? fetchTicketsFixture(config.ticketFixturePath ?? DEFAULT_TICKET_FIXTURE_PATH)
        : fetchTicketsHttp(config);

    let ticketCount = 0;
    for await (const doc of tickets) {
      yield doc;
      ticketCount++;
    }

    log.info({ articleCount, ticketCount }, 'zendesk sync complete');
  },
});
