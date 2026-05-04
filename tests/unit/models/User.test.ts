import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { UserModel } from '../../../src/infra/mongo/models/User.js';

describe('User model', () => {
  let mongod: MongoMemoryServer;
  const tenantA = new mongoose.Types.ObjectId();
  const tenantB = new mongoose.Types.ObjectId();

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongod.stop();
  });

  it('hashes password on create', async () => {
    const plain = 'secret123';
    const user = await UserModel.create({
      tenantId: tenantA,
      email: 'admin@acme.com',
      passwordHash: plain,
      role: 'admin',
      name: 'Admin User',
    });

    expect(user.passwordHash).not.toBe(plain);
    expect(user.passwordHash).toMatch(/^\$2[ab]\$/);
  });

  it('comparePassword returns true for correct password', async () => {
    const user = await UserModel.findOne({ email: 'admin@acme.com', tenantId: tenantA });
    expect(user).not.toBeNull();
    expect(await user!.comparePassword('secret123')).toBe(true);
  });

  it('comparePassword returns false for wrong password', async () => {
    const user = await UserModel.findOne({ email: 'admin@acme.com', tenantId: tenantA });
    expect(await user!.comparePassword('wrongpass')).toBe(false);
  });

  it('allows same email across different tenants', async () => {
    await UserModel.create({
      tenantId: tenantB,
      email: 'admin@acme.com',
      passwordHash: 'anotherpass',
      role: 'agent',
      name: 'Agent B',
    });
    const count = await UserModel.countDocuments({ email: 'admin@acme.com' });
    expect(count).toBe(2);
  });

  it('blocks duplicate email within same tenant', async () => {
    await expect(
      UserModel.create({
        tenantId: tenantA,
        email: 'admin@acme.com',
        passwordHash: 'doesntmatter',
        role: 'agent',
        name: 'Dup User',
      }),
    ).rejects.toThrow();
  });

  it('does not re-hash on save when passwordHash unchanged', async () => {
    const user = await UserModel.findOne({ email: 'admin@acme.com', tenantId: tenantA });
    const hashBefore = user!.passwordHash;
    user!.name = 'Updated Name';
    await user!.save();
    expect(user!.passwordHash).toBe(hashBefore);
  });
});
