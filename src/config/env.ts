import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  MONGODB_URI: z.string().url(),
  SESSION_SECRET: z.string().min(32),
  STORAGE_DRIVER: z.enum(['local']).default('local'),
  QDRANT_URL: z.string().url().default('http://localhost:6333'),
  MEILI_URL: z.string().url().default('http://localhost:7700'),
  MEILI_MASTER_KEY: z.string().default(''),
  LLM_PROVIDER: z.enum(['ollama', 'groq']).default('ollama'),
  OLLAMA_URL: z.string().url().default('http://localhost:11434'),
  OLLAMA_MODEL: z.string().default('llama3.1:8b'),
  GROQ_API_KEY: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  process.stderr.write(`Invalid environment variables: ${JSON.stringify(parsed.error.flatten().fieldErrors)}\n`);
  process.exit(1);
}

export const env = parsed.data;
