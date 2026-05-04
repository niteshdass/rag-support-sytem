import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../../src/api/middleware/errorHandler.js';
import * as loggerModule from '../../../src/observability/logger.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../../../src/utils/errors.js';

function makeApp(handler: (req: express.Request, res: express.Response, next: express.NextFunction) => void) {
  const app = express();
  app.use(express.json());
  app.get('/test', handler);
  app.use(errorHandler);
  return app;
}

function thrower(err: unknown) {
  return (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(err);
}

describe('errorHandler', () => {
  let savedNodeEnv: string | undefined;

  beforeEach(() => {
    savedNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';
  });

  afterEach(() => {
    process.env.NODE_ENV = savedNodeEnv;
  });

  it('ValidationError → 400 with VALIDATION_ERROR code', async () => {
    const res = await request(makeApp(thrower(new ValidationError('bad input')))).get('/test');
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'bad input', errorCode: 'VALIDATION_ERROR' });
  });

  it('NotFoundError → 404 with NOT_FOUND code', async () => {
    const res = await request(makeApp(thrower(new NotFoundError('gone')))).get('/test');
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: 'gone', errorCode: 'NOT_FOUND' });
  });

  it('ForbiddenError → 403 with FORBIDDEN code', async () => {
    const res = await request(makeApp(thrower(new ForbiddenError('no access')))).get('/test');
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: 'no access', errorCode: 'FORBIDDEN' });
  });

  it('unknown Error → 500 with INTERNAL_ERROR code', async () => {
    const res = await request(makeApp(thrower(new Error('boom')))).get('/test');
    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({ error: 'Internal Server Error', errorCode: 'INTERNAL_ERROR' });
  });

  it('non-Error thrown → 500', async () => {
    const res = await request(makeApp(thrower('string error'))).get('/test');
    expect(res.status).toBe(500);
    expect(res.body.errorCode).toBe('INTERNAL_ERROR');
  });

  it('includes stack in non-production env', async () => {
    process.env.NODE_ENV = 'development';
    const res = await request(makeApp(thrower(new ValidationError('oops')))).get('/test');
    expect(res.body.stack).toBeDefined();
  });

  it('omits stack in production env', async () => {
    process.env.NODE_ENV = 'production';
    const res = await request(makeApp(thrower(new ValidationError('oops')))).get('/test');
    expect(res.body.stack).toBeUndefined();
  });

  it('unknown error also omits stack in production', async () => {
    process.env.NODE_ENV = 'production';
    const res = await request(makeApp(thrower(new Error('boom')))).get('/test');
    expect(res.body.stack).toBeUndefined();
  });

  it('error log includes tenantId when middleware set it', async () => {
    const warnSpy = vi.spyOn(loggerModule.logger, 'warn');
    const tenantOid = new mongoose.Types.ObjectId();

    const app = express();
    app.use(express.json());
    app.get('/test', (req, _res, next) => {
      req.tenantId = tenantOid;
      next(new NotFoundError('thing not found'));
    });
    app.use(errorHandler);

    const res = await request(app).get('/test');
    expect(res.status).toBe(404);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: tenantOid.toString() }),
      expect.any(String),
    );
    warnSpy.mockRestore();
  });

  it('error log has no tenantId when middleware did not run', async () => {
    const warnSpy = vi.spyOn(loggerModule.logger, 'warn');

    const res = await request(makeApp(thrower(new NotFoundError('bare')))).get('/test');
    expect(res.status).toBe(404);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: undefined }),
      expect.any(String),
    );
    warnSpy.mockRestore();
  });
});
