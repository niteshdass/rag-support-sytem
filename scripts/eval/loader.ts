import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { z } from 'zod';

export const GoldenEntrySchema = z.object({
  id: z.string().min(1),
  query: z.string().min(1),
  audience: z.enum(['end-user', 'agent']),
  expectedAnswerSummary: z.string().min(1),
  mustReferenceDocIds: z.array(z.string()).min(1),
  mustNotHallucinate: z.array(z.string()),
});

export type GoldenEntry = z.infer<typeof GoldenEntrySchema>;

export class GoldenSetParseError extends Error {
  constructor(
    public readonly line: number,
    public readonly raw: string,
    cause: unknown,
  ) {
    super(`golden_set.jsonl line ${line}: ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = 'GoldenSetParseError';
  }
}

export async function loadGoldenSet(filePath: string): Promise<GoldenEntry[]> {
  const entries: GoldenEntry[] = [];
  const rl = createInterface({ input: createReadStream(filePath), crlfDelay: Infinity });

  let lineNum = 0;
  for await (const raw of rl) {
    lineNum++;
    const trimmed = raw.trim();
    if (trimmed === '') continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch (err) {
      throw new GoldenSetParseError(lineNum, trimmed, err);
    }

    const result = GoldenEntrySchema.safeParse(parsed);
    if (!result.success) {
      throw new GoldenSetParseError(lineNum, trimmed, result.error.message);
    }
    entries.push(result.data);
  }

  return entries;
}
