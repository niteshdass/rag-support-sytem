import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { logger } from '../../observability/logger.js';
import { AppError, ValidationError } from '../../utils/errors.js';

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const appErr =
    err instanceof ZodError
      ? new ValidationError(err.errors.map((e) => e.message).join(', '))
      : err instanceof AppError
        ? err
        : null;

  const logCtx = {
    reqId: req.id,
    tenantId: req.tenantId?.toString(),
    method: req.method,
    path: req.path,
  };

  // Check at request time so tests can override process.env.NODE_ENV
  const isDev = process.env.NODE_ENV !== 'production';

  if (appErr) {
    logger.warn({ ...logCtx, errorCode: appErr.errorCode }, appErr.message);
    res.status(appErr.statusCode).json({
      error: appErr.message,
      errorCode: appErr.errorCode,
      ...(isDev && { stack: appErr.stack }),
    });
    return;
  }

  const unknown = err instanceof Error ? err : new Error(String(err));
  logger.error({ ...logCtx, err: unknown }, 'unhandled error');
  res.status(500).json({
    error: 'Internal Server Error',
    errorCode: 'INTERNAL_ERROR',
    ...(isDev && { stack: unknown.stack }),
  });
}
