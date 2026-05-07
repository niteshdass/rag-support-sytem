import pino, { type LoggerOptions } from 'pino';
import { env } from '../config/env.js';
import { redactSync } from '../utils/redact.js';

const PII_FIELDS = new Set(['query', 'text', 'content', 'body', 'input', 'output', 'msg']);

function redactLogObject(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    result[k] = PII_FIELDS.has(k) && typeof v === 'string' ? redactSync(v) : v;
  }
  return result;
}

const baseOptions: LoggerOptions = {
  level: env.NODE_ENV === 'test' ? 'silent' : 'info',
  base: { app: 'supportpilot', env: env.NODE_ENV },
  redact: ['req.headers.authorization', '*.password', '*.apiKey'],
  formatters: { log: redactLogObject },
};

export const logger =
  env.NODE_ENV === 'development'
    ? pino({ ...baseOptions, transport: { target: 'pino-pretty', options: { colorize: true } } })
    : pino(baseOptions);
