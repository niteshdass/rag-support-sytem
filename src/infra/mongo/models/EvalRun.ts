import mongoose, { Schema, type Document, type Model } from 'mongoose';

export interface RagasEntryMetrics {
  faithfulness?: number;
  answerRelevancy?: number;
  contextPrecision?: number;
}

export interface RagasAggregateMetrics {
  avgFaithfulness?: number;
  avgAnswerRelevancy?: number;
  avgContextPrecision?: number;
}

export interface EvalEntryResult {
  id: string;
  query: string;
  response: string;
  citedDocIds: string[];
  retrievedContexts: string[];
  mustReferenceDocIds: string[];
  mustNotHallucinate: string[];
  citationRecall: number;
  hallucinationFlag: boolean;
  hallucinationMatches: string[];
  confidence: number;
  route: 'auto' | 'draft';
  latencyMs: number;
  traceId: string;
  ragasMetrics?: RagasEntryMetrics;
}

export interface AggregateMetrics {
  totalEntries: number;
  avgCitationRecall: number;
  hallucinationRate: number;
  avgConfidence: number;
  avgLatencyMs: number;
  autoResolveRate: number;
  ragas?: RagasAggregateMetrics;
}

export interface EvalRun {
  goldenSetVersion: string;
  commitSha: string;
  tenantId: string;
  results: EvalEntryResult[];
  metrics: AggregateMetrics;
}

export interface EvalRunDocument extends EvalRun, Document {}

const ragasEntryMetricsSchema = new Schema<RagasEntryMetrics>(
  {
    faithfulness: { type: Number },
    answerRelevancy: { type: Number },
    contextPrecision: { type: Number },
  },
  { _id: false },
);

const ragasAggregateMetricsSchema = new Schema<RagasAggregateMetrics>(
  {
    avgFaithfulness: { type: Number },
    avgAnswerRelevancy: { type: Number },
    avgContextPrecision: { type: Number },
  },
  { _id: false },
);

const entryResultSchema = new Schema<EvalEntryResult>(
  {
    id: { type: String, required: true },
    query: { type: String, required: true },
    response: { type: String, required: true },
    citedDocIds: { type: [String], required: true },
    retrievedContexts: { type: [String], required: true },
    mustReferenceDocIds: { type: [String], required: true },
    mustNotHallucinate: { type: [String], required: true },
    citationRecall: { type: Number, required: true },
    hallucinationFlag: { type: Boolean, required: true },
    hallucinationMatches: { type: [String], required: true },
    confidence: { type: Number, required: true },
    route: { type: String, enum: ['auto', 'draft'], required: true },
    latencyMs: { type: Number, required: true },
    traceId: { type: String, required: true },
    ragasMetrics: { type: ragasEntryMetricsSchema },
  },
  { _id: false },
);

const aggregateMetricsSchema = new Schema<AggregateMetrics>(
  {
    totalEntries: { type: Number, required: true },
    avgCitationRecall: { type: Number, required: true },
    hallucinationRate: { type: Number, required: true },
    avgConfidence: { type: Number, required: true },
    avgLatencyMs: { type: Number, required: true },
    autoResolveRate: { type: Number, required: true },
    ragas: { type: ragasAggregateMetricsSchema },
  },
  { _id: false },
);

const evalRunSchema = new Schema<EvalRunDocument>(
  {
    goldenSetVersion: { type: String, required: true },
    commitSha: { type: String, required: true },
    tenantId: { type: String, required: true },
    results: { type: [entryResultSchema], required: true },
    metrics: { type: aggregateMetricsSchema, required: true },
  },
  { timestamps: true },
);

evalRunSchema.index({ tenantId: 1, createdAt: -1 });
evalRunSchema.index({ goldenSetVersion: 1 });

export const EvalRunModel: Model<EvalRunDocument> =
  mongoose.models['EvalRun'] ?? mongoose.model<EvalRunDocument>('EvalRun', evalRunSchema);
