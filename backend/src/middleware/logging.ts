import type { FastifyInstance } from 'fastify';
import { logger } from '../logger.js';

declare module 'fastify' {
  interface FastifyRequest {
    orgId?: string;
    startTime: bigint;
  }
}

export function registerLogging(app: FastifyInstance): void {
  app.addHook('onRequest', async (request) => {
    request.startTime = process.hrtime.bigint();
    logger.info({ method: request.method, url: request.url }, 'incoming request');
  });

  app.addHook('onResponse', async (request, reply) => {
    const latency_ms = Number(process.hrtime.bigint() - request.startTime) / 1e6;
    logger.info({
      method: request.method,
      url: request.url,
      status: reply.statusCode,
      latency_ms: Math.round(latency_ms * 100) / 100,
      ...(request.orgId ? { org_id: request.orgId } : {}),
    }, 'request completed');
  });
}
