import 'dotenv/config';
import './env.js';
import Fastify from 'fastify';
import { logger } from './logger.js';
import { env } from './env.js';

const app = Fastify({ logger });

app.get('/health', async () => ({
  status: 'ok',
  timestamp: new Date().toISOString(),
}));

const start = async (): Promise<void> => {
  await app.listen({ port: env.API_PORT, host: '0.0.0.0' });
};

start().catch((err: unknown) => {
  logger.error(err);
  process.exit(1);
});
