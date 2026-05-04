import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// connect/disconnect directly via mongoose so no env setup is needed in test
describe('mongo client', () => {
  let mongod: MongoMemoryServer;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
  });

  afterAll(async () => {
    await mongod.stop();
  });

  it('connects and disconnects without error', async () => {
    const uri = mongod.getUri();

    await expect(mongoose.connect(uri)).resolves.toBeDefined();
    expect(mongoose.connection.readyState).toBe(1); // connected

    await mongoose.disconnect();
    expect(mongoose.connection.readyState).toBe(0); // disconnected
  });
});
