import { describe, expect, it, vi } from 'vitest';

vi.mock('mammoth', () => ({
  default: {
    convertToMarkdown: vi.fn(),
  },
}));

import mammoth from 'mammoth';
import { DocxParseError, docxParser } from '../../src/domain/ingestion/parsers/docx.js';

const mockConvert = vi.mocked(mammoth.convertToMarkdown);

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

describe('docxParser.supports', () => {
  it('returns true for docx mime type', () => {
    expect(docxParser.supports(DOCX_MIME)).toBe(true);
  });

  it('returns false for other mime types', () => {
    expect(docxParser.supports('application/pdf')).toBe(false);
    expect(docxParser.supports('text/plain')).toBe(false);
  });
});

describe('docxParser.parse', () => {
  it('extracts content from docx', async () => {
    mockConvert.mockResolvedValueOnce({ value: '# Hello\n\nWorld', messages: [] });
    const result = await docxParser.parse(Buffer.from('fake'), DOCX_MIME);
    expect(result.content).toBe('# Hello\n\nWorld');
  });

  it('extracts title from first H1', async () => {
    mockConvert.mockResolvedValueOnce({ value: '# Getting Started\n\nContent here.', messages: [] });
    const result = await docxParser.parse(Buffer.from('fake'), DOCX_MIME);
    expect(result.title).toBe('Getting Started');
  });

  it('returns undefined title when no H1', async () => {
    mockConvert.mockResolvedValueOnce({ value: 'No heading here.', messages: [] });
    const result = await docxParser.parse(Buffer.from('fake'), DOCX_MIME);
    expect(result.title).toBeUndefined();
  });

  it('includes warning count in metadata', async () => {
    mockConvert.mockResolvedValueOnce({
      value: '# Title\n\nContent.',
      messages: [{ type: 'warning', message: 'something' }],
    });
    const result = await docxParser.parse(Buffer.from('fake'), DOCX_MIME);
    expect((result.metadata as { warnings: number }).warnings).toBe(1);
  });

  it('throws DocxParseError when mammoth fails', async () => {
    mockConvert.mockRejectedValueOnce(new Error('Corrupted zip'));
    await expect(docxParser.parse(Buffer.from('bad'), DOCX_MIME)).rejects.toThrow(DocxParseError);
  });
});
