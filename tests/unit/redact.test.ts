import { describe, it, expect, vi, afterEach } from 'vitest';
import { redactSync, redact, redactRecord } from '../../src/utils/redact.js';

describe('redactSync', () => {
  it('redacts email addresses', () => {
    expect(redactSync('Contact us at support@example.com for help')).toBe(
      'Contact us at [REDACTED_EMAIL] for help',
    );
  });

  it('redacts multiple emails', () => {
    const result = redactSync('From alice@foo.com to bob@bar.org');
    expect(result).toBe('From [REDACTED_EMAIL] to [REDACTED_EMAIL]');
  });

  it('redacts US phone numbers', () => {
    expect(redactSync('Call us at 555-867-5309')).toBe('Call us at [REDACTED_PHONE]');
  });

  it('redacts phone with parentheses', () => {
    expect(redactSync('Number: (800) 555-1234')).toBe('Number: [REDACTED_PHONE]');
  });

  it('leaves clean text unchanged', () => {
    expect(redactSync('How do I reset my password?')).toBe('How do I reset my password?');
  });
});

describe('redact (async)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('falls back to regex when REDACT_URL is unset', async () => {
    // env.REDACT_URL is undefined in test env — regex path runs
    const result = await redact('My email is user@test.com');
    expect(result).toBe('My email is [REDACTED_EMAIL]');
  });

  it('calls the sidecar when REDACT_URL is set', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ redacted: '[REDACTED_EMAIL] is my address' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    // Temporarily patch env
    const { env } = await import('../../src/config/env.js');
    const original = env.REDACT_URL;
    (env as Record<string, unknown>).REDACT_URL = 'http://localhost:8100';

    try {
      const result = await redact('test@example.com is my address');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8100/redact',
        expect.objectContaining({ method: 'POST' }),
      );
      expect(result).toBe('[REDACTED_EMAIL] is my address');
    } finally {
      (env as Record<string, unknown>).REDACT_URL = original;
    }
  });

  it('falls back to regex when sidecar returns non-ok', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 503 });
    vi.stubGlobal('fetch', mockFetch);

    const { env } = await import('../../src/config/env.js');
    const original = env.REDACT_URL;
    (env as Record<string, unknown>).REDACT_URL = 'http://localhost:8100';

    try {
      const result = await redact('reach me at fallback@example.com');
      expect(result).toBe('reach me at [REDACTED_EMAIL]');
    } finally {
      (env as Record<string, unknown>).REDACT_URL = original;
    }
  });
});

describe('redactRecord', () => {
  it('redacts string values in a record', async () => {
    const result = await redactRecord({ query: 'email me at me@test.com', count: 5 });
    expect(result.query).toBe('email me at [REDACTED_EMAIL]');
    expect(result.count).toBe(5);
  });
});
