import { logger } from '../logger.js';

interface RetryOptions {
  maxRetries: number;
  baseDelayMs: number;
  timeoutMs: number;
}

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions): Promise<T> {
  let lastError: Error = new Error('Unknown error');

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      const result = await Promise.race([
        fn(),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error(`Operation timed out after ${opts.timeoutMs}ms`)),
            opts.timeoutMs
          )
        ),
      ]);
      return result;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      if (attempt === opts.maxRetries) break;

      const jitter = Math.random() * opts.baseDelayMs;
      const delay = opts.baseDelayMs * Math.pow(2, attempt) + jitter;

      logger.warn(
        { attempt, delayMs: Math.round(delay), error: lastError.message },
        'Retrying after error'
      );
      await new Promise<void>((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}
