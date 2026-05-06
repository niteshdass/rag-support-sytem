import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { Client } from '@notionhq/client';
import type { HydratedDocument } from 'mongoose';
import type {
  PageObjectResponse,
} from '@notionhq/client/build/src/api-endpoints.js';
import type { SourceDocument } from '../../../infra/mongo/models/Source.js';
import { logger } from '../../../observability/logger.js';
import { registerConnector, type ConnectorDocument } from './base.js';

const NotionConfigSchema = z.object({
  token: z.string().min(1),
  rootPageIds: z.array(z.string()).optional(),
  databaseIds: z.array(z.string()).optional(),
  visibility: z.enum(['customer-facing', 'internal', 'draft']).optional(),
  fixtureMode: z.boolean().optional(),
  fixturePath: z.string().optional(),
});

type NotionConfig = z.infer<typeof NotionConfigSchema>;

interface NotionFixtureBlock {
  type: string;
  text: string;
}

interface NotionFixturePage {
  id: string;
  title: string;
  url: string;
  blocks: NotionFixtureBlock[];
}

const DEFAULT_FIXTURE_PATH = new URL(
  '../../../../scripts/seed/fixtures/notion-pages.json',
  import.meta.url,
).pathname;

function blocksToMarkdown(blocks: NotionFixtureBlock[]): string {
  return blocks
    .map((b) => {
      switch (b.type) {
        case 'heading_1': return `# ${b.text}`;
        case 'heading_2': return `## ${b.text}`;
        case 'heading_3': return `### ${b.text}`;
        case 'bulleted_list_item': return `- ${b.text}`;
        case 'numbered_list_item': return `1. ${b.text}`;
        case 'code': return `\`\`\`\n${b.text}\n\`\`\``;
        case 'quote': return `> ${b.text}`;
        default: return b.text;
      }
    })
    .filter(Boolean)
    .join('\n\n');
}

function extractPageTitle(page: PageObjectResponse): string {
  const props = page.properties;
  for (const key of ['title', 'Title', 'Name', 'name']) {
    const prop = props[key];
    if (!prop) continue;
    if (prop.type === 'title' && prop.title.length > 0) {
      return prop.title.map((t) => t.plain_text).join('');
    }
  }
  return page.id;
}

async function pageToConnectorDoc(
  client: Client,
  pageId: string,
  visibility: 'customer-facing' | 'internal' | 'draft',
): Promise<ConnectorDocument> {
  const page = (await client.pages.retrieve({ page_id: pageId })) as PageObjectResponse;
  const title = extractPageTitle(page);

  // Use retrieveMarkdown for clean content extraction (SDK v5)
  const mdResp = await client.pages.retrieveMarkdown({ page_id: pageId });
  const content = (mdResp as unknown as { markdown: string }).markdown ?? '';

  return {
    externalId: pageId,
    title,
    url: page.url,
    content,
    mimeType: 'text/markdown',
    visibility,
    metadata: { pageId, lastEditedTime: page.last_edited_time },
  };
}

async function* walkDatabase(
  client: Client,
  databaseId: string,
  visibility: 'customer-facing' | 'internal' | 'draft',
): AsyncIterable<ConnectorDocument> {
  let cursor: string | undefined;

  do {
    // In SDK v5 there's no databases.query() — use search filtered by parent database
    const resp = await client.search({
      filter: { property: 'object', value: 'page' },
      ...(cursor ? { start_cursor: cursor } : {}),
      page_size: 100,
    });

    for (const result of resp.results) {
      if (result.object !== 'page') continue;
      const page = result as PageObjectResponse;
      // Only include pages whose parent is the target database
      if (
        page.parent.type !== 'database_id' ||
        page.parent.database_id.replace(/-/g, '') !== databaseId.replace(/-/g, '')
      ) {
        continue;
      }
      yield await pageToConnectorDoc(client, page.id, visibility);
    }

    cursor = resp.has_more ? (resp.next_cursor ?? undefined) : undefined;
  } while (cursor);
}

async function* syncFixture(
  fixturePath: string,
  visibility: 'customer-facing' | 'internal' | 'draft',
): AsyncIterable<ConnectorDocument> {
  const raw = await readFile(fixturePath, 'utf-8');
  const pages = JSON.parse(raw) as NotionFixturePage[];

  for (const page of pages) {
    yield {
      externalId: page.id,
      title: page.title,
      url: page.url,
      content: blocksToMarkdown(page.blocks),
      mimeType: 'text/markdown',
      visibility,
      metadata: { pageId: page.id },
    };
  }
}

registerConnector({
  type: 'notion',

  async *sync(source: HydratedDocument<SourceDocument>): AsyncIterable<ConnectorDocument> {
    const config = NotionConfigSchema.parse(source.config);
    const log = logger.child({ connector: 'notion', tenantId: source.tenantId });
    const visibility = config.visibility ?? 'customer-facing';

    if (config.fixtureMode === true) {
      yield* syncFixture(config.fixturePath ?? DEFAULT_FIXTURE_PATH, visibility);
      return;
    }

    const client = new Client({ auth: config.token });
    let count = 0;

    for (const pageId of config.rootPageIds ?? []) {
      yield await pageToConnectorDoc(client, pageId, visibility);
      count++;
    }

    for (const dbId of config.databaseIds ?? []) {
      for await (const doc of walkDatabase(client, dbId, visibility)) {
        yield doc;
        count++;
      }
    }

    log.info({ count }, 'notion sync complete');
  },
});
