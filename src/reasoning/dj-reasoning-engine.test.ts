import assert from 'node:assert/strict';
import test from 'node:test';

import type { AICompletionResponse } from '../ai/ai-provider.js';
import type { DJSyncAIService } from '../runtime/dj-sync-ai-service.js';
import {
  createDJReasoningEngine,
} from './dj-reasoning-engine.js';

function createAI(responseText: string): DJSyncAIService {
  const response: AICompletionResponse = {
    provider: 'openai',
    model: 'test-model',
    text: responseText,
    finishReason: 'stop',
    usage: {
      inputTokens: 10,
      outputTokens: 20,
      totalTokens: 30,
    },
  };

  return {
    snapshot() {
      return {
        configured: true,
        provider: 'openai',
        status: 'ready',
        lastRequestAt: null,
        lastResponseAt: null,
        lastError: null,
      };
    },
    async complete() {
      return response;
    },
  };
}

test('reasoning engine produces versioned structured reasoning', async () => {
  const engine = createDJReasoningEngine({
    model: 'test-model',
    ai: createAI(
      JSON.stringify({
        priority: 'high',
        summary: 'Prefer this track for the current set.',
        decisions: [
          {
            type: 'prefer',
            subject: 'track-1',
            rationale: 'Strong energy and compatible tempo.',
            confidence: 0.92,
          },
        ],
        constraints: ['Do not repeat the artist within four tracks.'],
        evidence: [
          {
            source: 'intelligence',
            key: 'tempoBand',
            value: 'fast',
            weight: 0.8,
          },
        ],
        confidence: 0.9,
      }),
    ),
    now: () => '2026-08-27T15:00:00.000Z',
    id: () => 'reason-1',
  });

  const result = await engine.reason({
    deviceId: 'device-1',
    trackId: ' track-1 ',
    profile: {
      dj: { tempoBand: 'fast' },
    },
    userRequest: 'Choose this track for the next transition.',
  });

  assert.equal(result.schemaVersion, 1);
  assert.equal(result.engineVersion, '1.0.0');
  assert.equal(result.reasoningId, 'reason-1');
  assert.equal(result.priority, 'high');
  assert.equal(result.decisions.length, 1);
  assert.equal(result.constraints.length, 1);
  assert.equal(result.evidence.length, 1);
  assert.equal(result.confidence, 0.9);
});

test('reasoning engine accepts fenced JSON', async () => {
  const engine = createDJReasoningEngine({
    model: 'test-model',
    ai: createAI(
      '```json\n{"summary":"Keep it","priority":"normal","decisions":[],"constraints":[],"evidence":[],"confidence":0.5}\n```',
    ),
  });

  const result = await engine.reason({
    trackId: 'track-1',
    profile: {},
    userRequest: 'Keep or avoid?',
  });

  assert.equal(result.summary, 'Keep it');
});

test('reasoning engine rejects empty track ids', async () => {
  const engine = createDJReasoningEngine({ model: 'test-model', ai: createAI('{}') });
  await assert.rejects(
    () => engine.reason({ trackId: '   ', profile: {}, userRequest: 'test' }),
    /track id is required/,
  );
});

test('reasoning engine rejects empty requests', async () => {
  const engine = createDJReasoningEngine({ model: 'test-model', ai: createAI('{}') });
  await assert.rejects(
    () => engine.reason({ trackId: 'track-1', profile: {}, userRequest: '   ' }),
    /user request is required/,
  );
});

test('reasoning engine rejects malformed JSON', async () => {
  const engine = createDJReasoningEngine({ model: 'test-model', ai: createAI('not-json') });
  await assert.rejects(
    () => engine.reason({ trackId: 'track-1', profile: {}, userRequest: 'test' }),
    SyntaxError,
  );
});

test('reasoning engine requires a summary', async () => {
  const engine = createDJReasoningEngine({
    model: 'test-model',
    ai: createAI(
      '{"priority":"normal","decisions":[],"constraints":[],"evidence":[],"confidence":0.1}',
    ),
  });
  await assert.rejects(
    () => engine.reason({ trackId: 'track-1', profile: {}, userRequest: 'test' }),
    /requires a summary/,
  );
});
