import express, { type Request, type Response } from 'express';
import session from 'express-session';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { tenantMiddleware } from '../../../src/api/middleware/tenant.js';
import { TenantModel } from '../../../src/infra/mongo/models/Tenant.js';
import { UserModel } from '../../../src/infra/mongo/models/User.js';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(
    session({
      secret: 'test-secret-that-is-long-enough-for-tests',
      resave: false,
      saveUninitialized: false,
      cookie: { httpOnly: true },
    }),
  );
  // Helper route so tests can inject a userId into the session without logging in
  app.post('/test-session', (req: Request, res: Response) => {
    req.session.userId = req.body.userId as string | undefined;
    res.json({ ok: true });
  });
  app.use(tenantMiddleware);
  app.get('/debug', (req: Request, res: Response) => {
    res.json({
      tenantId: req.tenantId!.toString(),
      userId: req.user!._id.toString(),
      userEmail: req.user!.email,
    });
  });
  return app;
}

describe('tenantMiddleware (session-based)', () => {
  let mongod: MongoMemoryServer;
  let app: express.Express;
  let tenantId: string;
  let userId: string;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());

    app = buildApp();

    const tenant = await TenantModel.create({ name: 'Acme', slug: 'acme' });
    tenantId = tenant._id.toString();

    const user = await UserModel.create({
      tenantId: tenant._id,
      email: 'admin@acme.com',
      passwordHash: 'pass12345',
      role: 'admin',
      name: 'Admin',
    });
    userId = user._id.toString();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongod.stop();
  });

  it('401 when no session', async () => {
    const res = await request(app).get('/debug');
    expect(res.status).toBe(401);
  });

  it('401 when session has unknown userId', async () => {
    const agent = request.agent(app);
    await agent.post('/test-session').send({ userId: new mongoose.Types.ObjectId().toString() });
    const res = await agent.get('/debug');
    expect(res.status).toBe(401);
  });

  it('200 and populates req.tenantId and req.user from session', async () => {
    const agent = request.agent(app);
    await agent.post('/test-session').send({ userId });
    const res = await agent.get('/debug');
    expect(res.status).toBe(200);
    expect(res.body.tenantId).toBe(tenantId);
    expect(res.body.userId).toBe(userId);
    expect(res.body.userEmail).toBe('admin@acme.com');
  });
});
