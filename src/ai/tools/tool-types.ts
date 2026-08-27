import type { z } from 'zod';

export type ToolRisk = 'read' | 'write' | 'execute';

export interface ToolExecutionContext {
  readonly deviceId: string;
  readonly signal?: AbortSignal;
  readonly now: () => string;
  readonly requestId: string;
}

export interface ToolDefinition<
  TSchema extends z.ZodTypeAny = z.ZodTypeAny,
  TResult = unknown,
> {
  readonly name: string;
  readonly description: string;
  readonly risk: ToolRisk;
  readonly inputSchema: TSchema;
  readonly timeoutMs: number;
  readonly execute: (
    input: z.output<TSchema>,
    context: ToolExecutionContext,
  ) => Promise<TResult>;
}

export interface ToolSuccess<TResult = unknown> {
  readonly ok: true;
  readonly tool: string;
  readonly requestId: string;
  readonly result: TResult;
}

export interface ToolFailure {
  readonly ok: false;
  readonly tool: string;
  readonly requestId: string;
  readonly error: {
    readonly code:
      | 'invalid_input'
      | 'not_allowed'
      | 'timeout'
      | 'execution_failed';
    readonly message: string;
  };
}

export type ToolResult<TResult = unknown> =
  | ToolSuccess<TResult>
  | ToolFailure;

export type AnyToolDefinition = ToolDefinition<any, unknown>;

export interface ToolRegistryOptions {
  readonly allowedTools?: readonly string[];
  readonly defaultTimeoutMs?: number;
  readonly now?: () => string;
}
