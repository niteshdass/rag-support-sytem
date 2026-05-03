import type { FastifyInstance, FastifyError } from 'fastify';
import * as Sentry from '@sentry/node';
import { logger } from '../logger.js';
import { AppError } from '../utils/errors.js';

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      if (error.statusCode >= 500) {
        logger.error({ err: error, url: request.url, method: request.method }, 'app error');
        Sentry.captureException(error);
      } else {
        logger.warn({ code: error.code, message: error.message, url: request.url }, 'client error');
      }

      void reply.status(error.statusCode).send({
        code: error.code,
        message: error.message,
        ...(error.details !== undefined ? { details: error.details } : {}),
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const fastifyError = error as FastifyError;
    const statusCode = fastifyError.statusCode ?? 500;
    const isClientError = statusCode < 500;

    if (isClientError) {
      logger.warn({ statusCode, message: error.message, url: request.url }, 'client error');
    } else {
      logger.error({ err: error, url: request.url, method: request.method }, 'unhandled error');
      Sentry.captureException(error);
    }

    void reply.status(statusCode).send({
      code: isClientError ? 'INVALID_INPUT' : 'INTERNAL_ERROR',
      message: isClientError ? error.message : 'Internal server error',
      timestamp: new Date().toISOString(),
    });
  });
}
