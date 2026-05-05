import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  Generator,
  defaultFaithfulnessCheck,
  type GenerateParams,
} from '../../src/domain/rag/generator.js';
import type { LLMClient } from '../../src/infra/llm/client.js';
import type { RankedChunk } from '../../src/domain/rag/reranker.js';

function makeChunk(id: string, text: string): RankedChunk {
  return {
    chunkId: `chunk-${id}`,
    documentId: `doc-${id}`,
    text,
    visibility: 'customer-facing',
    rrfScore: 0.5,
    rerankerScore: 0.9,
  };
}

function makeLLM(factory: () => string): LLMClient {
  return { generate: vi.fn().mockImplementation(() => Promise.resolve(factory())) };
}

function validJSON(
  answerText = 'You can reset your password [1] using the forgot password link.',
  citationIndices = [1],
  confidence = 0.85,
  escalate = false,
): string {
  return JSON.stringify({ answer_text: answerText, citation_indices: citationIndices, confidence, escalate });
}

const CONTEXT: RankedChunk[] = [
  makeChunk('A', 'To reset your password, click "Forgot Password" on the login page.'),
  makeChunk('B', 'After clicking the link, you will receive an email with a reset token.'),
];

const BASE_PARAMS: GenerateParams = {
  query: 'How do I reset my password?',
  context: CONTEXT,
};

beforeEach(() => vi.clearAllMocks());

describe('Generator.generate', () => {
  describe('valid response', () => {
    it('parses result and returns citations correctly', async () => {
      const gen = new Generator(makeLLM(() => validJSON()));
      const result = await gen.generate(BASE_PARAMS);

      expect(result.escalate).toBe(false);
      expect(result.text).toContain('[1]');
      expect(result.citations).toHaveLength(1);
      expect(result.citations[0]!.chunkId).toBe('chunk-A');
      expect(result.citations[0]!.documentId).toBe('doc-A');
      expect(result.citations[0]!.score).toBe(0.9);
      expect(result.confidence).toBe(0.85);
    });

    it('snippet is first 200 chars of chunk text', async () => {
      const gen = new Generator(makeLLM(() => validJSON()));
      const result = await gen.generate(BASE_PARAMS);

      expect(result.citations[0]!.snippet).toBe(CONTEXT[0]!.text.slice(0, 200));
    });

    it('multiple citation indices map to correct chunks', async () => {
      const answer = 'Reset via forgot password [1]. You will get an email [2].';
      const gen = new Generator(makeLLM(() => validJSON(answer, [1, 2])));
      const result = await gen.generate(BASE_PARAMS);

      expect(result.citations).toHaveLength(2);
      expect(result.citations[0]!.chunkId).toBe('chunk-A');
      expect(result.citations[1]!.chunkId).toBe('chunk-B');
    });

    it('passes history to LLM in prompt', async () => {
      const llm = makeLLM(() => validJSON());
      const gen = new Generator(llm);
      await gen.generate({ ...BASE_PARAMS, history: ['User asked about billing before'] });

      const callArg = vi.mocked(llm.generate).mock.calls[0]![0];
      const userMsg = callArg.messages.find(m => m.role === 'user')!.content;
      expect(userMsg).toContain('billing before');
    });
  });

  describe('paragraph missing citation', () => {
    it('retries once then escalates when both attempts are invalid', async () => {
      const noCitation = JSON.stringify({
        answer_text: 'You can reset your password using the forgot password link.',
        citation_indices: [1],
        confidence: 0.7,
        escalate: false,
      });
      const llm = makeLLM(() => noCitation);
      const gen = new Generator(llm);
      const result = await gen.generate(BASE_PARAMS);

      expect(vi.mocked(llm.generate)).toHaveBeenCalledTimes(2);
      expect(result.escalate).toBe(true);
      expect(result.confidence).toBe(0);
      expect(result.citations).toHaveLength(0);
    });

    it('returns valid result if retry succeeds', async () => {
      let calls = 0;
      const llm: LLMClient = {
        generate: vi.fn().mockImplementation(() => {
          calls++;
          return Promise.resolve(
            calls === 1
              ? JSON.stringify({ answer_text: 'No citation here.', citation_indices: [1], confidence: 0.7, escalate: false })
              : validJSON(),
          );
        }),
      };
      const gen = new Generator(llm);
      const result = await gen.generate(BASE_PARAMS);

      expect(vi.mocked(llm.generate)).toHaveBeenCalledTimes(2);
      expect(result.escalate).toBe(false);
      expect(result.citations).toHaveLength(1);
    });
  });

  describe('out-of-range citation index', () => {
    it('escalates when cited index exceeds context length', async () => {
      const bad = JSON.stringify({
        answer_text: 'See document [5] for details.',
        citation_indices: [5],
        confidence: 0.8,
        escalate: false,
      });
      const gen = new Generator(makeLLM(() => bad));
      const result = await gen.generate(BASE_PARAMS);

      expect(result.escalate).toBe(true);
    });
  });

  describe('hallucination guard', () => {
    it('escalates when faithfulness check fails on both attempts', async () => {
      const mockFaithfulness = vi.fn().mockReturnValue(false);
      const llm = makeLLM(() => validJSON());
      const gen = new Generator(llm, mockFaithfulness);
      const result = await gen.generate(BASE_PARAMS);

      expect(vi.mocked(llm.generate)).toHaveBeenCalledTimes(2);
      expect(mockFaithfulness).toHaveBeenCalled();
      expect(result.escalate).toBe(true);
    });

    it('faithfulness check receives the cited chunk texts', async () => {
      const mockFaithfulness = vi.fn().mockReturnValue(true);
      const gen = new Generator(makeLLM(() => validJSON()), mockFaithfulness);
      await gen.generate(BASE_PARAMS);

      expect(mockFaithfulness).toHaveBeenCalledWith(
        expect.stringContaining('[1]'),
        [CONTEXT[0]!.text],
      );
    });

    it('returns success when faithfulness check passes', async () => {
      const gen = new Generator(makeLLM(() => validJSON()), () => true);
      const result = await gen.generate(BASE_PARAMS);

      expect(result.escalate).toBe(false);
    });
  });

  describe('model signals escalation', () => {
    it('returns immediately without retry when LLM outputs escalate: true', async () => {
      const response = JSON.stringify({
        answer_text: "I don't have that information.",
        citation_indices: [],
        confidence: 0.1,
        escalate: true,
      });
      const llm = makeLLM(() => response);
      const gen = new Generator(llm);
      const result = await gen.generate(BASE_PARAMS);

      expect(vi.mocked(llm.generate)).toHaveBeenCalledTimes(1);
      expect(result.escalate).toBe(true);
      expect(result.text).toBe("I don't have that information.");
      expect(result.citations).toHaveLength(0);
    });
  });

  describe('unparseable LLM output', () => {
    it('escalates after two failed parse attempts', async () => {
      const llm = makeLLM(() => 'not json at all');
      const gen = new Generator(llm);
      const result = await gen.generate(BASE_PARAMS);

      expect(vi.mocked(llm.generate)).toHaveBeenCalledTimes(2);
      expect(result.escalate).toBe(true);
    });
  });

  describe('empty context', () => {
    it('escalates immediately without calling LLM', async () => {
      const llm = makeLLM(() => validJSON());
      const gen = new Generator(llm);
      const result = await gen.generate({ ...BASE_PARAMS, context: [] });

      expect(vi.mocked(llm.generate)).not.toHaveBeenCalled();
      expect(result.escalate).toBe(true);
    });
  });
});

describe('defaultFaithfulnessCheck', () => {
  it('returns true when answer terms appear in context', () => {
    const answer = 'You can reset your password [1] using the forgot password link.';
    const contexts = ['reset your password by clicking forgot password on the login page'];
    expect(defaultFaithfulnessCheck(answer, contexts)).toBe(true);
  });

  it('returns false when answer contains terms absent from all context chunks', () => {
    const answer = 'Call our premium support hotline for immediate assistance [1].';
    const contexts = ['You can reset your password by clicking forgot password'];
    expect(defaultFaithfulnessCheck(answer, contexts)).toBe(false);
  });

  it('returns false when contexts array is empty', () => {
    expect(defaultFaithfulnessCheck('some answer [1]', [])).toBe(false);
  });

  it('ignores very short sentences', () => {
    const answer = 'Yes. [1]';
    const contexts = ['completely unrelated content about databases'];
    expect(defaultFaithfulnessCheck(answer, contexts)).toBe(true);
  });
});
