import { z } from 'zod';
import { CheerioCrawler, RequestQueue, Configuration } from 'crawlee';
import type { HydratedDocument } from 'mongoose';
import TurndownService from 'turndown';
import type { SourceDocument } from '../../../infra/mongo/models/Source.js';
import { logger } from '../../../observability/logger.js';
import { registerConnector, type ConnectorDocument } from './base.js';

const WebCrawlerConfigSchema = z.object({
  startUrls: z.array(z.string().url()).min(1),
  maxDepth: z.number().int().min(1).default(3),
  sameOriginOnly: z.boolean().default(true),
  includePatterns: z.array(z.string()).optional(),
  excludePatterns: z.array(z.string()).optional(),
  ratePerSecond: z.number().positive().default(1),
  visibility: z.enum(['customer-facing', 'internal', 'draft']).optional(),
});

type WebCrawlerConfig = z.infer<typeof WebCrawlerConfigSchema>;

const turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });

function matchesAny(url: string, patterns: string[]): boolean {
  return patterns.some((p) => {
    try {
      return new RegExp(p).test(url);
    } catch {
      return url.includes(p);
    }
  });
}

function originOf(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return '';
  }
}

export async function crawlUrls(
  config: WebCrawlerConfig,
): Promise<ConnectorDocument[]> {
  const results: ConnectorDocument[] = [];
  const startOrigins = new Set(config.startUrls.map(originOf));
  const delayMs = Math.round(1000 / config.ratePerSecond);
  const visibility = config.visibility ?? 'customer-facing';

  // Crawlee uses a global Configuration singleton; set storage to a temp dir
  Configuration.getGlobalConfig().set('persistStorage', false);

  const queue = await RequestQueue.open();

  for (const url of config.startUrls) {
    await queue.addRequest({ url, userData: { depth: 0 } });
  }

  const crawler = new CheerioCrawler({
    requestQueue: queue,
    respectRobotsTxtFile: true,
    maxConcurrency: 1,
    minConcurrency: 1,
    requestHandlerTimeoutSecs: 30,

    async requestHandler({ request, $, enqueueLinks }) {
      const url = request.url;
      const depth = (request.userData?.depth as number) ?? 0;

      if (config.excludePatterns && matchesAny(url, config.excludePatterns)) return;
      if (config.includePatterns && !matchesAny(url, config.includePatterns)) return;

      $('script, style, noscript, nav, footer, [aria-hidden="true"]').remove();

      const title =
        $('title').first().text().trim() ||
        $('h1').first().text().trim() ||
        url;

      const bodyHtml = $('main, article, [role="main"], body').first().html() ?? $.html();
      const content = turndown.turndown(bodyHtml).trim();

      results.push({
        externalId: url,
        title,
        url,
        content,
        mimeType: 'text/markdown',
        visibility,
        metadata: { depth, crawledAt: new Date().toISOString() },
      });

      if (depth < config.maxDepth) {
        await enqueueLinks({
          transformRequestFunction(req) {
            const href = req.url;
            if (config.sameOriginOnly && !startOrigins.has(originOf(href))) {
              return false;
            }
            req.userData = { depth: depth + 1 };
            return req;
          },
        });
      }

      // polite delay
      await new Promise((r) => setTimeout(r, delayMs));
    },

    failedRequestHandler({ request }) {
      logger.warn({ url: request.url }, 'web crawler: request failed');
    },
  });

  await crawler.run();

  return results;
}

registerConnector({
  type: 'web-crawler',

  async *sync(source: HydratedDocument<SourceDocument>): AsyncIterable<ConnectorDocument> {
    const config = WebCrawlerConfigSchema.parse(source.config);
    const log = logger.child({ connector: 'web-crawler', tenantId: source.tenantId });

    const docs = await crawlUrls(config);
    log.info({ count: docs.length }, 'web crawler sync complete');

    for (const doc of docs) {
      yield doc;
    }
  },
});
