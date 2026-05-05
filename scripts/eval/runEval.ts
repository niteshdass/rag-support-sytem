import 'dotenv/config';
import { execSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { connect, disconnect } from '../../src/infra/mongo/client.js';
import { TenantModel } from '../../src/infra/mongo/models/Tenant.js';
import {
  EvalRunModel,
  type EvalEntryResult,
  type RagasAggregateMetrics,
} from '../../src/infra/mongo/models/EvalRun.js';
import { getPipeline } from '../../src/domain/rag/pipeline.factory.js';
import { loadGoldenSet } from './loader.js';

const GOLDEN_SET_PATH = resolve(import.meta.dirname, 'golden_set.jsonl');
const RAGAS_SCRIPT = resolve(import.meta.dirname, 'ragas_eval.py');
const TENANT_SLUG = 'acme-saas';
const CONCURRENCY = 3;
const USE_RAGAS = process.argv.includes('--ragas');

function getCommitSha(): string {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

function getGoldenSetVersion(filePath: string): string {
  const contents = readFileSync(filePath, 'utf8');
  return createHash('sha256').update(contents).digest('hex').slice(0, 12);
}

function computeCitationRecall(citedDocIds: string[], mustReferenceDocIds: string[]): number {
  if (mustReferenceDocIds.length === 0) return 1;
  const cited = new Set(citedDocIds);
  const hits = mustReferenceDocIds.filter(id => cited.has(id)).length;
  return hits / mustReferenceDocIds.length;
}

function computeHallucinationMatches(response: string, mustNotHallucinate: string[]): string[] {
  const lower = response.toLowerCase();
  return mustNotHallucinate.filter(term => lower.includes(term.toLowerCase()));
}

function avg(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

interface RagasOutput {
  per_item: Array<{
    faithfulness?: number | null;
    answer_relevancy?: number | null;
    context_precision?: number | null;
  }>;
  aggregates: {
    faithfulness?: number;
    answer_relevancy?: number;
    context_precision?: number;
  };
}

function runRagasEval(results: EvalEntryResult[], goldenEntries: Awaited<ReturnType<typeof loadGoldenSet>>): RagasOutput | null {
  const input = results.map((r, i) => ({
    query: r.query,
    answer: r.response,
    contexts: r.retrievedContexts,
    reference: goldenEntries[i]?.expectedAnswerSummary ?? undefined,
  }));

  const proc = spawnSync('python3', [RAGAS_SCRIPT], {
    input: JSON.stringify(input),
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });

  if (proc.error) {
    process.stderr.write(`ragas_eval spawn error: ${proc.error.message}\n`);
    return null;
  }
  if (proc.status !== 0) {
    process.stderr.write(`ragas_eval exited ${proc.status}: ${proc.stderr}\n`);
    return null;
  }

  try {
    return JSON.parse(proc.stdout) as RagasOutput;
  } catch {
    process.stderr.write(`ragas_eval: failed to parse output: ${proc.stdout}\n`);
    return null;
  }
}

function printSummaryTable(results: EvalEntryResult[]): void {
  const hasRagas = results.some(r => r.ragasMetrics != null);
  const colWidths = { id: 10, citRec: 8, halluc: 8, conf: 7, route: 6, ms: 7, faith: 7, rel: 7, prec: 7 };
  const sepLen = hasRagas ? 80 : 56;
  const sep = '-'.repeat(sepLen);

  const headerParts = [
    'ID'.padEnd(colWidths.id),
    'CitRec'.padStart(colWidths.citRec),
    'Halluc'.padStart(colWidths.halluc),
    'Conf'.padStart(colWidths.conf),
    'Route'.padStart(colWidths.route),
    'Ms'.padStart(colWidths.ms),
  ];
  if (hasRagas) {
    headerParts.push('Faith'.padStart(colWidths.faith), 'Rel'.padStart(colWidths.rel), 'Prec'.padStart(colWidths.prec));
  }

  process.stdout.write(`\n${sep}\n${headerParts.join(' | ')}\n${sep}\n`);

  for (const r of results) {
    const rowParts = [
      r.id.padEnd(colWidths.id),
      r.citationRecall.toFixed(2).padStart(colWidths.citRec),
      (r.hallucinationFlag ? 'YES' : 'no').padStart(colWidths.halluc),
      r.confidence.toFixed(2).padStart(colWidths.conf),
      r.route.padStart(colWidths.route),
      r.latencyMs.toString().padStart(colWidths.ms),
    ];
    if (hasRagas) {
      const m = r.ragasMetrics;
      rowParts.push(
        (m?.faithfulness != null ? m.faithfulness.toFixed(2) : '-').padStart(colWidths.faith),
        (m?.answerRelevancy != null ? m.answerRelevancy.toFixed(2) : '-').padStart(colWidths.rel),
        (m?.contextPrecision != null ? m.contextPrecision.toFixed(2) : '-').padStart(colWidths.prec),
      );
    }
    process.stdout.write(rowParts.join(' | ') + '\n');
  }

  process.stdout.write(sep + '\n');
}

function printAggregates(metrics: ReturnType<typeof computeMetrics>): void {
  process.stdout.write('\nAggregate metrics:\n');
  process.stdout.write(`  entries:           ${metrics.totalEntries}\n`);
  process.stdout.write(`  avgCitationRecall: ${metrics.avgCitationRecall.toFixed(3)}\n`);
  process.stdout.write(`  hallucinationRate: ${metrics.hallucinationRate.toFixed(3)}\n`);
  process.stdout.write(`  avgConfidence:     ${metrics.avgConfidence.toFixed(3)}\n`);
  process.stdout.write(`  avgLatencyMs:      ${metrics.avgLatencyMs.toFixed(0)}\n`);
  process.stdout.write(`  autoResolveRate:   ${metrics.autoResolveRate.toFixed(3)}\n`);
  if (metrics.ragas) {
    const r = metrics.ragas;
    process.stdout.write('\n  Ragas metrics:\n');
    if (r.avgFaithfulness != null) process.stdout.write(`    faithfulness:     ${r.avgFaithfulness.toFixed(3)}\n`);
    if (r.avgAnswerRelevancy != null) process.stdout.write(`    answerRelevancy:  ${r.avgAnswerRelevancy.toFixed(3)}\n`);
    if (r.avgContextPrecision != null) process.stdout.write(`    contextPrecision: ${r.avgContextPrecision.toFixed(3)}\n`);
  }
  process.stdout.write('\n');
}

function computeMetrics(results: EvalEntryResult[], ragasAgg?: RagasOutput['aggregates']) {
  const ragas: RagasAggregateMetrics | undefined = ragasAgg && Object.keys(ragasAgg).length > 0
    ? {
        avgFaithfulness: ragasAgg.faithfulness,
        avgAnswerRelevancy: ragasAgg.answer_relevancy,
        avgContextPrecision: ragasAgg.context_precision,
      }
    : undefined;

  return {
    totalEntries: results.length,
    avgCitationRecall: avg(results.map(r => r.citationRecall)),
    hallucinationRate: results.filter(r => r.hallucinationFlag).length / results.length,
    avgConfidence: avg(results.map(r => r.confidence)),
    avgLatencyMs: avg(results.map(r => r.latencyMs)),
    autoResolveRate: results.filter(r => r.route === 'auto').length / results.length,
    ragas,
  };
}

async function runBatch(
  entries: Awaited<ReturnType<typeof loadGoldenSet>>,
  pipeline: ReturnType<typeof getPipeline>,
  tenantId: string,
  confidenceThreshold: number,
): Promise<EvalEntryResult[]> {
  const results: EvalEntryResult[] = [];

  for (let i = 0; i < entries.length; i += CONCURRENCY) {
    const batch = entries.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(
      batch.map(async (entry) => {
        const audience = entry.audience === 'agent' ? 'internal-agent' as const : 'end-user' as const;
        const start = Date.now();
        const answer = await pipeline.answer(entry.query, {
          tenantId,
          audience,
          confidenceThreshold,
        });
        const latencyMs = Date.now() - start;

        const citedDocIds = answer.citations.map(c => c.documentId);
        const citationRecall = computeCitationRecall(citedDocIds, entry.mustReferenceDocIds);
        const hallucinationMatches = computeHallucinationMatches(answer.text, entry.mustNotHallucinate);

        process.stdout.write(`  [${entry.id}] recall=${citationRecall.toFixed(2)} halluc=${hallucinationMatches.length > 0} ${latencyMs}ms\n`);

        return {
          id: entry.id,
          query: entry.query,
          response: answer.text,
          citedDocIds,
          retrievedContexts: answer.retrievedContexts,
          mustReferenceDocIds: entry.mustReferenceDocIds,
          mustNotHallucinate: entry.mustNotHallucinate,
          citationRecall,
          hallucinationFlag: hallucinationMatches.length > 0,
          hallucinationMatches,
          confidence: answer.confidence,
          route: answer.route,
          latencyMs,
          traceId: answer.traceId,
        } satisfies EvalEntryResult;
      }),
    );
    results.push(...batchResults);
  }

  return results;
}

async function main(): Promise<void> {
  await connect();

  const tenant = await TenantModel.findOne({ slug: TENANT_SLUG }).lean();
  if (!tenant) {
    process.stderr.write(`Tenant '${TENANT_SLUG}' not found. Run 'npm run seed' first.\n`);
    process.exit(1);
  }

  const tenantId = String(tenant._id);
  const confidenceThreshold = tenant.confidenceThreshold;
  const goldenSetVersion = getGoldenSetVersion(GOLDEN_SET_PATH);
  const commitSha = getCommitSha();

  process.stdout.write(`\nEval run — tenant: ${TENANT_SLUG} (${tenantId})\n`);
  process.stdout.write(`  golden set version: ${goldenSetVersion}\n`);
  process.stdout.write(`  commit: ${commitSha}\n`);
  process.stdout.write(`  ragas: ${USE_RAGAS ? 'enabled' : 'disabled (pass --ragas to enable)'}\n`);

  const entries = await loadGoldenSet(GOLDEN_SET_PATH);
  process.stdout.write(`  entries: ${entries.length}\n\nRunning pipeline...\n`);

  const pipeline = getPipeline();
  const results = await runBatch(entries, pipeline, tenantId, confidenceThreshold);

  let ragasOutput: RagasOutput | null = null;
  if (USE_RAGAS) {
    process.stdout.write('\nRunning Ragas evaluation (this may take a minute)...\n');
    ragasOutput = runRagasEval(results, entries);
    if (ragasOutput) {
      // Merge per-item ragas metrics into results
      ragasOutput.per_item.forEach((item, i) => {
        const r = results[i];
        if (!r) return;
        r.ragasMetrics = {
          faithfulness: item.faithfulness ?? undefined,
          answerRelevancy: item.answer_relevancy ?? undefined,
          contextPrecision: item.context_precision ?? undefined,
        };
      });
      process.stdout.write('Ragas evaluation complete.\n');
    } else {
      process.stdout.write('Ragas evaluation failed (see stderr). Continuing without ragas metrics.\n');
    }
  }

  const metrics = computeMetrics(results, ragasOutput?.aggregates);

  printSummaryTable(results);
  printAggregates(metrics);

  await EvalRunModel.create({
    goldenSetVersion,
    commitSha,
    tenantId,
    results,
    metrics,
  });

  process.stdout.write(`Eval run saved to MongoDB.\n`);

  await disconnect();
}

main().catch((err) => {
  process.stderr.write(`Eval failed: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
