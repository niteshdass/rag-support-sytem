import mongoose from 'mongoose';
import { env } from '../../config/env.js';
import { logger } from '../../observability/logger.js';

const MAX_RETRIES = 5;
const BASE_DELAY_MS = 1000;

mongoose.connection.on('connected', () => {
  logger.info('MongoDB connected');
});

mongoose.connection.on('disconnected', () => {
  logger.info('MongoDB disconnected');
});

mongoose.connection.on('error', (err) => {
  logger.error({ err }, 'MongoDB error');
});

export async function connect(): Promise<void> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await mongoose.connect(env.MONGODB_URI);
      return;
    } catch (err) {
      const isLast = attempt === MAX_RETRIES;
      if (isLast) {
        logger.error({ err, attempt }, 'MongoDB connect failed — giving up');
        throw err;
      }
      const delay = BASE_DELAY_MS * 2 ** (attempt - 1);
      logger.warn({ err, attempt, delayMs: delay }, 'MongoDB connect failed — retrying');
      await new Promise((res) => setTimeout(res, delay));
    }
  }
}

export async function disconnect(): Promise<void> {
  await mongoose.disconnect();
}
