import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RAGPipeline, type TenantContext } from '../../src/domain/rag/pipeline.js';
import type { QueryRewriter, RewriteResult } from '../../src/domain/rag/queryRewriter.js';
import type { RetrievedChunk } from '../../src/domain/rag/retriever.js';
import type { RankedChunk } from '../../src/domain/rag/reranker.js';
import type { Generator, GeneratorResult } from '../../src/domain/rag/generator.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeChunk(n: number, docSuffix: string): RetrievedChunk {
  return {
    chunkId: `chunk-${n}`,
    documentId: `doc-${docSuffix}`,
    text: `Content of document ${docSuffix}.`,
    visibility: 'customer-facing',
    rrfScore: 1 / (n + 1),
  };
}

function makeRanked(chunk: RetrievedChunk, rerankerScore: number): RankedChunk {
  return { ...chunk, rerankerScore };
}

// Five docs; doc3 contains the answer.
const DOC3_ID = 'doc-3';
const CHUNKS: RetrievedChunk[] = [1, 2, 3, 4, 5].map(n => makeChunk(n, String(n)));

// Reranker puts doc3 first with the highest score.
const RERANKED: RankedChunk[] = [
  makeRanked(CHUNKS[2]!, 0.92),  // doc3
  makeRanked(CHUNKS[0]!, 0.55),
  makeRanked(CHUNKS[3]!, 0.48),
];

const GENERATED: GeneratorResult = {
  text: 'The answer is in document 3. [1]',
  citations: [{ chunkId: 'chunk-3', documentId: DOC3_ID, snippet: 'Content of document 3.', score: 0.92 }],
  confidence: 0.85,
  escalate: false,
};

const CTX: TenantContext = {
  tenantId: 'tenant-test',
  audience: 'end-user',
  confidenceThreshold: 0.6,
};

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

function makeRewriter(override?: Partial<RewriteResult>): QueryRewriter {
  return {
    rewrite: vi.fn().mockResolvedValue({
      text: 'What is in document 3?',
      intent: 'find document content',
      mustHaveTerms: ['document', '3'],
      ...override,
    }),
  };
}

function makeEmbedFn(): (texts: string[]) => Promise<Float32Array[]> {
  return vi.fn().mockResolvedValue([new Float32Array(384).fill(0.1)]);
}

function makeRetrieveFn(chunks = CHUNKS): (params: unknown) => Promise<RetrievedChunk[]> {
  return vi.fn().mockResolvedValue(chunks);
}

function makeRerankFn(ranked = RERANKED): (query: string, chunks: RetrievedChunk[]) => Promise<RankedChunk[]> {
  return vi.fn().mockResolvedValue(ranked);
}

function makeGenerator(result = GENERATED): Generator {
  return { generate: vi.fn().mockResolvedValue(result) } as unknown as Generator;
}

beforeEach(() => vi.clearAllMocks());

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RAGPipeline.answer', () => {
  describe('golden path — doc3 cited, confidence > 0.5', () => {
    it('cites doc3 in the answer', async () => {
      const pipeline = new RAGPipeline(
        makeRewriter(),
        makeEmbedFn(),
        makeRetrieveFn(),
        makeRerankFn(),
        makeGenerator(),
      );

      const answer = await pipeline.answer('What is in document 3?', CTX);

      expect(answer.citations.some(c => c.documentId === DOC3_ID)).toBe(true);
    });

    it('confidence > 0.5', async () => {
      const pipeline = new RAGPipeline(
        makeRewriter(),
        makeEmbedFn(),
        makeRetrieveFn(),
        makeRerankFn(),
        makeGenerator(),
      );

      const answer = await pipeline.answer('What is in document 3?', CTX);

      expect(answer.confidence).toBeGreaterThan(0.5);
    });

    it('returns a traceId', async () => {
      const pipeline = new RAGPipeline(
        makeRewriter(),
        makeEmbedFn(),
        makeRetrieveFn(),
        makeRerankFn(),
        makeGenerator(),
      );

      const answer = await pipeline.answer('What is in document 3?', CTX);

      expect(typeof answer.traceId).toBe('string');
      expect(answer.traceId.length).toBeGreaterThan(0);
    });
  });

  describe('step wiring', () => {
    it('passes rewritten query to retrieve and rerank', async () => {
      const rerankFn = makeRerankFn();
      const retrieveFn = makeRetrieveFn();
      const pipeline = new RAGPipeline(
        makeRewriter({ text: 'rewritten query text' }),
        makeEmbedFn(),
        retrieveFn,
        rerankFn,
        makeGenerator(),
      );

      await pipeline.answer('original query', CTX);

      expect(vi.mocked(retrieveFn)).toHaveBeenCalledWith(
        expect.objectContaining({ query: 'rewritten query text' }),
      );
      expect(vi.mocked(rerankFn)).toHaveBeenCalledWith('rewritten query text', CHUNKS);
    });

    it('passes embed vector to retrieve', async () => {
      const vec = new Float32Array(384).fill(0.5);
      const embedFn = vi.fn().mockResolvedValue([vec]);
      const retrieveFn = makeRetrieveFn();
      const pipeline = new RAGPipeline(
        makeRewriter(),
        embedFn,
        retrieveFn,
        makeRerankFn(),
        makeGenerator(),
      );

      await pipeline.answer('query', CTX);

      expect(vi.mocked(retrieveFn)).toHaveBeenCalledWith(
        expect.objectContaining({ queryVector: Array.from(vec) }),
      );
    });

    it('passes reranked context to generator', async () => {
      const generator = makeGenerator();
      const pipeline = new RAGPipeline(
        makeRewriter(),
        makeEmbedFn(),
        makeRetrieveFn(),
        makeRerankFn(),
        generator,
      );

      await pipeline.answer('query', CTX);

      expect(vi.mocked(generator.generate)).toHaveBeenCalledWith(
        expect.objectContaining({ context: RERANKED }),
      );
    });
  });

  describe('visibility filtering', () => {
    it('end-user audience restricts to customer-facing only', async () => {
      const retrieveFn = makeRetrieveFn();
      const pipeline = new RAGPipeline(
        makeRewriter(),
        makeEmbedFn(),
        retrieveFn,
        makeRerankFn(),
        makeGenerator(),
      );

      await pipeline.answer('query', { ...CTX, audience: 'end-user' });

      expect(vi.mocked(retrieveFn)).toHaveBeenCalledWith(
        expect.objectContaining({ visibility: ['customer-facing'] }),
      );
    });

    it('internal-agent audience allows customer-facing and internal', async () => {
      const retrieveFn = makeRetrieveFn();
      const pipeline = new RAGPipeline(
        makeRewriter(),
        makeEmbedFn(),
        retrieveFn,
        makeRerankFn(),
        makeGenerator(),
      );

      await pipeline.answer('query', { ...CTX, audience: 'internal-agent' });

      expect(vi.mocked(retrieveFn)).toHaveBeenCalledWith(
        expect.objectContaining({ visibility: ['customer-facing', 'internal'] }),
      );
    });
  });

  describe('routing', () => {
    it('routes to auto when confidence exceeds threshold', async () => {
      const pipeline = new RAGPipeline(
        makeRewriter(),
        makeEmbedFn(),
        makeRetrieveFn(),
        makeRerankFn(),
        makeGenerator({ ...GENERATED, confidence: 0.95 }),
      );

      const answer = await pipeline.answer('query', { ...CTX, confidenceThreshold: 0.6 });

      expect(answer.route).toBe('auto');
    });

    it('routes to draft when confidence below threshold', async () => {
      const pipeline = new RAGPipeline(
        makeRewriter(),
        makeEmbedFn(),
        makeRetrieveFn(),
        makeRerankFn(),
        makeGenerator({ ...GENERATED, confidence: 0.2, citations: [] }),
      );

      const answer = await pipeline.answer('query', { ...CTX, confidenceThreshold: 0.8 });

      expect(answer.route).toBe('draft');
    });

    it('routes to draft when generator escalates regardless of score', async () => {
      const pipeline = new RAGPipeline(
        makeRewriter(),
        makeEmbedFn(),
        makeRetrieveFn(),
        makeRerankFn(),
        makeGenerator({ text: "I don't know.", citations: [], confidence: 0, escalate: true }),
      );

      const answer = await pipeline.answer('query', { ...CTX, confidenceThreshold: 0.1 });

      expect(answer.route).toBe('draft');
    });
  });

  describe('tenantId enforcement', () => {
    it('passes tenantId to retrieve', async () => {
      const retrieveFn = makeRetrieveFn();
      const pipeline = new RAGPipeline(
        makeRewriter(),
        makeEmbedFn(),
        retrieveFn,
        makeRerankFn(),
        makeGenerator(),
      );

      await pipeline.answer('query', { ...CTX, tenantId: 'tenant-abc' });

      expect(vi.mocked(retrieveFn)).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: 'tenant-abc' }),
      );
    });
  });
});
