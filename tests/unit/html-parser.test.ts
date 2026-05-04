import { describe, expect, it } from 'vitest';
import { htmlParser } from '../../src/domain/ingestion/parsers/html.js';

describe('htmlParser.supports', () => {
  it('returns true for text/html', () => {
    expect(htmlParser.supports('text/html')).toBe(true);
  });

  it('returns true for application/xhtml+xml', () => {
    expect(htmlParser.supports('application/xhtml+xml')).toBe(true);
  });

  it('returns false for other mime types', () => {
    expect(htmlParser.supports('application/pdf')).toBe(false);
    expect(htmlParser.supports('text/plain')).toBe(false);
  });
});

describe('htmlParser.parse', () => {
  it('extracts title from <title> tag', async () => {
    const html = '<html><head><title>My Page</title></head><body><p>Content</p></body></html>';
    const result = await htmlParser.parse(Buffer.from(html), 'text/html');
    expect(result.title).toBe('My Page');
  });

  it('falls back to <h1> when no <title>', async () => {
    const html = '<html><body><h1>Section Header</h1><p>Body</p></body></html>';
    const result = await htmlParser.parse(Buffer.from(html), 'text/html');
    expect(result.title).toBe('Section Header');
  });

  it('strips <script> tags from content', async () => {
    const html = '<html><body><p>Text</p><script>alert("xss")</script></body></html>';
    const result = await htmlParser.parse(Buffer.from(html), 'text/html');
    expect(result.content).not.toContain('alert');
    expect(result.content).toContain('Text');
  });

  it('strips <style> tags from content', async () => {
    const html = '<html><body><style>.foo{color:red}</style><p>Text</p></body></html>';
    const result = await htmlParser.parse(Buffer.from(html), 'text/html');
    expect(result.content).not.toContain('color:red');
  });

  it('converts bold to markdown', async () => {
    const html = '<html><body><p><strong>Important</strong> text</p></body></html>';
    const result = await htmlParser.parse(Buffer.from(html), 'text/html');
    expect(result.content).toContain('**Important**');
  });

  it('converts headings to markdown atx style', async () => {
    const html = '<html><body><h1>Title</h1><h2>Sub</h2></body></html>';
    const result = await htmlParser.parse(Buffer.from(html), 'text/html');
    expect(result.content).toContain('# Title');
    expect(result.content).toContain('## Sub');
  });

  it('prefers <main> content over full body', async () => {
    const html =
      '<html><body><nav>Nav stuff</nav><main><p>Main content</p></main><footer>Footer</footer></body></html>';
    const result = await htmlParser.parse(Buffer.from(html), 'text/html');
    expect(result.content).toContain('Main content');
    expect(result.content).not.toContain('Nav stuff');
  });
});
