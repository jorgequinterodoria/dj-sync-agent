import type { z } from 'zod';
import type {
  ToolDefinition,
  ToolExecutionContext,
  ToolRegistryOptions,
  ToolResult,
} from './tool-types.js';

const DEFAULT_TIMEOUT_MS = 15_000;

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<T> {
  if (signal?.aborted) {
    return Promise.reject(new Error('Tool execution aborted.'));
  }

  return new Promise<T>((resolve, reject) => {
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error('Tool execution timed out.'));
    }, timeoutMs);

    const onAbort = (): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error('Tool execution aborted.'));
    };

    signal?.addEventListener('abort', onAbort, { once: true });

    promise.then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error: unknown) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
        reject(error);
      },
    );
  });
}

export class ToolRegistry {
  private readonly tools = new Map<string, ToolDefinition>();
  private readonly allowedTools: Set<string> | null;
  private readonly defaultTimeoutMs: number;
  private readonly now: () => string;

  public constructor(options: ToolRegistryOptions = {}) {
    this.allowedTools = options.allowedTools
      ? new Set(options.allowedTools)
      : null;
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.now = options.now ?? (() => new Date().toISOString());
  }

  public register<TSchema extends z.ZodTypeAny, TResult>(
    definition: ToolDefinition<TSchema, TResult>,
  ): void {
    const name = definition.name.trim();
    if (!name) throw new Error('Tool name is required.');
    if (this.tools.has(name)) {
      throw new Error(`Tool already registered: ${name}`);
    }
    if (definition.timeoutMs <= 0) {
      throw new Error(`Tool timeout must be positive: ${name}`);
    }

    this.tools.set(name, definition);
  }

  public has(name: string): boolean {
    return this.tools.has(name);
  }

  public list(): readonly ToolDefinition[] {
    return [...this.tools.values()].sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }

  public async execute(
    name: string,
    rawInput: unknown,
    context: ToolExecutionContext,
  ): Promise<ToolResult> {
    const requestId = context.requestId.trim();
    if (!requestId) {
      throw new Error('Tool requestId is required.');
    }

    if (!context.deviceId.trim()) {
      throw new Error('Tool deviceId is required.');
    }

    const tool = this.tools.get(name);
    if (!tool) {
      return {
        ok: false,
        tool: name,
        requestId,
        error: {
          code: 'execution_failed',
          message: `Unknown tool: ${name}`,
        },
      };
    }

    if (this.allowedTools && !this.allowedTools.has(name)) {
      return {
        ok: false,
        tool: name,
        requestId,
        error: {
          code: 'not_allowed',
          message: `Tool is not allowed: ${name}`,
        },
      };
    }

    const parsed = tool.inputSchema.safeParse(rawInput);
    if (!parsed.success) {
      return {
        ok: false,
        tool: name,
        requestId,
        error: {
          code: 'invalid_input',
          message: parsed.error.message,
        },
      };
    }

    const timeoutMs = Math.min(
      tool.timeoutMs,
      this.defaultTimeoutMs > 0 ? this.defaultTimeoutMs : tool.timeoutMs,
    );

    try {
      const result = await withTimeout(
        tool.execute(parsed.data, context),
        timeoutMs,
        context.signal,
      );

      return {
        ok: true,
        tool: name,
        requestId,
        result,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      const code = /timed out/i.test(message)
        ? 'timeout'
        : 'execution_failed';

      return {
        ok: false,
        tool: name,
        requestId,
        error: { code, message },
      };
    }
  }
}

export function createToolRegistry(
  options: ToolRegistryOptions = {},
): ToolRegistry {
  return new ToolRegistry(options);
}
