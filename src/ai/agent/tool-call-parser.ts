import type { CopilotToolCall } from './copilot-agent-types.js';

function normalizeText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized || null;
}

function normalizeArguments(value: unknown): unknown {
  if (typeof value !== 'string') return value;

  const text = value.trim();
  if (!text) return {};

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

export interface ParsedToolCall {
  readonly ok: true;
  readonly call: CopilotToolCall;
}

export interface InvalidToolCall {
  readonly ok: false;
  readonly error: string;
}

export type ToolCallParseResult = ParsedToolCall | InvalidToolCall;

export function parseToolCall(
  value: unknown,
): ToolCallParseResult {
  if (!value || typeof value !== 'object') {
    return {
      ok: false,
      error: 'Tool call must be an object.',
    };
  }

  const record = value as Record<string, unknown>;
  const id = normalizeText(record.id);
  const name = normalizeText(record.name);

  if (!id) {
    return {
      ok: false,
      error: 'Tool call id is required.',
    };
  }

  if (!name) {
    return {
      ok: false,
      error: 'Tool call name is required.',
    };
  }

  const args = normalizeArguments(record.arguments);

  if (args === null) {
    return {
      ok: false,
      error: `Tool call arguments are not valid JSON: ${name}`,
    };
  }

  return {
    ok: true,
    call: {
      id,
      name,
      arguments: args,
    },
  };
}

export function parseToolCalls(
  values: readonly unknown[] | undefined,
): {
  readonly calls: readonly CopilotToolCall[];
  readonly errors: readonly string[];
} {
  const calls: CopilotToolCall[] = [];
  const errors: string[] = [];

  for (const value of values ?? []) {
    const parsed = parseToolCall(value);
    if (parsed.ok) {
      calls.push(parsed.call);
    } else {
      errors.push(parsed.error);
    }
  }

  return { calls, errors };
}
