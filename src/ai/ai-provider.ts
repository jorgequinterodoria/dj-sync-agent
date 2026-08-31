export type AIProviderId =
  | 'openai'
  | 'anthropic'
  | 'openai-compatible';

export type AIMessageRole =
  | 'system'
  | 'user'
  | 'assistant';

export interface AIMessage {
  role: AIMessageRole;
  content: string;
}

export interface AICompletionRequest {
  messages: AIMessage[];
  model: string;
  temperature?: number;
  maxTokens?: number;
}

export interface AICompletionUsage {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
}

export interface AICompletionResponse {
  provider: AIProviderId;
  model: string;
  text: string;
  finishReason: string | null;
  usage: AICompletionUsage;
}

export interface AIProvider {
  readonly id: AIProviderId;
  complete(request: AICompletionRequest): Promise<AICompletionResponse>;
}
