import { docxParser } from './docx.js';
import { htmlParser } from './html.js';
import { markdownParser } from './markdown.js';
import { pdfParser } from './pdf.js';
import { spreadsheetParser } from './spreadsheet.js';
import type { Parser } from './types.js';

export { DocxParseError } from './docx.js';
export { PdfParseError } from './pdf.js';
export type { ParsedDocument, Parser } from './types.js';

export class UnsupportedMimeTypeError extends Error {
  constructor(mimeType: string) {
    super(`No parser available for MIME type: ${mimeType}`);
    this.name = 'UnsupportedMimeTypeError';
  }
}

const PARSERS: Parser[] = [pdfParser, markdownParser, docxParser, htmlParser, spreadsheetParser];

export function getParser(mimeType: string): Parser {
  const parser = PARSERS.find((p) => p.supports(mimeType));
  if (!parser) throw new UnsupportedMimeTypeError(mimeType);
  return parser;
}
