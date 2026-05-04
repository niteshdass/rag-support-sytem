import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';
import { spreadsheetParser } from '../../src/domain/ingestion/parsers/spreadsheet.js';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const XLS_MIME = 'application/vnd.ms-excel';
const CSV_MIME = 'text/csv';

function makeXlsxBuffer(sheets: Record<string, (string | number)[][]>): Buffer {
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, name);
  }
  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
}

function makeCsvBuffer(csv: string): Buffer {
  return Buffer.from(csv, 'utf-8');
}

describe('spreadsheetParser.supports', () => {
  it('returns true for xlsx', () => {
    expect(spreadsheetParser.supports(XLSX_MIME)).toBe(true);
  });

  it('returns true for xls', () => {
    expect(spreadsheetParser.supports(XLS_MIME)).toBe(true);
  });

  it('returns true for csv', () => {
    expect(spreadsheetParser.supports(CSV_MIME)).toBe(true);
  });

  it('returns false for other mime types', () => {
    expect(spreadsheetParser.supports('application/pdf')).toBe(false);
    expect(spreadsheetParser.supports('text/plain')).toBe(false);
  });
});

describe('spreadsheetParser.parse', () => {
  it('converts sheet rows to markdown table', async () => {
    const buf = makeXlsxBuffer({
      Sheet1: [
        ['Name', 'Age'],
        ['Alice', 30],
        ['Bob', 25],
      ],
    });
    const result = await spreadsheetParser.parse(buf, XLSX_MIME);
    expect(result.content).toContain('| Name | Age |');
    expect(result.content).toContain('| Alice | 30 |');
    expect(result.content).toContain('| Bob | 25 |');
  });

  it('uses first sheet name as title', async () => {
    const buf = makeXlsxBuffer({ Pricing: [['Plan', 'Price']] });
    const result = await spreadsheetParser.parse(buf, XLSX_MIME);
    expect(result.title).toBe('Pricing');
  });

  it('includes all sheets as sections', async () => {
    const buf = makeXlsxBuffer({
      Users: [['id', 'name'], [1, 'Alice']],
      Orders: [['id', 'item'], [1, 'Widget']],
    });
    const result = await spreadsheetParser.parse(buf, XLSX_MIME);
    expect(result.content).toContain('## Users');
    expect(result.content).toContain('## Orders');
  });

  it('includes sheet count in metadata', async () => {
    const buf = makeXlsxBuffer({
      A: [['x']],
      B: [['y']],
      C: [['z']],
    });
    const result = await spreadsheetParser.parse(buf, XLSX_MIME);
    expect((result.metadata as { sheetCount: number }).sheetCount).toBe(3);
  });

  it('adds separator row after header', async () => {
    const buf = makeXlsxBuffer({ Sheet1: [['Col1', 'Col2'], ['a', 'b']] });
    const result = await spreadsheetParser.parse(buf, XLSX_MIME);
    expect(result.content).toContain('| --- | --- |');
  });

  it('parses CSV buffer', async () => {
    const csv = 'Name,Score\nAlice,95\nBob,80';
    const result = await spreadsheetParser.parse(makeCsvBuffer(csv), CSV_MIME);
    expect(result.content).toContain('| Name | Score |');
    expect(result.content).toContain('| Alice | 95 |');
  });

  it('escapes pipe characters in cells', async () => {
    const buf = makeXlsxBuffer({ Sheet1: [['Note'], ['a | b']] });
    const result = await spreadsheetParser.parse(buf, XLSX_MIME);
    expect(result.content).toContain('a \\| b');
  });
});
