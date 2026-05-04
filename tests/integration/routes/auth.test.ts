import MongoStore from 'connect-mongo';
import express from 'express';
import session from 'express-session';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authRouter } from '../../../src/api/routes/auth.js';
import { TenantModel } from '../../../src/infra/mongo/models/Tenant.js';
import { UserModel } from '../../../src/infra/mongo/models/User.js';

function buildApp(mongoUri: string) {
  const app = express();
  app.use(express.json());
  app.use(
    session({
      secret: 'test-secret-that-is-long-enough-for-tests',
      resave: false,
      saveUninitialized: false,
      store: MongoStore.create({ mongoUrl: mongoUri }),
      cookie: { httpOnly: true },
    }),
  );
  app.use('/auth', authRouter);
  return app;
}

describe('auth routes', () => {
  let mongod: MongoMemoryServer;
  let app: express.Express;
  const PASSWORD = 'securePass123';

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    const uri = mongod.getUri();
    await mongoose.connect(uri);

    app = buildApp(uri);

    const tenant = await TenantModel.create({
      name: 'Acme',
      slug: 'acme',
    });

    await UserModel.create({
      tenantId: tenant._id,
      email: 'admin@acme.com',
      passwordHash: PASSWORD,
      role: 'admin',
      name: 'Admin User',
    });
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongod.stop();
  });

  describe('POST /auth/login', () => {
    it('401 on wrong password', async () => {
      const res = await request(app).post('/auth/login').send({
        email: 'admin@acme.com',
        password: 'wrongpassword',
        tenantSlug: 'acme',
      });
      expect(res.status).toBe(401);
    });

    it('401 on unknown email', async () => {
      const res = await request(app).post('/auth/login').send({
        email: 'nobody@acme.com',
        password: PASSWORD,
        tenantSlug: 'acme',
      });
      expect(res.status).toBe(401);
    });

    it('401 on unknown tenantSlug', async () => {
      const res = await request(app).post('/auth/login').send({
        email: 'admin@acme.com',
        password: PASSWORD,
        tenantSlug: 'ghost',
      });
      expect(res.status).toBe(401);
    });

    it('400 on missing fields', async () => {
      const res = await request(app).post('/auth/login').send({ email: 'admin@acme.com' });
      expect(res.status).toBe(400);
    });

    it('200, sets cookie, returns user without passwordHash', async () => {
      const res = await request(app).post('/auth/login').send({
        email: 'admin@acme.com',
        password: PASSWORD,
        tenantSlug: 'acme',
      });
      expect(res.status).toBe(200);
      expect(res.headers['set-cookie']).toBeDefined();
      expect(res.body.user.email).toBe('admin@acme.com');
      expect(res.body.user.passwordHash).toBeUndefined();
    });
  });

  describe('GET /auth/me', () => {
    it('401 without cookie', async () => {
      const res = await request(app).get('/auth/me');
      expect(res.status).toBe(401);
    });

    it('200 with valid session, returns user + tenant', async () => {
      const agent = request.agent(app);

      await agent.post('/auth/login').send({
        email: 'admin@acme.com',
        password: PASSWORD,
        tenantSlug: 'acme',
      });

      const res = await agent.get('/auth/me');
      expect(res.status).toBe(200);
      expect(res.body.user.email).toBe('admin@acme.com');
      expect(res.body.user.passwordHash).toBeUndefined();
      expect(res.body.tenant.slug).toBe('acme');
    });
  });

  describe('POST /auth/logout', () => {
    it('destroys session — /auth/me returns 401 after logout', async () => {
      const agent = request.agent(app);

      await agent.post('/auth/login').send({
        email: 'admin@acme.com',
        password: PASSWORD,
        tenantSlug: 'acme',
      });

      const meBeforeLogout = await agent.get('/auth/me');
      expect(meBeforeLogout.status).toBe(200);

      const logout = await agent.post('/auth/logout');
      expect(logout.status).toBe(200);

      const meAfterLogout = await agent.get('/auth/me');
      expect(meAfterLogout.status).toBe(401);
    });
  });
});
