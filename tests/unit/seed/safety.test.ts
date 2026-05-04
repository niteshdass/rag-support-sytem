import { describe, expect, it } from 'vitest';
import { assertSafeUri, UnsafeUriError } from '../../../scripts/seed/safety.js';

describe('assertSafeUri', () => {
  it.each([
    'mongodb://localhost:27017/mydb',
    'mongodb://user:pass@devhost:27017/db',
    'mongodb://user:pass@testserver:27017/db',
    'mongodb://host/supportpilot-local',
    'mongodb://host/supportpilot-dev',
    'mongodb://host/supportpilot-test',
  ])('allows safe URI: %s', (uri) => {
    expect(() => assertSafeUri(uri)).not.toThrow();
  });

  it.each([
    'mongodb://user:pass@prod.company.com:27017/supportpilot',
    'mongodb+srv://user:pass@cluster0.abc.mongodb.net/supportpilot',
    'mongodb://db.internal.company.com/supportpilot',
  ])('throws UnsafeUriError on production URI: %s', (uri) => {
    expect(() => assertSafeUri(uri)).toThrow(UnsafeUriError);
  });

  it('redacts credentials in error message', () => {
    const uri = 'mongodb://admin:s3cr3t@prod.company.com/db';
    expect(() => assertSafeUri(uri)).toThrow(/redacted/);
  });
});
