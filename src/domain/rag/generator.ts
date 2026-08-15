import { z } from 'zod';
import type { LLMClient } from '../../infra/llm/client.js';
import type { RankedChunk } from './reranker.js';
import { GENERATOR_SYSTEM_PROMPT } from './prompts.js';
import { logger } from '../../observability/logger.js';

export interface Citation {
  chunkId: string;
  documentId: string;
  snippet: string;
  score: number;
}

export interface GeneratorResult {
  text: string;
  citations: Citation[];
  confidence: number;
  escalate: boolean;
}

export interface GenerateParams {
  query: string;
  context: RankedChunk[];
  history?: string[] | undefined;
}

const LLMResponseSchema = z.object({
  answer_text: z.string(),
  citation_indices: z.array(z.number().int().positive()),
  confidence: z.number().min(0).max(1),
  escalate: z.boolean().default(false),
});

/**
 * Heuristic faithfulness check: verifies that meaningful terms in the answer
 * appear in the cited context. Returns false when ≥70% of content words
 * are absent from all cited chunks — a signal the model invented content.
 * Injectable so tests can substitute a precise mock.
 */
export function defaultFaithfulnessCheck(
  answerText: string,
  contextTexts: string[],
): boolean {
  if (contextTexts.length === 0) return false;

  const combined = contextTexts.join(' ').toLowerCase();
  const sentences = answerText.split(/[.!?]+/).filter(s => s.trim().length > 0);

  for (const sentence of sentences) {
    const clean = sentence.replace(/\[\d+\]/g, '').trim();
    if (clean.length < 10) continue;

    const words = clean.toLowerCase().split(/\s+/).filter(w => w.length > 4);
    if (words.length === 0) continue;

    const found = words.filter(w => combined.includes(w));
    if (found.length / words.length < 0.3) return false;
  }

  return true;
}

function buildContextBlock(context: RankedChunk[]): string {
  return context.map((chunk, i) => `[${i + 1}] ${chunk.text}`).join('\n\n');
}

function validateCitations(
  answerText: string,
  citationIndices: number[],
  contextLength: number,
): { valid: boolean; reason?: string } {
  const outOfRange = citationIndices.filter(i => i < 1 || i > contextLength);
  if (outOfRange.length > 0) {
    return { valid: false, reason: `citation indices out of range: ${outOfRange.join(', ')}` };
  }

  if (citationIndices.length === 0) {
    return { valid: false, reason: 'answer has no citations' };
  }

  return { valid: true };
}

const ESCALATION: GeneratorResult = {
  text: "I don't have that information.",
  citations: [],
  confidence: 0,
  escalate: true,
};

export class Generator {
  constructor(
    private readonly llm: LLMClient,
    private readonly faithfulnessCheck: (
      answer: string,
      contextTexts: string[],
    ) => boolean = defaultFaithfulnessCheck,
  ) {}

  async generate(params: GenerateParams): Promise<GeneratorResult> {
    if (params.context.length === 0) return ESCALATION;

    const first = await this.attempt(params);
    if (first !== null) return first;

    logger.warn({ query: params.query }, 'generator: first attempt invalid, retrying');
    const second = await this.attempt(params);
    if (second !== null) return second;

    logger.warn({ query: params.query }, 'generator: retry invalid, escalating');
    return ESCALATION;
  }

  private async attempt(params: GenerateParams): Promise<GeneratorResult | null> {
    const { query, context, history = [] } = params;

    const historyBlock =
      history.length > 0
        ? `Conversation history:\n${history.map(m => `- ${m}`).join('\n')}\n\n`
        : '';

    const userPrompt = `${historyBlock}Context:\n${buildContextBlock(context)}\n\nQuestion: ${query}`;

    let raw: string;
    try {
      raw = await this.llm.generate({
        messages: [
          { role: 'system', content: GENERATOR_SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.1,
        maxTokens: 1024,
      });
    } catch (err) {
      logger.error({ err }, 'generator: LLM call failed');
      return null;
    }

    let parsed: z.infer<typeof LLMResponseSchema>;
    try {
      // Strip markdown code fences that some models wrap around JSON
      const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
      parsed = LLMResponseSchema.parse(JSON.parse(cleaned));
    } catch (err) {
      logger.warn({ raw, err }, 'generator: failed to parse LLM response');
      return null;
    }

    if (parsed.escalate) {
      return {
        text: parsed.answer_text,
        citations: [],
        confidence: parsed.confidence,
        escalate: true,
      };
    }

    const validation = validateCitations(
      parsed.answer_text,
      parsed.citation_indices,
      context.length,
    );
    if (!validation.valid) {
      logger.warn({ reason: validation.reason }, 'generator: citation validation failed');
      return null;
    }

    const citations: Citation[] = parsed.citation_indices.map(idx => {
      const chunk = context[idx - 1]!;
      return {
        chunkId: chunk.chunkId,
        documentId: chunk.documentId,
        snippet: chunk.text.slice(0, 200),
        score: chunk.rerankerScore,
      };
    });

    const citedTexts = citations.map(c => context.find(ch => ch.chunkId === c.chunkId)?.text ?? '');

    if (!this.faithfulnessCheck(parsed.answer_text, citedTexts)) {
      logger.warn({ query }, 'generator: faithfulness check failed');
      return null;
    }

    return {
      text: parsed.answer_text,
      citations,
      confidence: parsed.confidence,
      escalate: false,
    };
  }
}
