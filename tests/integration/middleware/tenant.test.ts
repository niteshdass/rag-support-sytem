import express from 'express';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { tenantMiddleware } from '../../../src/api/middleware/tenant.js';
import { TenantModel } from '../../../src/infra/mongo/models/Tenant.js';
import { UserModel } from '../../../src/infra/mongo/models/User.js';

const app = express();
app.use(express.json());
app.use(tenantMiddleware);
app.get('/debug', (req, res) => {
  res.json({
    tenantId: req.tenantId.toString(),
    userId: req.user._id.toString(),
    userEmail: req.user.email,
  });
});

describe('tenantMiddleware', () => {
  let mongod: MongoMemoryServer;
  let tenantId: string;
  let userId: string;
  let otherUserId: string;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());

    const tenant = await TenantModel.create({ name: 'Acme' });
    tenantId = tenant._id.toString();

    const user = await UserModel.create({
      tenantId: tenant._id,
      email: 'admin@acme.com',
      passwordHash: 'pass12345',
      role: 'admin',
      name: 'Admin',
    });
    userId = user._id.toString();

    const otherTenant = await TenantModel.create({ name: 'Other Corp' });
    const otherUser = await UserModel.create({
      tenantId: otherTenant._id,
      email: 'admin@other.com',
      passwordHash: 'pass12345',
      role: 'admin',
      name: 'Other Admin',
    });
    otherUserId = otherUser._id.toString();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongod.stop();
  });

  it('401 when no headers', async () => {
    const res = await request(app).get('/debug');
    expect(res.status).toBe(401);
  });

  it('401 when only X-Tenant-Id provided', async () => {
    const res = await request(app).get('/debug').set('X-Tenant-Id', tenantId);
    expect(res.status).toBe(401);
  });

  it('401 when only X-User-Id provided', async () => {
    const res = await request(app).get('/debug').set('X-User-Id', userId);
    expect(res.status).toBe(401);
  });

  it('404 for malformed tenantId', async () => {
    const res = await request(app)
      .get('/debug')
      .set('X-Tenant-Id', 'not-an-objectid')
      .set('X-User-Id', userId);
    expect(res.status).toBe(404);
  });

  it('404 for non-existent tenantId', async () => {
    const res = await request(app)
      .get('/debug')
      .set('X-Tenant-Id', new mongoose.Types.ObjectId().toString())
      .set('X-User-Id', userId);
    expect(res.status).toBe(404);
  });

  it('404 for non-existent userId', async () => {
    const res = await request(app)
      .get('/debug')
      .set('X-Tenant-Id', tenantId)
      .set('X-User-Id', new mongoose.Types.ObjectId().toString());
    expect(res.status).toBe(404);
  });

  it('403 when user belongs to a different tenant', async () => {
    const res = await request(app)
      .get('/debug')
      .set('X-Tenant-Id', tenantId)
      .set('X-User-Id', otherUserId);
    expect(res.status).toBe(403);
  });

  it('200 and populates req.tenantId and req.user', async () => {
    const res = await request(app)
      .get('/debug')
      .set('X-Tenant-Id', tenantId)
      .set('X-User-Id', userId);
    expect(res.status).toBe(200);
    expect(res.body.tenantId).toBe(tenantId);
    expect(res.body.userId).toBe(userId);
    expect(res.body.userEmail).toBe('admin@acme.com');
  });
});
