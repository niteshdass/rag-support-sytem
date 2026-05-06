import { randomUUID } from 'node:crypto';
import type { QueryRewriter } from './queryRewriter.js';
import type { RetrieveParams, RetrievedChunk } from './retriever.js';
import type { RankedChunk } from './reranker.js';
import type { Generator, Citation } from './generator.js';
import { score as scoreConfidence } from './confidence.js';
import type { Visibility } from '../../infra/qdrant/client.js';
import { logger } from '../../observability/logger.js';
import { startTrace } from '../../observability/tracing.js';

export interface TenantContext {
  tenantId: string;
  audience: 'end-user' | 'internal-agent';
  autoResolveEnabled: boolean;
  confidenceThreshold: number;
  recentMessages?: string[];
}

export interface PipelineAnswer {
  text: string;
  citations: Citation[];
  confidence: number;
  route: 'auto' | 'draft';
  traceId: string;
  retrievedContexts: string[];
}

export type EmbedFn = (texts: string[]) => Promise<Float32Array[]>;
export type RetrieveFn = (params: RetrieveParams) => Promise<RetrievedChunk[]>;
export type RerankFn = (query: string, chunks: RetrievedChunk[], topK?: number) => Promise<RankedChunk[]>;

export class RAGPipeline {
  constructor(
    private readonly queryRewriter: QueryRewriter,
    private readonly embedFn: EmbedFn,
    private readonly retrieveFn: RetrieveFn,
    private readonly rerankFn: RerankFn,
    private readonly generator: Generator,
  ) {}

  async answer(query: string, ctx: TenantContext): Promise<PipelineAnswer> {
    const traceId = randomUUID();
    const pipelineStart = Date.now();

    const trace = startTrace({
      traceId,
      name: 'rag-pipeline',
      tenantId: ctx.tenantId,
      audience: ctx.audience,
      input: { query },
    });

    // Step 1: Rewrite
    let t = Date.now();
    const rewriteSpan = trace.span('rewrite', { query });
    const rewritten = await this.queryRewriter.rewrite(query, ctx.recentMessages);
    rewriteSpan.end({ rewrittenText: rewritten.text, intent: rewritten.intent });
    logger.info({ traceId, ms: Date.now() - t, intent: rewritten.intent }, 'pipeline: rewrite');

    // Step 2: Embed
    t = Date.now();
    const embedSpan = trace.span('embed', { text: rewritten.text });
    const vectors = await this.embedFn([rewritten.text]);
    const queryVector = Array.from(vectors[0]!);
    embedSpan.end({ dims: queryVector.length });
    logger.info({ traceId, ms: Date.now() - t, dims: queryVector.length }, 'pipeline: embed');

    // Step 3: Hybrid retrieve
    t = Date.now();
    const visibilityFilter: [Visibility, ...Visibility[]] =
      ctx.audience === 'end-user'
        ? ['customer-facing']
        : ['customer-facing', 'internal'];

    const retrieveSpan = trace.span('retrieve', { query: rewritten.text, visibility: visibilityFilter });
    const chunks = await this.retrieveFn({
      tenantId: ctx.tenantId,
      query: rewritten.text,
      queryVector,
      visibility: visibilityFilter,
      limit: 30,
    });
    retrieveSpan.end({ hits: chunks.length });
    logger.info({ traceId, ms: Date.now() - t, hits: chunks.length }, 'pipeline: retrieve');

    // Step 4: Rerank
    t = Date.now();
    const rerankSpan = trace.span('rerank', { candidateCount: chunks.length });
    const reranked = await this.rerankFn(rewritten.text, chunks);
    rerankSpan.end({ kept: reranked.length });
    logger.info({ traceId, ms: Date.now() - t, kept: reranked.length }, 'pipeline: rerank');

    // Step 5: Generate
    t = Date.now();
    const generateSpan = trace.span('generate', { contextChunks: reranked.length });
    const generated = await this.generator.generate({
      query: rewritten.text,
      context: reranked,
      history: ctx.recentMessages,
    });
    generateSpan.end({ escalate: generated.escalate, citations: generated.citations.length });
    logger.info({ traceId, ms: Date.now() - t, escalate: generated.escalate }, 'pipeline: generate');

    const confidence = scoreConfidence({
      retrievalScores: reranked.map(c => c.rerankerScore),
      citationCount: generated.citations.length,
      llmSelfReport: generated.confidence,
    });

    const route: 'auto' | 'draft' =
      ctx.autoResolveEnabled && !generated.escalate && confidence > ctx.confidenceThreshold
        ? 'auto'
        : 'draft';

    trace.end({ confidence, route, citationCount: generated.citations.length });

    logger.info(
      { traceId, ms: Date.now() - pipelineStart, confidence, route },
      'pipeline: done',
    );

    return {
      text: generated.text,
      citations: generated.citations,
      confidence,
      route,
      traceId,
      retrievedContexts: reranked.map(c => c.text),
    };
  }
}
