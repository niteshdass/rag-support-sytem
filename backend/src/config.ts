import { env } from './env.js';

export const config = {
  dbPoolSize: env.DATABASE_POOL_SIZE,
  chunkSize: env.CHUNK_SIZE,
  chunkOverlap: env.CHUNK_OVERLAP,
  rateLimitWindowMs: env.RATE_LIMIT_WINDOW_MS,
  rateLimitMax: env.RATE_LIMIT_MAX_REQUESTS,
  ingestionRateLimitMax: env.INGESTION_RATE_LIMIT_MAX,
  llmTimeoutMs: env.LLM_TIMEOUT_MS,
  llmMaxRetries: env.LLM_MAX_RETRIES,
  llmTemperature: env.LLM_TEMPERATURE,
  llmModel: env.LLM_MODEL,
  embeddingTimeoutMs: env.EMBEDDING_TIMEOUT_MS,
  embeddingMaxRetries: env.EMBEDDING_MAX_RETRIES,
  embeddingModel: env.EMBEDDING_MODEL,
  rerankerModel: env.RERANKER_MODEL,
  rerankerTopN: env.RERANKER_TOP_N,
} as const;

export type Config = typeof config;
