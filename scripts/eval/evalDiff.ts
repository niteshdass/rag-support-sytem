import 'dotenv/config';
import { connect, disconnect } from '../../src/infra/mongo/client.js';
import { EvalRunModel, type AggregateMetrics } from '../../src/infra/mongo/models/EvalRun.js';

const baselineSha = process.argv[2];
if (!baselineSha) {
  process.stderr.write('Usage: tsx scripts/eval/evalDiff.ts <commitSha>\n');
  process.exit(1);
}

type MetricKey = keyof Omit<AggregateMetrics, 'ragas' | 'totalEntries'>;

const METRIC_KEYS: MetricKey[] = [
  'avgCitationRecall',
  'hallucinationRate',
  'avgConfidence',
  'avgLatencyMs',
  'autoResolveRate',
];

const METRIC_LABELS: Record<MetricKey, string> = {
  avgCitationRecall: 'Avg Citation Recall',
  hallucinationRate: 'Hallucination Rate',
  avgConfidence: 'Avg Confidence',
  avgLatencyMs: 'Avg Latency (ms)',
  autoResolveRate: 'Auto-Resolve Rate',
};

function fmtVal(key: MetricKey, val: number): string {
  return key === 'avgLatencyMs' ? val.toFixed(0) : val.toFixed(3);
}

function fmtDelta(key: MetricKey, delta: number): string {
  const s = key === 'avgLatencyMs' ? delta.toFixed(0) : delta.toFixed(3);
  const sign = delta > 0 ? '+' : '';
  return `${sign}${s}`;
}

function isImprovement(key: MetricKey, delta: number): boolean {
  if (key === 'hallucinationRate' || key === 'avgLatencyMs') return delta < 0;
  return delta > 0;
}

async function main(): Promise<void> {
  await connect();

  const latest = await EvalRunModel.findOne().sort({ createdAt: -1 }).lean();
  if (!latest) {
    process.stderr.write('No eval runs found. Run `npm run eval` first.\n');
    process.exit(1);
  }

  const baseline = await EvalRunModel.findOne({ commitSha: baselineSha }).lean();
  if (!baseline) {
    process.stderr.write(`No eval run found for commitSha '${baselineSha}'.\n`);
    const recent = await EvalRunModel.find().sort({ createdAt: -1 }).limit(5).lean();
    if (recent.length > 0) {
      process.stderr.write('Recent runs:\n');
      for (const r of recent) {
        process.stderr.write(`  ${r.commitSha}  ${new Date(r.createdAt as Date).toISOString()}\n`);
      }
    }
    process.exit(1);
  }

  const sep = '-'.repeat(66);
  process.stdout.write('\nEval diff\n');
  process.stdout.write(`  baseline: ${baseline.commitSha}  (${new Date(baseline.createdAt as Date).toISOString()})\n`);
  process.stdout.write(`  head:     ${latest.commitSha}  (${new Date(latest.createdAt as Date).toISOString()})\n\n`);

  process.stdout.write(sep + '\n');
  process.stdout.write(
    'Metric'.padEnd(24) +
    'Baseline'.padStart(12) +
    'Head'.padStart(12) +
    'Delta'.padStart(12) +
    '  \n',
  );
  process.stdout.write(sep + '\n');

  for (const key of METRIC_KEYS) {
    const bVal = baseline.metrics[key] as number;
    const hVal = latest.metrics[key] as number;
    const delta = hVal - bVal;
    const arrow = delta === 0 ? ' ' : isImprovement(key, delta) ? '▲' : '▼';
    process.stdout.write(
      METRIC_LABELS[key].padEnd(24) +
      fmtVal(key, bVal).padStart(12) +
      fmtVal(key, hVal).padStart(12) +
      fmtDelta(key, delta).padStart(11) +
      ` ${arrow}\n`,
    );
  }

  process.stdout.write(sep + '\n');

  const bRagas = baseline.metrics.ragas;
  const hRagas = latest.metrics.ragas;
  if (bRagas || hRagas) {
    process.stdout.write('\nRagas metrics:\n');
    const ragasKeys: Array<[string, number | undefined, number | undefined]> = [
      ['Faithfulness', bRagas?.avgFaithfulness, hRagas?.avgFaithfulness],
      ['Answer Relevancy', bRagas?.avgAnswerRelevancy, hRagas?.avgAnswerRelevancy],
      ['Context Precision', bRagas?.avgContextPrecision, hRagas?.avgContextPrecision],
    ];
    for (const [label, bv, hv] of ragasKeys) {
      const bStr = bv != null ? bv.toFixed(3) : '-';
      const hStr = hv != null ? hv.toFixed(3) : '-';
      const deltaStr = bv != null && hv != null ? (hv - bv >= 0 ? '+' : '') + (hv - bv).toFixed(3) : '-';
      process.stdout.write(
        label.padEnd(24) + bStr.padStart(12) + hStr.padStart(12) + deltaStr.padStart(12) + '\n',
      );
    }
  }

  process.stdout.write('\n');
  await disconnect();
}

main().catch((err) => {
  process.stderr.write(`eval:diff failed: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
