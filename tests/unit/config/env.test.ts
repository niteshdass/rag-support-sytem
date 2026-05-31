import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('env — QDRANT_API_KEY', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = {
      ...originalEnv,
      MONGODB_URI: 'mongodb://localhost:27017/test',
      SESSION_SECRET: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('accepts QDRANT_API_KEY when set', async () => {
    process.env.QDRANT_API_KEY = 'secret-key-abc';
    const { env } = await import('../../../src/config/env.js');
    expect(env.QDRANT_API_KEY).toBe('secret-key-abc');
  });

  it('allows QDRANT_API_KEY to be absent', async () => {
    delete process.env.QDRANT_API_KEY;
    const { env } = await import('../../../src/config/env.js');
    expect(env.QDRANT_API_KEY).toBeUndefined();
  });
});
