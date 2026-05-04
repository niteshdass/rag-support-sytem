import { describe, expect, it, vi } from 'vitest';

vi.mock('pdf-parse', () => ({
  PDFParse: vi.fn(),
  PasswordException: class PasswordException extends Error {},
}));

import { UnsupportedMimeTypeError, getParser } from '../../src/domain/ingestion/parsers/index.js';

describe('getParser', () => {
  it('returns pdf parser for application/pdf', () => {
    const parser = getParser('application/pdf');
    expect(parser.supports('application/pdf')).toBe(true);
  });

  it('returns markdown parser for text/markdown', () => {
    const parser = getParser('text/markdown');
    expect(parser.supports('text/markdown')).toBe(true);
  });

  it('returns markdown parser for text/plain', () => {
    const parser = getParser('text/plain');
    expect(parser.supports('text/plain')).toBe(true);
  });

  it('returns docx parser for docx mime type', () => {
    const mime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    const parser = getParser(mime);
    expect(parser.supports(mime)).toBe(true);
  });

  it('returns html parser for text/html', () => {
    const parser = getParser('text/html');
    expect(parser.supports('text/html')).toBe(true);
  });

  it('returns spreadsheet parser for xlsx mime type', () => {
    const mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    const parser = getParser(mime);
    expect(parser.supports(mime)).toBe(true);
  });

  it('throws UnsupportedMimeTypeError for unknown mime type', () => {
    expect(() => getParser('application/octet-stream')).toThrow(UnsupportedMimeTypeError);
  });

  it('UnsupportedMimeTypeError message includes the mime type', () => {
    expect(() => getParser('video/mp4')).toThrow('video/mp4');
  });
});
