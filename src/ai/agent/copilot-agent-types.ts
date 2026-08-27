import type { ToolRegistry } from '../tools/tool-registry.js';
import type { ToolResult } from '../tools/tool-types.js';
import type { ToolExecutionContext } from '../tools/tool-types.js';

export interface CopilotMessage {
  readonly role: 'system' | 'user' | 'assistant' | 'tool';
  readonly content: string;
  readonly toolCallId?: string;
  readonly toolName?: string;
}

export interface CopilotToolCall {
  readonly id: string;
  readonly name: string;
  readonly arguments: unknown;
}

export interface CopilotModelResponse {
  readonly content: string;
  readonly toolCalls?: readonly CopilotToolCall[];
}

export interface CopilotModelRequest {
  readonly messages: readonly CopilotMessage[];
  readonly tools: readonly {
    readonly name: string;
    readonly description: string;
    readonly inputSchema: unknown;
  }[];
}

export interface CopilotModel {
  generate(
    request: CopilotModelRequest,
    signal: AbortSignal,
  ): Promise<CopilotModelResponse>;
}

export interface CopilotAgentOptions {
  readonly model: CopilotModel;
  readonly registry: ToolRegistry;
  readonly toolContext: Omit<ToolExecutionContext, 'signal'>;
  readonly systemPrompt?: string;
  readonly maxToolCalls?: number;
  readonly maxTurns?: number;
  readonly timeoutMs?: number;
}

export interface CopilotAgentRunInput {
  readonly userMessage: string;
  readonly signal?: AbortSignal;
}

export interface CopilotToolExecution {
  readonly id: string;
  readonly name: string;
  readonly result: ToolResult;
}

export interface CopilotAgentRunResult {
  readonly response: string;
  readonly messages: readonly CopilotMessage[];
  readonly toolExecutions: readonly CopilotToolExecution[];
  readonly turns: number;
}

export interface CopilotAgentError {
  readonly code:
    | 'invalid_request'
    | 'timeout'
    | 'tool_limit'
    | 'turn_limit'
    | 'model_error';
  readonly message: string;
}
