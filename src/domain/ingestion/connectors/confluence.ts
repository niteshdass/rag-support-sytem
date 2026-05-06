import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import type { HydratedDocument } from 'mongoose';
import { htmlParser } from '../parsers/html.js';
import type { SourceDocument } from '../../../infra/mongo/models/Source.js';
import { logger } from '../../../observability/logger.js';
import { registerConnector, type ConnectorDocument } from './base.js';

const ConfluenceConfigSchema = z.object({
  domain: z.string().min(1),
  email: z.string().email(),
  apiToken: z.string().min(1),
  spaceKeys: z.array(z.string()).min(1),
  visibility: z.enum(['customer-facing', 'internal', 'draft']).optional(),
  fixtureMode: z.boolean().optional(),
  fixturePath: z.string().optional(),
});

type ConfluenceConfig = z.infer<typeof ConfluenceConfigSchema>;

interface ConfluencePage {
  id: string;
  title: string;
  _links: { webui: string; base: string };
  body?: { storage?: { value: string } };
  version?: { when: string };
}

interface ConfluenceSearchResult {
  results: ConfluencePage[];
  _links?: { next?: string };
  size: number;
}

interface ConfluenceFixturePage {
  id: string;
  title: string;
  url: string;
  htmlBody: string;
}

const DEFAULT_FIXTURE_PATH = new URL(
  '../../../../scripts/seed/fixtures/confluence-pages.json',
  import.meta.url,
).pathname;

function makeAuthHeaders(config: ConfluenceConfig): Record<string, string> {
  const credentials = Buffer.from(`${config.email}:${config.apiToken}`).toString('base64');
  return {
    Authorization: `Basic ${credentials}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
}

async function* fetchPagesInSpace(
  config: ConfluenceConfig,
  spaceKey: string,
): AsyncIterable<ConfluencePage> {
  const headers = makeAuthHeaders(config);
  let start = 0;
  const limit = 50;

  while (true) {
    const url =
      `https://${config.domain}/wiki/rest/api/content` +
      `?spaceKey=${spaceKey}&type=page&status=current` +
      `&expand=body.storage,version` +
      `&start=${start}&limit=${limit}`;

    const resp = await fetch(url, { headers });
    if (!resp.ok) {
      throw new Error(`Confluence API error: ${resp.status} ${resp.statusText}`);
    }

    const data = (await resp.json()) as ConfluenceSearchResult;
    for (const page of data.results) {
      yield page;
    }

    if (data.results.length < limit) break;
    start += limit;
  }
}

async function pageToConnectorDoc(
  page: ConfluencePage,
  config: ConfluenceConfig,
  visibility: 'customer-facing' | 'internal' | 'draft',
): Promise<ConnectorDocument> {
  const htmlBody = page.body?.storage?.value ?? '';
  const parsed = await htmlParser.parse(Buffer.from(htmlBody, 'utf-8'), 'text/html');
  const baseUrl = `https://${config.domain}/wiki`;

  return {
    externalId: page.id,
    title: page.title,
    url: `${baseUrl}${page._links.webui}`,
    content: parsed.content,
    mimeType: 'text/markdown',
    visibility,
    metadata: {
      spaceKey: '',
      lastModified: page.version?.when,
    },
  };
}

async function* syncFixture(
  fixturePath: string,
  visibility: 'customer-facing' | 'internal' | 'draft',
): AsyncIterable<ConnectorDocument> {
  const raw = await readFile(fixturePath, 'utf-8');
  const pages = JSON.parse(raw) as ConfluenceFixturePage[];

  for (const page of pages) {
    const parsed = await htmlParser.parse(Buffer.from(page.htmlBody, 'utf-8'), 'text/html');
    yield {
      externalId: page.id,
      title: page.title,
      url: page.url,
      content: parsed.content,
      mimeType: 'text/markdown',
      visibility,
    };
  }
}

registerConnector({
  type: 'confluence',

  async *sync(source: HydratedDocument<SourceDocument>): AsyncIterable<ConnectorDocument> {
    const config = ConfluenceConfigSchema.parse(source.config);
    const log = logger.child({ connector: 'confluence', tenantId: source.tenantId });
    const visibility = config.visibility ?? 'customer-facing';

    if (config.fixtureMode === true) {
      yield* syncFixture(config.fixturePath ?? DEFAULT_FIXTURE_PATH, visibility);
      return;
    }

    let count = 0;

    for (const spaceKey of config.spaceKeys) {
      for await (const page of fetchPagesInSpace(config, spaceKey)) {
        const doc = await pageToConnectorDoc(page, config, visibility);
        doc.metadata = { ...(doc.metadata ?? {}), spaceKey };
        yield doc;
        count++;
      }
    }

    log.info({ count }, 'confluence sync complete');
  },
});
