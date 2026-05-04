import * as cheerio from 'cheerio';
import TurndownService from 'turndown';
import type { ParsedDocument, Parser } from './types.js';

const SUPPORTED = new Set(['text/html', 'application/xhtml+xml']);

const turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });

export const htmlParser: Parser = {
  supports(mimeType: string): boolean {
    return SUPPORTED.has(mimeType);
  },

  async parse(buffer: Buffer, _mimeType: string): Promise<ParsedDocument> {
    const html = buffer.toString('utf-8');
    const $ = cheerio.load(html);

    const title = $('title').first().text().trim() || $('h1').first().text().trim() || undefined;

    $('script, style, noscript, iframe, nav, footer, [aria-hidden="true"]').remove();

    const bodyHtml = $('main, article, [role="main"], body').first().html() ?? $.html();
    const content = turndown.turndown(bodyHtml).trim();

    return { content, ...(title !== undefined ? { title } : {}) };
  },
};
