import { countTokens } from 'gpt-tokenizer';

export interface ChunkOpts {
  targetTokens?: number;
  overlapTokens?: number;
  maxTokens?: number;
}

export interface Chunk {
  text: string;
  position: number;
}

const DEFAULTS = {
  targetTokens: 400,
  overlapTokens: 50,
  maxTokens: 600,
};

export function chunk(text: string, opts: ChunkOpts = {}): Chunk[] {
  const { targetTokens, overlapTokens, maxTokens } = { ...DEFAULTS, ...opts };
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (countTokens(trimmed) <= maxTokens) {
    return [{ text: trimmed, position: 0 }];
  }
  const leaves = toLeaves(trimmed, maxTokens);
  return mergeLeaves(leaves, { targetTokens, overlapTokens });
}

// Split text into finest-grained atomic units; code blocks stay intact
function toLeaves(text: string, maxTokens: number): string[] {
  const atoms: string[] = [];
  const codeRe = /```[\s\S]*?```/g;
  let pos = 0;

  for (const m of text.matchAll(codeRe)) {
    const prose = text.slice(pos, m.index);
    if (prose.trim()) atoms.push(...splitProse(prose));
    atoms.push(m[0]);
    pos = m.index! + m[0].length;
  }

  const tail = text.slice(pos);
  if (tail.trim()) atoms.push(...splitProse(tail));

  const result: string[] = [];
  for (const atom of atoms) {
    const a = atom.trim();
    if (!a) continue;
    // Code blocks are never split, even when they exceed maxTokens
    if (!a.startsWith('```') && countTokens(a) > maxTokens) {
      result.push(...hardSplit(a, maxTokens));
    } else {
      result.push(a);
    }
  }
  return result;
}

// Split prose: heading sections → paragraphs → sentences
function splitProse(text: string): string[] {
  const result: string[] = [];
  const sections = text.split(/(?=^#{1,6} )/m).filter(s => s.trim());

  for (const section of sections) {
    const paras = section.split(/\n{2,}/).filter(p => p.trim());
    for (const para of paras) {
      const sents = para.match(/[^.!?]+(?:[.!?]+(?:\s|$)|\n+|$)/g) ?? [para];
      for (const sent of sents) {
        const s = sent.trim();
        if (s) result.push(s);
      }
    }
  }
  return result;
}

// Word-level fallback for single units that exceed maxTokens
function hardSplit(text: string, maxTokens: number): string[] {
  const words = text.split(/\s+/);
  const result: string[] = [];
  let current: string[] = [];

  for (const word of words) {
    const candidate = [...current, word].join(' ');
    if (countTokens(candidate) > maxTokens && current.length > 0) {
      result.push(current.join(' '));
      current = [word];
    } else {
      current.push(word);
    }
  }
  if (current.length > 0) result.push(current.join(' '));
  return result;
}

// Greedy merge: fill to targetTokens, carry overlapTokens into next chunk
function mergeLeaves(
  leaves: string[],
  opts: { targetTokens: number; overlapTokens: number },
): Chunk[] {
  const { targetTokens, overlapTokens } = opts;
  if (leaves.length === 0) return [];

  const chunks: Chunk[] = [];
  let position = 0;
  let overlapBuf: string[] = [];
  let i = 0;

  while (i < leaves.length) {
    const current: string[] = [...overlapBuf];
    const baseLen = overlapBuf.length;

    while (i < leaves.length) {
      const next = leaves[i]!;
      const joined = [...current, next].join('\n\n');
      if (countTokens(joined) > targetTokens && current.length > baseLen) break;
      current.push(next);
      i++;
    }

    // Guard: if no new leaves were added (overlap alone exceeds target), force one
    if (current.length === baseLen && i < leaves.length) {
      current.push(leaves[i]!);
      i++;
    }

    const chunkText = current.join('\n\n').trim();
    if (chunkText) chunks.push({ text: chunkText, position: position++ });

    // Build overlap buffer from end of current chunk
    overlapBuf = [];
    for (let j = current.length - 1; j >= 0; j--) {
      overlapBuf.unshift(current[j]!);
      if (countTokens(overlapBuf.join('\n\n')) >= overlapTokens) break;
    }
  }

  return chunks;
}
