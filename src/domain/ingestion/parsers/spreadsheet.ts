import * as XLSX from 'xlsx';
import type { ParsedDocument, Parser } from './types.js';

const SUPPORTED = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/csv',
]);

function sheetToMarkdown(sheet: XLSX.WorkSheet): string {
  const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: '' });
  if (rows.length === 0) return '';

  const lines: string[] = [];
  rows.forEach((row, i) => {
    const cells = (row as string[]).map((cell) => String(cell ?? '').replace(/\|/g, '\\|'));
    lines.push(`| ${cells.join(' | ')} |`);
    if (i === 0) {
      lines.push(`| ${cells.map(() => '---').join(' | ')} |`);
    }
  });
  return lines.join('\n');
}

export const spreadsheetParser: Parser = {
  supports(mimeType: string): boolean {
    return SUPPORTED.has(mimeType);
  },

  async parse(buffer: Buffer, _mimeType: string): Promise<ParsedDocument> {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetNames = workbook.SheetNames;

    const sections = sheetNames
      .map((name) => {
        const sheet = workbook.Sheets[name];
        if (!sheet) return null;
        const table = sheetToMarkdown(sheet);
        return table ? `## ${name}\n\n${table}` : null;
      })
      .filter((s): s is string => s !== null);

    const content = sections.join('\n\n');
    const title = sheetNames[0];

    return {
      content,
      metadata: { sheetCount: sheetNames.length },
      ...(title !== undefined ? { title } : {}),
    };
  },
};
