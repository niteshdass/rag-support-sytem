export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMGenerateOptions {
  messages: LLMMessage[];
  temperature?: number;
  maxTokens?: number;
}

export interface LLMClient {
  generate(options: LLMGenerateOptions): Promise<string>;
}
