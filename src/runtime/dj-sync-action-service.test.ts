import assert from 'node:assert/strict';
import test from 'node:test';

import type { DJReasoningResult } from '../reasoning/reasoning-types.js';
import {
  createDJSyncActionService,
} from './dj-sync-action-service.js';

const reasoning: DJReasoningResult = {
  schemaVersion: 1,
  engineVersion: '1.0.0',
  reasoningId: 'reason-1',
  generatedAt: '2026-08-27T00:00:00.000Z',
  trackId: 'track-1',
  priority: 'normal',
  summary: 'Refresh the intelligence before continuing.',
  decisions: [
    {
      type: 'prefer',
      subject: 'track-1',
      rationale: 'Good candidate.',
      confidence: 0.8,
    },
  ],
  constraints: [],
  evidence: [],
  confidence: 0.8,
  model: 'test-model',
  provider: 'openai',
};

test('action service is disabled without an engine', () => {
  const service = createDJSyncActionService({ engine: null });
  assert.equal(service.snapshot().configured, false);
  assert.equal(service.snapshot().status, 'disabled');
});

test('action service derives actions', () => {
  const service = createDJSyncActionService({
    engine: {
      deriveFromReasoning() {
        return [
          {
            schemaVersion: 1,
            actionId: 'action-1',
            engineVersion: '1.0.0',
            type: 'intelligence.refresh',
            risk: 'safe',
            requiresApproval: false,
            deviceId: 'device-1',
            trackId: 'track-1',
            input: {},
            rationale: 'Refresh intelligence.',
            confidence: 0.8,
            createdAt: '2026-08-27T00:00:00.000Z',
          },
        ];
      },
      async execute() {
        return {
          schemaVersion: 1,
          actionId: 'action-1',
          actionType: 'intelligence.refresh',
          status: 'completed',
          output: {},
          error: null,
          startedAt: '2026-08-27T00:00:00.000Z',
          completedAt: '2026-08-27T00:00:01.000Z',
        };
      },
    },
  });

  const actions = service.derive(
    {
      deviceId: 'device-1',
      trackId: 'track-1',
      request: 'Prepare.',
    },
    reasoning,
  );

  assert.equal(actions.length, 1);
  assert.equal(service.snapshot().lastActionCount, 1);
});

test('action service persists execution result', async () => {
  let saved = false;

  const action = {
    schemaVersion: 1 as const,
    actionId: 'action-1',
    engineVersion: '1.0.0',
    type: 'intelligence.refresh' as const,
    risk: 'safe' as const,
    requiresApproval: false,
    deviceId: 'device-1',
    trackId: 'track-1',
    input: { request: 'Prepare.' },
    rationale: 'Refresh intelligence.',
    confidence: 0.8,
    createdAt: '2026-08-27T00:00:00.000Z',
  };

  const service = createDJSyncActionService({
    engine: {
      deriveFromReasoning() {
        return [action];
      },
      async execute() {
        return {
          schemaVersion: 1,
          actionId: action.actionId,
          actionType: action.type,
          status: 'completed',
          output: { ok: true },
          error: null,
          startedAt: '2026-08-27T00:00:00.000Z',
          completedAt: '2026-08-27T00:00:01.000Z',
        };
      },
    },
    repository: {
      async save(input) {
        saved = true;
        assert.equal(input.deviceId, 'device-1');
        assert.equal(input.trackId, 'track-1');
        return {
          id: 1,
          deviceId: input.deviceId,
          trackId: input.trackId,
          actionId: input.action.actionId,
          actionType: input.action.type,
          risk: input.action.risk,
          approved: true,
          request: input.request,
          input: input.action.input,
          result: input.result,
          createdAt: '2026-08-27T00:00:01.000Z',
        };
      },
    },
  });

  const result = await service.execute(action);

  assert.equal(result.status, 'completed');
  assert.equal(saved, true);
  assert.equal(service.snapshot().status, 'ready');
});
