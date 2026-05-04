import express from 'express';
import { env } from './config/env.js';
import { logger } from './observability/logger.js';
import { connect, disconnect } from './infra/mongo/client.js';

const app = express();

app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'shutting down');
  await disconnect();
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

await connect();

app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, 'SupportPilot API started');
});

export default app;
