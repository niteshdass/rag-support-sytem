import 'dotenv/config';
import './env.js';
import * as Sentry from '@sentry/node';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { env } from './env.js';
import { config } from './config.js';
import { logger } from './logger.js';
import { pool } from './db/client.js';
import { registerErrorHandler } from './middleware/error.js';
import { registerLogging } from './middleware/logging.js';
import { healthRoutes } from './routes/health.js';
import { adminRoutes } from './routes/admin.js';

if (env.SENTRY_DSN) {
  Sentry.init({ dsn: env.SENTRY_DSN, environment: env.NODE_ENV });
}

const app = Fastify({ logger: false, disableRequestLogging: true });

await app.register(cors);
await app.register(rateLimit, {
  max: config.rateLimitMax,
  timeWindow: config.rateLimitWindowMs,
});

registerLogging(app);
registerErrorHandler(app);

await app.register(healthRoutes);
await app.register(adminRoutes);

const gracefulShutdown = async (signal: string): Promise<void> => {
  logger.info({ signal }, 'shutdown signal received');
  await app.close();
  await pool.end();
  logger.info('server closed');
  process.exit(0);
};

process.on('SIGTERM', () => void gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => void gracefulShutdown('SIGINT'));

try {
  await app.listen({ port: env.API_PORT, host: '0.0.0.0' });
  logger.info({ port: env.API_PORT }, 'server listening');
} catch (err) {
  logger.error(err, 'server failed to start');
  process.exit(1);
}
