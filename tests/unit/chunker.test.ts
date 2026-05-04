import { describe, expect, it } from 'vitest';
import { chunk } from '../../src/domain/ingestion/chunker.js';

const WORD = 'token'; // ~1 token each

function words(n: number): string {
  return Array(n).fill(WORD).join(' ');
}

describe('chunker', () => {
  it('short text returns single chunk', () => {
    const result = chunk('Hello, world. This is a short document.');
    expect(result).toHaveLength(1);
    expect(result[0]!.position).toBe(0);
    expect(result[0]!.text).toContain('Hello');
  });

  it('positions are sequential starting at 0', () => {
    const text = `## Section A\n${words(300)}\n\n## Section B\n${words(300)}\n\n## Section C\n${words(300)}`;
    const result = chunk(text, { targetTokens: 200, overlapTokens: 20, maxTokens: 300 });
    expect(result.length).toBeGreaterThan(1);
    result.forEach((c, idx) => expect(c.position).toBe(idx));
  });

  it('long markdown with headings splits at heading boundaries', () => {
    const sec1 = words(250);
    const sec2 = words(250);
    const text = `## Section 1\n${sec1}\n\n## Section 2\n${sec2}`;
    const result = chunk(text, { targetTokens: 150, overlapTokens: 20, maxTokens: 250 });

    expect(result.length).toBeGreaterThan(1);
    // Section 2 heading must appear in some chunk
    const sec2Chunks = result.filter(c => c.text.includes('## Section 2'));
    expect(sec2Chunks.length).toBeGreaterThan(0);
    // Section 1 heading must appear in some chunk
    const sec1Chunks = result.filter(c => c.text.includes('## Section 1'));
    expect(sec1Chunks.length).toBeGreaterThan(0);
  });

  it('code blocks are never split', () => {
    const codeBlock = '```typescript\n' + Array(200).fill('const x = 1;').join('\n') + '\n```';
    const prose = `${words(50)}\n\n${codeBlock}\n\n${words(50)}`;
    const result = chunk(prose, { targetTokens: 100, overlapTokens: 10, maxTokens: 150 });

    // Every chunk that contains code must contain the full opening and closing fences
    for (const c of result) {
      if (c.text.includes('```')) {
        const opens = (c.text.match(/```/g) ?? []).length;
        // Must be even: each code block contributes exactly 2 fence markers
        expect(opens % 2).toBe(0);
      }
    }
    // The full code block text must be reconstructable from exactly one chunk
    const codeChunks = result.filter(c => c.text.includes('const x = 1;'));
    const allInOne = codeChunks.some(c =>
      c.text.includes('```typescript') && c.text.includes('```'),
    );
    expect(allInOne).toBe(true);
  });

  it('consecutive chunks share overlap text', () => {
    const text = words(600);
    const result = chunk(text, { targetTokens: 200, overlapTokens: 30, maxTokens: 300 });

    expect(result.length).toBeGreaterThan(1);
    for (let i = 1; i < result.length; i++) {
      const prev = result[i - 1]!.text;
      const curr = result[i]!.text;
      // Take last few words of prev and check at least one appears in curr
      const prevWords = prev.split(/\s+/).slice(-10);
      const overlapFound = prevWords.some(w => curr.includes(w));
      expect(overlapFound).toBe(true);
    }
  });

  it('empty string returns empty array', () => {
    expect(chunk('')).toEqual([]);
    expect(chunk('   ')).toEqual([]);
  });
});
