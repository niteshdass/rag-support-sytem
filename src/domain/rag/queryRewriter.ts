import type { LLMClient } from '../../infra/llm/client.js';
import { logger } from '../../observability/logger.js';

export interface RewriteResult {
  text: string;
  intent: string;
  mustHaveTerms: string[];
}

const SYSTEM_PROMPT = `You are a search query optimizer for a customer support knowledge base.

Given a user query and optional recent conversation history, produce a rewritten query as JSON.

Rules:
- Resolve pronouns ("it", "this", "that") using the conversation history
- Expand acronyms you can confidently infer from context (e.g. SSO → single sign-on)
- Add common synonyms and alternate phrasings (e.g. "people" → also include "members", "attendees", "users"; "attended" → also "attending", "registered", "total")
- Make the query self-contained and specific
- Extract must-have terms that must appear in relevant documents
- Identify the user intent in 3-5 words

Respond ONLY with valid JSON in this exact shape:
{
  "text": "<rewritten query>",
  "intent": "<3-5 word intent>",
  "mustHaveTerms": ["<term1>", "<term2>"]
}`;

export class QueryRewriter {
  constructor(private readonly llm: LLMClient) {}

  async rewrite(query: string, recentMessages?: string[]): Promise<RewriteResult> {
    const historyBlock =
      recentMessages && recentMessages.length > 0
        ? `\n\nRecent conversation:\n${recentMessages.map(m => `- ${m}`).join('\n')}`
        : '';

    const userPrompt = `Query: ${query}${historyBlock}`;

    try {
      const raw = await this.llm.generate({
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0,
        maxTokens: 256,
      });

      const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
      const parsed = JSON.parse(cleaned) as unknown;

      if (
        typeof parsed !== 'object' ||
        parsed === null ||
        typeof (parsed as Record<string, unknown>).text !== 'string' ||
        typeof (parsed as Record<string, unknown>).intent !== 'string' ||
        !Array.isArray((parsed as Record<string, unknown>).mustHaveTerms)
      ) {
        throw new Error('unexpected shape');
      }

      const result = parsed as RewriteResult;
      logger.debug({ original: query, rewritten: result.text }, 'query rewriter success');
      return result;
    } catch (err) {
      logger.warn({ query, err }, 'query rewriter fallback to raw query');
      return { text: query, intent: 'unknown', mustHaveTerms: [] };
    }
  }
}
