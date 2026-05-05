import { describe, expect, it, vi } from 'vitest';
import { QueryRewriter } from '../../../../src/domain/rag/queryRewriter.js';
import type { LLMClient } from '../../../../src/infra/llm/client.js';

function makeLLM(response: string): LLMClient {
  return { generate: vi.fn().mockResolvedValue(response) };
}

describe('QueryRewriter', () => {
  it('returns rewritten text incorporating conversation history', async () => {
    const llm = makeLLM(
      JSON.stringify({
        text: 'What is the latest status of the SSO bug?',
        intent: 'SSO bug status',
        mustHaveTerms: ['SSO', 'bug'],
      }),
    );
    const rewriter = new QueryRewriter(llm);

    const result = await rewriter.rewrite("what's the latest", ['we discussed the SSO bug']);

    expect(result.text.toLowerCase()).toContain('sso');
    expect(result.intent).toBeTruthy();
    expect(Array.isArray(result.mustHaveTerms)).toBe(true);
  });

  it('expands acronyms in rewritten query', async () => {
    const llm = makeLLM(
      JSON.stringify({
        text: 'How do I configure single sign-on (SSO) with Okta?',
        intent: 'configure SSO Okta',
        mustHaveTerms: ['single sign-on', 'Okta'],
      }),
    );
    const rewriter = new QueryRewriter(llm);

    const result = await rewriter.rewrite('how do I set up SSO with Okta?');

    expect(result.text.toLowerCase()).toContain('single sign-on');
    expect(result.mustHaveTerms).toContain('Okta');
  });

  it('falls back to raw query on JSON parse failure without throwing', async () => {
    const llm = makeLLM('not valid json at all');
    const rewriter = new QueryRewriter(llm);

    const result = await rewriter.rewrite('how do I reset my password?');

    expect(result.text).toBe('how do I reset my password?');
    expect(result.intent).toBe('unknown');
    expect(result.mustHaveTerms).toEqual([]);
  });

  it('falls back to raw query on unexpected JSON shape without throwing', async () => {
    const llm = makeLLM(JSON.stringify({ wrong: 'shape' }));
    const rewriter = new QueryRewriter(llm);

    const result = await rewriter.rewrite('billing question');

    expect(result.text).toBe('billing question');
    expect(result.mustHaveTerms).toEqual([]);
  });

  it('falls back to raw query when LLM throws', async () => {
    const llm: LLMClient = { generate: vi.fn().mockRejectedValue(new Error('timeout')) };
    const rewriter = new QueryRewriter(llm);

    const result = await rewriter.rewrite('export data question');

    expect(result.text).toBe('export data question');
    expect(result.intent).toBe('unknown');
  });

  it('passes history as part of the user prompt', async () => {
    const llm = makeLLM(
      JSON.stringify({ text: 'rewritten', intent: 'test intent', mustHaveTerms: [] }),
    );
    const rewriter = new QueryRewriter(llm);

    await rewriter.rewrite('follow-up question', ['first message', 'second message']);

    const call = (llm.generate as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const userMsg = call.messages.find((m: { role: string }) => m.role === 'user');
    expect(userMsg.content).toContain('first message');
    expect(userMsg.content).toContain('second message');
  });

  it('omits history block when no recent messages provided', async () => {
    const llm = makeLLM(
      JSON.stringify({ text: 'rewritten', intent: 'test', mustHaveTerms: [] }),
    );
    const rewriter = new QueryRewriter(llm);

    await rewriter.rewrite('standalone question');

    const call = (llm.generate as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const userMsg = call.messages.find((m: { role: string }) => m.role === 'user');
    expect(userMsg.content).not.toContain('Recent conversation');
  });
});
