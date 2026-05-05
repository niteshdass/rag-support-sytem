import type { LLMClient, LLMGenerateOptions } from './client.js';

interface OllamaChatResponse {
  message: { content: string };
}

export class OllamaClient implements LLMClient {
  constructor(
    private readonly baseUrl: string,
    private readonly model: string,
  ) {}

  async generate(options: LLMGenerateOptions): Promise<string> {
    const resp = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        messages: options.messages,
        stream: false,
        options: {
          temperature: options.temperature ?? 0.7,
          num_predict: options.maxTokens ?? 2048,
        },
      }),
    });

    if (!resp.ok) {
      throw new Error(`Ollama request failed: ${resp.status} ${resp.statusText}`);
    }

    const data = (await resp.json()) as OllamaChatResponse;
    return data.message.content;
  }
}
