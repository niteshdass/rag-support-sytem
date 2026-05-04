import { connect, disconnect } from './infra/mongo/client.js';
import { startWorker, stopWorker } from './jobs/index.js';
import { logger } from './observability/logger.js';

async function main(): Promise<void> {
  await connect();
  await startWorker();
  logger.info('worker ready');
}

async function shutdown(): Promise<void> {
  logger.info('worker shutting down');
  await stopWorker();
  await disconnect();
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown());
process.on('SIGINT', () => void shutdown());

main().catch(err => {
  logger.error({ err }, 'worker boot failed');
  process.exit(1);
});
