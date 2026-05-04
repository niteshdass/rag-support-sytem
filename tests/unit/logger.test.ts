import { describe, it, expect } from 'vitest';
import { logger } from '../../src/observability/logger.js';

describe('logger', () => {
  it('exports info, error, warn functions', () => {
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.error).toBe('function');
    expect(typeof logger.warn).toBe('function');
  });
});
