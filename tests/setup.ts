import { MongoMemoryServer } from 'mongodb-memory-server';

let mongod: MongoMemoryServer;

export async function setup() {
  // Provide required env vars before any test module imports env.ts
  process.env.SESSION_SECRET = 'test-secret-that-is-long-enough-for-vitest-global-setup';
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
}

export async function teardown() {
  await mongod.stop();
}
