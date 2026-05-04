import { PDFParse, PasswordException } from 'pdf-parse';
import type { ParsedDocument, Parser } from './types.js';

export class PdfParseError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'PdfParseError';
  }
}

export const pdfParser: Parser = {
  supports(mimeType: string): boolean {
    return mimeType === 'application/pdf';
  },

  async parse(buffer: Buffer, _mimeType: string): Promise<ParsedDocument> {
    const parser = new PDFParse({ data: buffer });
    try {
      const [info, textResult] = await Promise.all([
        parser.getInfo(),
        parser.getText(),
      ]);

      const content = textResult.text;
      const pageCount: number = info.total;

      const metaTitle = (info.info as Record<string, unknown> | undefined)?.['Title'];
      const title =
        typeof metaTitle === 'string' && metaTitle.trim()
          ? metaTitle.trim()
          : content.split('\n').find((line) => line.trim())?.trim();

      return { title, content, metadata: { pageCount } };
    } catch (error) {
      if (error instanceof PasswordException) {
        throw new PdfParseError('PDF is encrypted and requires a password', { cause: error });
      }
      throw error;
    } finally {
      await parser.destroy();
    }
  },
};
