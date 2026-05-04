import { describe, expect, it } from 'vitest';
import { markdownParser } from '../../src/domain/ingestion/parsers/markdown.js';

describe('markdownParser.supports', () => {
  it('returns true for text/markdown', () => {
    expect(markdownParser.supports('text/markdown')).toBe(true);
  });

  it('returns true for text/plain', () => {
    expect(markdownParser.supports('text/plain')).toBe(true);
  });

  it('returns true for text/x-markdown', () => {
    expect(markdownParser.supports('text/x-markdown')).toBe(true);
  });

  it('returns false for application/pdf', () => {
    expect(markdownParser.supports('application/pdf')).toBe(false);
  });
});

describe('markdownParser.parse', () => {
  it('extracts title from first H1', async () => {
    const md = '# My Title\n\nSome content here.';
    const result = await markdownParser.parse(Buffer.from(md), 'text/markdown');
    expect(result.title).toBe('My Title');
    expect(result.content).toBe(md);
  });

  it('handles plain text without H1 title', async () => {
    const text = 'Just some plain text.\nNo headings here.';
    const result = await markdownParser.parse(Buffer.from(text), 'text/plain');
    expect(result.title).toBeUndefined();
    expect(result.content).toBe(text);
  });

  it('ignores H2+ headings for title extraction', async () => {
    const md = '## Section\n\nContent.';
    const result = await markdownParser.parse(Buffer.from(md), 'text/markdown');
    expect(result.title).toBeUndefined();
  });

  it('returns content as-is', async () => {
    const md = '# Title\n\n```js\nconst x = 1;\n```\n\n- item 1\n- item 2';
    const result = await markdownParser.parse(Buffer.from(md), 'text/markdown');
    expect(result.content).toBe(md);
  });
});
