const CHARS_PER_TOKEN = 4;
const MIN_TOKEN_COUNT = 100;

export interface ChunkOptions {
  chunkSize: number;
  overlap: number;
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

function splitBySentences(text: string, maxChars: number, overlapChars: number): string[] {
  const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
  const parts: string[] = [];
  let current = '';

  for (const sentence of sentences) {
    if (current.length > 0 && current.length + sentence.length + 1 > maxChars) {
      parts.push(current.trim());
      current = current.slice(Math.max(0, current.length - overlapChars)) + ' ' + sentence;
    } else {
      current = current ? current + ' ' + sentence : sentence;
    }
  }
  if (current.trim()) parts.push(current.trim());

  const result: string[] = [];
  for (const part of parts) {
    if (part.length <= maxChars) {
      result.push(part);
      continue;
    }
    let remaining = part;
    while (remaining.length > maxChars) {
      result.push(remaining.slice(0, maxChars));
      remaining = remaining.slice(maxChars - overlapChars);
    }
    if (remaining) result.push(remaining);
  }

  return result;
}

export function chunkText(content: string, options: ChunkOptions): string[] {
  const maxChars = options.chunkSize * CHARS_PER_TOKEN;
  const overlapChars = options.overlap * CHARS_PER_TOKEN;

  const paragraphs = content
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let current = '';

  for (const paragraph of paragraphs) {
    if (paragraph.length > maxChars) {
      if (current.trim()) {
        chunks.push(current.trim());
        current = '';
      }
      const parts = splitBySentences(paragraph, maxChars, overlapChars);
      for (const part of parts) {
        if (part.trim()) chunks.push(part.trim());
      }
      continue;
    }

    const wouldBeSize = current ? current.length + 2 + paragraph.length : paragraph.length;

    if (wouldBeSize > maxChars && current) {
      chunks.push(current.trim());
      const overlapText = current.slice(Math.max(0, current.length - overlapChars));
      current = overlapText ? overlapText + '\n\n' + paragraph : paragraph;
    } else {
      current = current ? current + '\n\n' + paragraph : paragraph;
    }
  }

  if (current.trim()) {
    chunks.push(current.trim());
  }

  return chunks.filter((c) => estimateTokens(c) >= MIN_TOKEN_COUNT);
}
