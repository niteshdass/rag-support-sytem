import mammoth from 'mammoth';
import type { ParsedDocument, Parser } from './types.js';

// mammoth's published types omit convertToMarkdown, but it exists at runtime
const mammothFull = mammoth as typeof mammoth & {
  convertToMarkdown: typeof mammoth.convertToHtml;
};

export class DocxParseError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'DocxParseError';
  }
}

const H1_RE = /^#\s+(.+)$/m;

export const docxParser: Parser = {
  supports(mimeType: string): boolean {
    return mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  },

  async parse(buffer: Buffer, _mimeType: string): Promise<ParsedDocument> {
    let result;
    try {
      result = await mammothFull.convertToMarkdown({ buffer });
    } catch (error) {
      throw new DocxParseError('Failed to parse DOCX file', { cause: error });
    }

    const content = result.value;
    const match = H1_RE.exec(content);
    const title = match ? match[1]!.trim() : undefined;

    return {
      content,
      metadata: { warnings: result.messages.length },
      ...(title !== undefined ? { title } : {}),
    };
  },
};
