import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/infra/reranker/transformers.js', () => ({ score: vi.fn() }));

import * as infraReranker from '../../src/infra/reranker/transformers.js';
import { rerank } from '../../src/domain/rag/reranker.js';
import type { RetrievedChunk } from '../../src/domain/rag/retriever.js';
import type { Visibility } from '../../src/infra/qdrant/client.js';

function makeChunk(id: string, rrfScore = 0.5): RetrievedChunk {
  return {
    chunkId: id,
    documentId: `doc-${id}`,
    text: `text-${id}`,
    visibility: 'customer-facing' as Visibility,
    rrfScore,
  };
}

beforeEach(() => vi.clearAllMocks());

describe('rerank', () => {
  it('returns empty array for empty input without calling infra', async () => {
    const results = await rerank('query', []);
    expect(results).toEqual([]);
    expect(vi.mocked(infraReranker.score)).not.toHaveBeenCalled();
  });

  it('reranking changes order vs raw retrieval (RRF) order', async () => {
    // Input order A→B→C by RRF rank; reranker reverses it
    const chunks = [makeChunk('A', 0.9), makeChunk('B', 0.8), makeChunk('C', 0.7)];
    vi.mocked(infraReranker.score).mockResolvedValue([0.1, 0.5, 0.95]);

    const results = await rerank('query', chunks, 3);

    expect(results[0]!.chunkId).toBe('C');
    expect(results[1]!.chunkId).toBe('B');
    expect(results[2]!.chunkId).toBe('A');
  });

  it('top result is the most relevant in a fixture set', async () => {
    const chunks: RetrievedChunk[] = [
      { ...makeChunk('billing'), text: 'Our billing cycle runs monthly on the 1st.' },
      { ...makeChunk('export'), text: 'To export your data go to Settings > Export.' },
      { ...makeChunk('password'), text: 'To reset your password click Forgot Password on the login page.' },
    ];
    vi.mocked(infraReranker.score).mockResolvedValue([0.05, 0.08, 0.97]);

    const results = await rerank('how do I reset my password?', chunks);

    expect(results[0]!.chunkId).toBe('password');
  });

  it('adds rerankerScore to each returned chunk', async () => {
    const chunks = [makeChunk('A'), makeChunk('B')];
    vi.mocked(infraReranker.score).mockResolvedValue([0.7, 0.3]);

    const results = await rerank('query', chunks, 6);

    const a = results.find(r => r.chunkId === 'A')!;
    const b = results.find(r => r.chunkId === 'B')!;
    expect(a.rerankerScore).toBe(0.7);
    expect(b.rerankerScore).toBe(0.3);
  });

  it('respects topK parameter', async () => {
    const chunks = ['A', 'B', 'C', 'D', 'E'].map(id => makeChunk(id));
    vi.mocked(infraReranker.score).mockResolvedValue([0.5, 0.4, 0.3, 0.2, 0.1]);

    const results = await rerank('query', chunks, 3);

    expect(results).toHaveLength(3);
  });

  it('defaults topK to 6', async () => {
    const chunks = Array.from({ length: 10 }, (_, i) => makeChunk(`chunk-${i}`));
    vi.mocked(infraReranker.score).mockResolvedValue(Array.from({ length: 10 }, (_, i) => i * 0.1));

    const results = await rerank('query', chunks);

    expect(results).toHaveLength(6);
  });

  it('passes query and chunk texts to infra score in original order', async () => {
    const chunks = [makeChunk('A'), makeChunk('B')];
    vi.mocked(infraReranker.score).mockResolvedValue([0.5, 0.8]);

    await rerank('my query', chunks);

    expect(vi.mocked(infraReranker.score)).toHaveBeenCalledWith(
      'my query',
      ['text-A', 'text-B'],
    );
  });

  it('preserves all RetrievedChunk fields on ranked output', async () => {
    const chunk = makeChunk('X');
    vi.mocked(infraReranker.score).mockResolvedValue([0.9]);

    const [result] = await rerank('query', [chunk]);

    expect(result).toMatchObject({
      chunkId: 'X',
      documentId: 'doc-X',
      text: 'text-X',
      visibility: 'customer-facing',
      rrfScore: 0.5,
      rerankerScore: 0.9,
    });
  });
});
