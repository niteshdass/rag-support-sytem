import type { LLMClient, LLMGenerateOptions } from './client.js';

interface GroqMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface GroqChatResponse {
  choices: Array<{ message: { content: string } }>;
}

export class GroqClient implements LLMClient {
  constructor(
    private readonly apiKey: string,
    private readonly model: string = 'llama-3.1-8b-instant',
  ) {}

  async generate(options: LLMGenerateOptions): Promise<string> {
    const messages: GroqMessage[] = options.messages.map(m => ({
      role: m.role,
      content: m.content,
    }));

    const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens ?? 2048,
      }),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => resp.statusText);
      throw new Error(`Groq request failed: ${resp.status} ${text}`);
    }

    const data = (await resp.json()) as GroqChatResponse;
    return data.choices[0]!.message.content;
  }
}
