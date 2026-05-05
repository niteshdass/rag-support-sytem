import { randomUUID } from 'node:crypto';
import type { QueryRewriter } from './queryRewriter.js';
import type { RetrieveParams, RetrievedChunk } from './retriever.js';
import type { RankedChunk } from './reranker.js';
import type { Generator, Citation } from './generator.js';
import { score as scoreConfidence } from './confidence.js';
import type { Visibility } from '../../infra/qdrant/client.js';
import { logger } from '../../observability/logger.js';

export interface TenantContext {
  tenantId: string;
  audience: 'end-user' | 'internal-agent';
  confidenceThreshold: number;
  recentMessages?: string[];
}

export interface PipelineAnswer {
  text: string;
  citations: Citation[];
  confidence: number;
  route: 'auto' | 'draft';
  traceId: string;
}

export type EmbedFn = (texts: string[]) => Promise<Float32Array[]>;
export type RetrieveFn = (params: RetrieveParams) => Promise<RetrievedChunk[]>;
export type RerankFn = (query: string, chunks: RetrievedChunk[], topK?: number) => Promise<RankedChunk[]>;

function noopTrace(event: Record<string, unknown>): void {
  logger.debug({ langfuse: event }, 'pipeline: trace noop');
}

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

    // Step 1: Rewrite
    let t = Date.now();
    const rewritten = await this.queryRewriter.rewrite(query, ctx.recentMessages);
    logger.info({ traceId, ms: Date.now() - t, intent: rewritten.intent }, 'pipeline: rewrite');

    // Step 2: Embed
    t = Date.now();
    const vectors = await this.embedFn([rewritten.text]);
    const queryVector = Array.from(vectors[0]!);
    logger.info({ traceId, ms: Date.now() - t, dims: queryVector.length }, 'pipeline: embed');

    // Step 3: Hybrid retrieve
    t = Date.now();
    const visibilityFilter: [Visibility, ...Visibility[]] =
      ctx.audience === 'end-user'
        ? ['customer-facing']
        : ['customer-facing', 'internal'];

    const chunks = await this.retrieveFn({
      tenantId: ctx.tenantId,
      query: rewritten.text,
      queryVector,
      visibility: visibilityFilter,
      limit: 30,
    });
    logger.info({ traceId, ms: Date.now() - t, hits: chunks.length }, 'pipeline: retrieve');

    // Step 4: Rerank
    t = Date.now();
    const reranked = await this.rerankFn(rewritten.text, chunks);
    logger.info({ traceId, ms: Date.now() - t, kept: reranked.length }, 'pipeline: rerank');

    // Step 5: Generate
    t = Date.now();
    const generated = await this.generator.generate({
      query: rewritten.text,
      context: reranked,
      history: ctx.recentMessages,
    });
    logger.info({ traceId, ms: Date.now() - t, escalate: generated.escalate }, 'pipeline: generate');

    const confidence = scoreConfidence({
      retrievalScores: reranked.map(c => c.rerankerScore),
      citationCount: generated.citations.length,
      llmSelfReport: generated.confidence,
    });

    const route: 'auto' | 'draft' =
      !generated.escalate && confidence > ctx.confidenceThreshold ? 'auto' : 'draft';

    logger.info(
      { traceId, ms: Date.now() - pipelineStart, confidence, route },
      'pipeline: done',
    );

    noopTrace({ traceId, query, rewrittenText: rewritten.text, confidence, route, citations: generated.citations.length });

    return { text: generated.text, citations: generated.citations, confidence, route, traceId };
  }
}
