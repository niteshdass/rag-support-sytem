import { env } from '../../config/env.js';
import type { LLMClient } from './client.js';
import { OllamaClient } from './ollama.js';
import { GroqClient } from './groq.js';

let _client: LLMClient | null = null;

export function getLLMClient(): LLMClient {
  if (!_client) {
    if (env.LLM_PROVIDER === 'groq') {
      if (!env.GROQ_API_KEY) throw new Error('GROQ_API_KEY is required when LLM_PROVIDER=groq');
      _client = new GroqClient(env.GROQ_API_KEY);
    } else if (env.LLM_PROVIDER === 'ollama') {
      _client = new OllamaClient(env.OLLAMA_URL, env.OLLAMA_MODEL);
    } else {
      throw new Error(`LLM provider "${env.LLM_PROVIDER}" not implemented`);
    }
  }
  return _client;
}

export function resetLLMClient(): void {
  _client = null;
}
