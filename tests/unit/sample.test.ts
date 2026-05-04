import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import mongoose from 'mongoose';
import { connect, disconnect } from '../../src/infra/mongo/client.js';

describe('mongo client', () => {
  beforeAll(async () => {
    await connect();
  });

  afterAll(async () => {
    await disconnect();
  });

  it('connects and disconnects without error', () => {
    expect(mongoose.connection.readyState).toBe(1); // 1 = connected
  });
});
