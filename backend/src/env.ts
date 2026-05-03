import { z } from 'zod';

const optionalUrl = z.preprocess(
  (val) => (val === '' ? undefined : val),
  z.string().url().optional()
);

const optionalStr = z.preprocess(
  (val) => (val === '' ? undefined : val),
  z.string().optional()
);

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  DATABASE_POOL_SIZE: z.coerce.number().int().positive().default(20),
  REDIS_URL: z.string().url(),
  ANTHROPIC_API_KEY: z.string().min(1),
  VOYAGE_API_KEY: z.string().min(1),
  COHERE_API_KEY: z.string().min(1),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  API_PORT: z.coerce.number().int().positive().default(3000),
  CHUNK_SIZE: z.coerce.number().int().positive().default(1024),
  CHUNK_OVERLAP: z.coerce.number().int().nonnegative().default(200),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(100),
  INGESTION_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(5),
  LLM_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
  LLM_MAX_RETRIES: z.coerce.number().int().nonnegative().default(3),
  LLM_TEMPERATURE: z.coerce.number().min(0).max(2).default(0.7),
  LLM_MODEL: z.string().default('claude-sonnet-4-6'),
  EMBEDDING_TIMEOUT_MS: z.coerce.number().int().positive().default(10000),
  EMBEDDING_MAX_RETRIES: z.coerce.number().int().nonnegative().default(3),
  EMBEDDING_MODEL: z.string().default('voyage-3'),
  RERANKER_MODEL: z.string().default('rerank-3'),
  RERANKER_TOP_N: z.coerce.number().int().positive().default(5),
  SENTRY_DSN: optionalStr,
  LOG_SINK_URL: optionalUrl,
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
  process.stderr.write('Invalid environment variables:\n');
  process.stderr.write(JSON.stringify(result.error.errors, null, 2) + '\n');
  process.exit(1);
}

export const env = result.data;

export type Env = typeof env;
