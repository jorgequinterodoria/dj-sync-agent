import type { ContextBudget } from './copilot-context-types.js';

export const DEFAULT_CONTEXT_BUDGET: ContextBudget = {
  maxMessages: 12,
  maxCandidates: 12,
  maxHistory: 12,
  maxMemoryResults: 8,
  maxContextChars: 24_000,
};

function positiveInteger(
  value: number,
  fallback: number,
): number {
  return Number.isInteger(value) && value > 0
    ? value
    : fallback;
}

export function normalizeContextBudget(
  budget: Partial<ContextBudget> | undefined,
): ContextBudget {
  return {
    maxMessages: positiveInteger(
      budget?.maxMessages ?? 0,
      DEFAULT_CONTEXT_BUDGET.maxMessages,
    ),
    maxCandidates: positiveInteger(
      budget?.maxCandidates ?? 0,
      DEFAULT_CONTEXT_BUDGET.maxCandidates,
    ),
    maxHistory: positiveInteger(
      budget?.maxHistory ?? 0,
      DEFAULT_CONTEXT_BUDGET.maxHistory,
    ),
    maxMemoryResults: positiveInteger(
      budget?.maxMemoryResults ?? 0,
      DEFAULT_CONTEXT_BUDGET.maxMemoryResults,
    ),
    maxContextChars: positiveInteger(
      budget?.maxContextChars ?? 0,
      DEFAULT_CONTEXT_BUDGET.maxContextChars,
    ),
  };
}

export function truncateByBudget<T>(
  items: readonly T[],
  limit: number,
): {
  readonly items: readonly T[];
  readonly truncated: boolean;
} {
  const sliced = items.slice(0, limit);

  return {
    items: sliced,
    truncated: sliced.length < items.length,
  };
}

export function estimateJsonChars(
  value: unknown,
): number {
  return JSON.stringify(value).length;
}

export function fitSerializedContext<T extends object>(
  value: T,
  maxChars: number,
): T {
  const serialized = JSON.stringify(value);

  if (serialized.length <= maxChars) {
    return value;
  }

  const record = {
    ...value,
  };

  return record;
}
