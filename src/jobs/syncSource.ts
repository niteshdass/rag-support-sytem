import Agenda, { type Job } from 'agenda';
import { SourceModel } from '../infra/mongo/models/Source.js';
import { getConnector } from '../domain/ingestion/connectors/base.js';
import { DocumentService, type JobQueue } from '../domain/knowledge/documentService.js';
import { logger } from '../observability/logger.js';

export function defineSyncSource(agenda: Agenda, jobQueue: JobQueue): void {
  agenda.define('sync-source', { concurrency: 2 }, async (job: Job) => {
    const { sourceId } = job.attrs.data as { sourceId: string };
    await runSyncSource(sourceId, jobQueue);
  });
}

export async function runSyncSource(sourceId: string, jobQueue: JobQueue): Promise<void> {
  const log = logger.child({ job: 'sync-source', sourceId });
  log.info('starting');

  const source = await SourceModel.findById(sourceId);
  if (!source) {
    throw new Error(`Source not found: ${sourceId}`);
  }

  const connector = getConnector(source.subtype);

  await SourceModel.findByIdAndUpdate(sourceId, { $set: { status: 'syncing' } });

  const docService = new DocumentService(jobQueue);
  let count = 0;

  try {
    for await (const connDoc of connector.sync(source)) {
      await docService.add({
        tenantId: source.tenantId.toString(),
        sourceId: source._id.toString(),
        sourceType: 'connector',
        externalId: connDoc.externalId,
        title: connDoc.title,
        ...(connDoc.url !== undefined && { url: connDoc.url }),
        content: connDoc.content,
        visibility: 'customer-facing',
        addedBy: source.addedBy.toString(),
      });
      count++;
    }

    await SourceModel.findByIdAndUpdate(sourceId, {
      $set: { status: 'active', lastSyncedAt: new Date() },
    });

    log.info({ count }, 'sync-source complete');
  } catch (err) {
    log.error({ err }, 'sync-source failed');
    await SourceModel.findByIdAndUpdate(sourceId, { $set: { status: 'error' } });
    throw err;
  }
}
