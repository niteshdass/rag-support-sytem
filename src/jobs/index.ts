import Agenda, { type Job } from 'agenda';
import { env } from '../config/env.js';
import { logger } from '../observability/logger.js';
import { defineIngestDocument } from './ingestDocument.js';
import { defineSyncSource } from './syncSource.js';
import { defineGenerateDraft } from './generateDraft.js';
import type { JobQueue } from '../domain/knowledge/documentService.js';

const JOB_COLLECTION = 'jobs';
const SYNC_JOB_NAME = 'sync-source';
const DEFAULT_SYNC_INTERVAL = 'every 6 hours';

let _agenda: Agenda | null = null;
let _ready: Promise<void> | null = null;

function getAgenda(): Agenda {
  if (!_agenda) {
    _agenda = new Agenda({
      db: { address: env.MONGODB_URI, collection: JOB_COLLECTION },
      processEvery: '5 seconds',
      maxConcurrency: 5,
    });
    _ready = new Promise<void>((resolve, reject) => {
      _agenda!.once('ready', resolve);
      _agenda!.once('error', reject);
    });
  }
  return _agenda;
}

export function getJobQueue(): JobQueue {
  return {
    async enqueue(jobName, data) {
      const agenda = getAgenda();
      await _ready;
      const job = agenda.create(jobName, data);
      await job.save();
    },
  };
}

export async function schedulePeriodicSync(
  sourceId: string,
  syncCron?: string,
): Promise<void> {
  const agenda = getAgenda();
  await _ready;
  const interval = syncCron ?? DEFAULT_SYNC_INTERVAL;
  await agenda.every(interval, SYNC_JOB_NAME, { sourceId }, { skipImmediate: true });
  logger.info({ sourceId, interval }, 'periodic sync scheduled');
}

export async function cancelPeriodicSync(sourceId: string): Promise<void> {
  const agenda = getAgenda();
  await _ready;
  const removed = await agenda.cancel({ name: SYNC_JOB_NAME, data: { sourceId } });
  logger.info({ sourceId, removed }, 'periodic sync cancelled');
}

export async function startWorker(): Promise<void> {
  const agenda = getAgenda();

  defineIngestDocument(agenda);
  defineSyncSource(agenda, getJobQueue());
  defineGenerateDraft(agenda);

  agenda.on('fail', (err: Error, job: Job) => {
    logger.error({ err, jobName: job.attrs.name, data: job.attrs.data }, 'agenda job failed');
  });

  await _ready;
  await agenda.start();
  logger.info('agenda worker started');
}

export async function stopWorker(): Promise<void> {
  if (_agenda) {
    await _agenda.stop();
    _agenda = null;
    _ready = null;
    logger.info('agenda worker stopped');
  }
}
