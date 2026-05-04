import { describe, expect, it, vi } from 'vitest';

vi.mock('pdf-parse', () => {
  class PasswordException extends Error {
    constructor(msg: string) {
      super(msg);
      this.name = 'PasswordException';
    }
  }
  return { PDFParse: vi.fn(), PasswordException };
});

import { PDFParse, PasswordException } from 'pdf-parse';
import { PdfParseError, pdfParser } from '../../src/domain/ingestion/parsers/pdf.js';

const MockPDFParse = vi.mocked(PDFParse);

function makeMockParser(
  info: { total: number; info?: Record<string, unknown> },
  text: string,
) {
  const instance = {
    getInfo: vi.fn().mockResolvedValue(info),
    getText: vi.fn().mockResolvedValue({ text }),
    destroy: vi.fn().mockResolvedValue(undefined),
  };
  MockPDFParse.mockImplementationOnce(() => instance as unknown as InstanceType<typeof PDFParse>);
  return instance;
}

describe('pdfParser.supports', () => {
  it('returns true for application/pdf', () => {
    expect(pdfParser.supports('application/pdf')).toBe(true);
  });

  it('returns false for other mime types', () => {
    expect(pdfParser.supports('text/plain')).toBe(false);
    expect(pdfParser.supports('application/octet-stream')).toBe(false);
  });
});

describe('pdfParser.parse', () => {
  it('extracts text content', async () => {
    makeMockParser({ total: 1 }, 'Hello SupportPilot\nLine two');
    const result = await pdfParser.parse(Buffer.from('%PDF'), 'application/pdf');
    expect(result.content).toBe('Hello SupportPilot\nLine two');
  });

  it('captures page count in metadata', async () => {
    makeMockParser({ total: 3 }, 'Some text');
    const result = await pdfParser.parse(Buffer.from('%PDF'), 'application/pdf');
    expect((result.metadata as { pageCount: number }).pageCount).toBe(3);
  });

  it('uses PDF metadata Title when present', async () => {
    makeMockParser({ total: 1, info: { Title: 'My Docs Title' } }, 'First line\nSecond line');
    const result = await pdfParser.parse(Buffer.from('%PDF'), 'application/pdf');
    expect(result.title).toBe('My Docs Title');
  });

  it('falls back to first non-empty line when no metadata title', async () => {
    makeMockParser({ total: 1 }, '\n\nIntroduction to SupportPilot\nMore content');
    const result = await pdfParser.parse(Buffer.from('%PDF'), 'application/pdf');
    expect(result.title).toBe('Introduction to SupportPilot');
  });

  it('ignores blank metadata Title and falls back to first line', async () => {
    makeMockParser({ total: 1, info: { Title: '   ' } }, 'Fallback Title\nBody');
    const result = await pdfParser.parse(Buffer.from('%PDF'), 'application/pdf');
    expect(result.title).toBe('Fallback Title');
  });

  it('calls destroy even when parsing succeeds', async () => {
    const mock = makeMockParser({ total: 1 }, 'text');
    await pdfParser.parse(Buffer.from('%PDF'), 'application/pdf');
    expect(mock.destroy).toHaveBeenCalledOnce();
  });

  it('throws PdfParseError for encrypted PDFs', async () => {
    const instance = {
      getInfo: vi.fn().mockRejectedValue(new PasswordException('Password required')),
      getText: vi.fn().mockRejectedValue(new PasswordException('Password required')),
      destroy: vi.fn().mockResolvedValue(undefined),
    };
    MockPDFParse.mockImplementationOnce(() => instance as unknown as InstanceType<typeof PDFParse>);

    await expect(pdfParser.parse(Buffer.from('%PDF'), 'application/pdf')).rejects.toThrow(
      PdfParseError,
    );
  });

  it('still calls destroy when encrypted PDF throws', async () => {
    const instance = {
      getInfo: vi.fn().mockRejectedValue(new PasswordException('locked')),
      getText: vi.fn().mockRejectedValue(new PasswordException('locked')),
      destroy: vi.fn().mockResolvedValue(undefined),
    };
    MockPDFParse.mockImplementationOnce(() => instance as unknown as InstanceType<typeof PDFParse>);

    await expect(pdfParser.parse(Buffer.from('%PDF'), 'application/pdf')).rejects.toThrow(
      PdfParseError,
    );
    expect(instance.destroy).toHaveBeenCalledOnce();
  });
});
