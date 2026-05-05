import { env } from '../../config/env.js';
import type { LLMClient } from './client.js';
import { OllamaClient } from './ollama.js';

let _client: LLMClient | null = null;

export function getLLMClient(): LLMClient {
  if (!_client) {
    if (env.LLM_PROVIDER === 'ollama') {
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
