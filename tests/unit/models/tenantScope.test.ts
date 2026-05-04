import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { UserModel } from '../../../src/infra/mongo/models/User.js';
import { logger } from '../../../src/observability/logger.js';

describe('tenantScope plugin', () => {
  let mongod: MongoMemoryServer;
  const t1 = new mongoose.Types.ObjectId();
  const t2 = new mongoose.Types.ObjectId();

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongod.stop();
  });

  beforeEach(async () => {
    // bypass plugin middleware for cleanup
    await mongoose.connection.collection('users').deleteMany({});
    await UserModel.create([
      { tenantId: t1, email: 'alice@t1.com', passwordHash: 'pass12345', role: 'admin', name: 'Alice T1' },
      { tenantId: t1, email: 'bob@t1.com', passwordHash: 'pass12345', role: 'agent', name: 'Bob T1' },
      { tenantId: t2, email: 'carol@t2.com', passwordHash: 'pass12345', role: 'admin', name: 'Carol T2' },
      { tenantId: t2, email: 'alice@t1.com', passwordHash: 'pass12345', role: 'agent', name: 'Alice T2' },
    ]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('forTenant.find() returns only that tenant\'s users', async () => {
    const users = await UserModel.forTenant(t1).find();
    expect(users).toHaveLength(2);
    expect(users.every(u => u.tenantId.equals(t1))).toBe(true);
  });

  it('forTenant.find() excludes the other tenant even with matching emails', async () => {
    const users = await UserModel.forTenant(t2).find();
    expect(users).toHaveLength(2);
    expect(users.every(u => u.tenantId.equals(t2))).toBe(true);
  });

  it('forTenant.findOne() returns the scoped tenant\'s doc', async () => {
    const user = await UserModel.forTenant(t1).findOne({ email: 'alice@t1.com' });
    expect(user).not.toBeNull();
    expect(user!.tenantId.equals(t1)).toBe(true);
    expect(user!.name).toBe('Alice T1');
  });

  it('forTenant.findOne() ignores other tenant\'s matching email', async () => {
    const user = await UserModel.forTenant(t1).findOne({ email: 'carol@t2.com' });
    expect(user).toBeNull();
  });

  it('forTenant accepts tenantId as string', async () => {
    const users = await UserModel.forTenant(t1.toString()).find();
    expect(users).toHaveLength(2);
    expect(users.every(u => u.tenantId.equals(t1))).toBe(true);
  });

  it('forTenant.countDocuments() scopes to tenant', async () => {
    expect(await UserModel.forTenant(t1).countDocuments()).toBe(2);
    expect(await UserModel.forTenant(t2).countDocuments()).toBe(2);
  });

  it('direct find() without tenantId still returns results', async () => {
    vi.spyOn(logger, 'warn').mockImplementation(() => logger);
    const users = await UserModel.find({ email: 'alice@t1.com' });
    expect(users).toHaveLength(2); // both tenants have alice
  });

  it('direct find() without tenantId logs a warning', async () => {
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => logger);
    await UserModel.find({ email: 'alice@t1.com' });
    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({ op: 'find' }),
      expect.stringContaining('tenantId'),
    );
  });

  it('direct findOne() without tenantId logs a warning', async () => {
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => logger);
    await UserModel.findOne({ email: 'alice@t1.com' });
    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({ op: 'findOne' }),
      expect.stringContaining('tenantId'),
    );
  });

  it('forTenant.find() does NOT trigger the tenantId warning', async () => {
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => logger);
    await UserModel.forTenant(t1).find();
    const tenantIdWarns = warnSpy.mock.calls.filter(
      ([meta]) => typeof meta === 'object' && (meta as { op?: string }).op === 'find',
    );
    expect(tenantIdWarns).toHaveLength(0);
  });
});
