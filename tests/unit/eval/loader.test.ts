import { writeFile, unlink, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { loadGoldenSet, GoldenSetParseError, GoldenEntrySchema } from '../../../scripts/eval/loader.js';

const TMP = join(tmpdir(), 'eval-loader-test');

beforeAll(() => mkdir(TMP, { recursive: true }));

async function write(name: string, lines: string[]): Promise<string> {
  const p = join(TMP, name);
  await writeFile(p, lines.join('\n'), 'utf8');
  return p;
}

const VALID = {
  id: 'gs-001',
  query: 'How do I reset my password?',
  audience: 'end-user',
  expectedAnswerSummary: 'Click Forgot Password on the login page.',
  mustReferenceDocIds: ['1002'],
  mustNotHallucinate: ['24-hour expiry'],
};

describe('loadGoldenSet', () => {
  it('round-trips valid entries', async () => {
    const p = await write('valid.jsonl', [JSON.stringify(VALID)]);
    const entries = await loadGoldenSet(p);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject(VALID);
  });

  it('skips blank lines', async () => {
    const p = await write('blank.jsonl', ['', JSON.stringify(VALID), '', JSON.stringify({ ...VALID, id: 'gs-002' })]);
    const entries = await loadGoldenSet(p);
    expect(entries).toHaveLength(2);
  });

  it('rejects invalid JSON', async () => {
    const p = await write('badjson.jsonl', ['{not json}']);
    await expect(loadGoldenSet(p)).rejects.toThrow(GoldenSetParseError);
  });

  it('rejects missing required field', async () => {
    const { query: _q, ...noQuery } = VALID;
    const p = await write('missingfield.jsonl', [JSON.stringify(noQuery)]);
    await expect(loadGoldenSet(p)).rejects.toThrow(GoldenSetParseError);
  });

  it('rejects invalid audience value', async () => {
    const p = await write('badaudience.jsonl', [JSON.stringify({ ...VALID, audience: 'robot' })]);
    await expect(loadGoldenSet(p)).rejects.toThrow(GoldenSetParseError);
  });

  it('rejects empty mustReferenceDocIds', async () => {
    const p = await write('emptyrefs.jsonl', [JSON.stringify({ ...VALID, mustReferenceDocIds: [] })]);
    await expect(loadGoldenSet(p)).rejects.toThrow(GoldenSetParseError);
  });

  it('includes line number in error message', async () => {
    const p = await write('lineno.jsonl', [JSON.stringify(VALID), JSON.stringify(VALID), 'bad']);
    try {
      await loadGoldenSet(p);
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(GoldenSetParseError);
      expect((err as GoldenSetParseError).line).toBe(3);
    }
  });

  it('returns empty array for empty file', async () => {
    const p = await write('empty.jsonl', ['']);
    const entries = await loadGoldenSet(p);
    expect(entries).toHaveLength(0);
  });

  it('loads the real golden_set.jsonl and parses all 30 entries', async () => {
    const real = join(import.meta.dirname, '../../../scripts/eval/golden_set.jsonl');
    const entries = await loadGoldenSet(real);
    expect(entries).toHaveLength(30);
    for (const e of entries) {
      expect(GoldenEntrySchema.safeParse(e).success).toBe(true);
    }
  });
});
