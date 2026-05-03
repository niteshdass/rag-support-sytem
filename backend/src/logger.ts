import pino from 'pino';
import { env } from './env.js';

const devTransport =
  env.NODE_ENV === 'development'
    ? { transport: { target: 'pino-pretty', options: { colorize: true } } }
    : {};

export const logger = pino({ level: env.LOG_LEVEL, ...devTransport });
