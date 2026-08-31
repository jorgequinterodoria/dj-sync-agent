import { randomUUID } from 'node:crypto';

import type {
  AICompletionResponse,
} from '../ai/ai-provider.js';
import type {
  DJSyncAIService,
} from '../runtime/dj-sync-ai-service.js';
import type {
  DJReasoningContext,
  DJReasoningDecision,
  DJReasoningEvidence,
  DJReasoningPriority,
  DJReasoningResult,
} from './reasoning-types.js';
import {
  buildDJReasoningPrompt,
  DJ_REASONING_SYSTEM_PROMPT,
} from './reasoning-prompt.js';

export const DJ_REASONING_ENGINE_VERSION = '1.0.0';

export interface DJReasoningEngine {
  reason(
    context: DJReasoningContext,
  ): Promise<DJReasoningResult>;
}

export interface DJReasoningEngineOptions {
  ai: DJSyncAIService;
  model: string;
  now?: () => string;
  id?: () => string;
}

interface RawReasoningResponse {
  priority?: unknown;
  summary?: unknown;
  decisions?: unknown;
  constraints?: unknown;
  evidence?: unknown;
  confidence?: unknown;
}

function clampConfidence(value: unknown): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(1, numeric));
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function parsePriority(value: unknown): DJReasoningPriority {
  return value === 'low' || value === 'high' ? value : 'normal';
}

function parseDecision(value: unknown): DJReasoningDecision | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const type = row.type;
  const subject = asString(row.subject);
  const rationale = asString(row.rationale);
  if (
    type !== 'keep' &&
    type !== 'prefer' &&
    type !== 'avoid' &&
    type !== 'suggest' &&
    type !== 'investigate'
  ) {
    return null;
  }
  if (!subject || !rationale) return null;
  return {
    type,
    subject,
    rationale,
    confidence: clampConfidence(row.confidence),
  };
}

function parseEvidence(value: unknown): DJReasoningEvidence | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const source = row.source;
  const key = asString(row.key);
  if (
    source !== 'track' &&
    source !== 'intelligence' &&
    source !== 'memory' &&
    source !== 'user'
  ) {
    return null;
  }
  if (!key) return null;
  return {
    source,
    key,
    value: row.value ?? null,
    weight: clampConfidence(row.weight),
  };
}

function parseJson(text: string): RawReasoningResponse {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const source = fenced?.[1]?.trim() ?? trimmed;
  const parsed: unknown = JSON.parse(source);
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('AI reasoning response must be a JSON object.');
  }
  return parsed as RawReasoningResponse;
}

function buildResult(
  context: DJReasoningContext,
  response: AICompletionResponse,
  raw: RawReasoningResponse,
  now: string,
  reasoningId: string,
): DJReasoningResult {
  const decisions = Array.isArray(raw.decisions)
    ? raw.decisions.map(parseDecision).filter((value): value is DJReasoningDecision => value !== null)
    : [];

  const evidence = Array.isArray(raw.evidence)
    ? raw.evidence.map(parseEvidence).filter((value): value is DJReasoningEvidence => value !== null)
    : [];

  const summary = asString(raw.summary);
  if (!summary) {
    throw new Error('AI reasoning response requires a summary.');
  }

  const constraints = Array.isArray(raw.constraints)
    ? raw.constraints
        .filter((value): value is string => typeof value === 'string')
        .map((value) => value.trim())
        .filter(Boolean)
    : [];

  return {
    schemaVersion: 1,
    engineVersion: DJ_REASONING_ENGINE_VERSION,
    reasoningId,
    generatedAt: now,
    trackId: context.trackId,
    priority: parsePriority(raw.priority),
    summary,
    decisions,
    constraints,
    evidence,
    confidence: clampConfidence(raw.confidence),
    model: response.model,
    provider: response.provider,
  };
}

export function createDJReasoningEngine(
  options: DJReasoningEngineOptions,
): DJReasoningEngine {
  const now = options.now ?? (() => new Date().toISOString());
  const createId = options.id ?? randomUUID;

  return {
    async reason(context) {
      const trackId = context.trackId.trim();
      const userRequest = context.userRequest.trim();
      if (!trackId) {
        throw new Error('DJ reasoning track id is required.');
      }
      if (!userRequest) {
        throw new Error('DJ reasoning user request is required.');
      }

      const response = await options.ai.complete({
        model: options.model,
        messages: [
          {
            role: 'system',
            content: DJ_REASONING_SYSTEM_PROMPT,
          },
          {
            role: 'user',
            content: buildDJReasoningPrompt({
              ...context,
              trackId,
              userRequest,
            }),
          },
        ],
        temperature: 0,
        maxTokens: 1400,
      });

      const raw = parseJson(response.text);

      return buildResult(
        {
          ...context,
          trackId,
          userRequest,
        },
        response,
        raw,
        now(),
        createId(),
      );
    },
  };
}
