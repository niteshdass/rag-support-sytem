import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
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

const DEFAULT_FIXTURE_PATH = new URL(
  '../../../../scripts/seed/fixtures/zendesk-articles.json',
  import.meta.url,
).pathname;

async function* fetchArticlesHttp(
  config: ZendeskConfig,
): AsyncIterable<ZendeskArticle> {
  const credentials = Buffer.from(`${config.email}/token:${config.apiToken}`).toString('base64');
  const headers = {
    Authorization: `Basic ${credentials}`,
    'Content-Type': 'application/json',
  };

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

registerConnector({
  type: 'zendesk',

  async *sync(source: HydratedDocument<SourceDocument>): AsyncIterable<ConnectorDocument> {
    const config = ZendeskConfigSchema.parse(source.config);
    const log = logger.child({ connector: 'zendesk', tenantId: source.tenantId });

    const articles =
      config.fixtureMode === true
        ? fetchArticlesFixture(config.fixturePath ?? DEFAULT_FIXTURE_PATH)
        : fetchArticlesHttp(config);

    let count = 0;
    for await (const article of articles) {
      yield await articleToConnectorDoc(article);
      count++;
    }
    log.info({ count }, 'zendesk sync complete');
  },
});
