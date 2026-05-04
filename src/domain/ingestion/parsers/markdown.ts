import type { ParsedDocument, Parser } from './types.js';

const SUPPORTED = new Set(['text/markdown', 'text/plain', 'text/x-markdown']);

const H1_RE = /^#\s+(.+)$/m;

export const markdownParser: Parser = {
  supports(mimeType: string): boolean {
    return SUPPORTED.has(mimeType);
  },

  async parse(buffer: Buffer, _mimeType: string): Promise<ParsedDocument> {
    const content = buffer.toString('utf-8');
    const match = H1_RE.exec(content);
    const title = match ? match[1]!.trim() : undefined;
    return { title, content };
  },
};
