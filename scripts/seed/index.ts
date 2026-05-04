import { logger } from '../../src/observability/logger.js';

async function main() {
  logger.info('Seed script — not yet implemented');
}

main().catch(err => {
  process.stderr.write(`Seed failed: ${String(err)}\n`);
  process.exit(1);
});
