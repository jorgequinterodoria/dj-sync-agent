import assert from 'node:assert/strict';
import test from 'node:test';

import type { DJReasoningEngine } from '../reasoning/dj-reasoning-engine.js';
import type { DJReasoningResult } from '../reasoning/reasoning-types.js';
import {
  createDJSyncReasoningService,
} from './dj-sync-reasoning-service.js';

function result(): DJReasoningResult {
  return {
    schemaVersion: 1,
    engineVersion: '1.0.0',
    reasoningId: 'reason-1',
    generatedAt: '2026-08-27T00:00:00.000Z',
    trackId: 'track-1',
    priority: 'normal',
    summary: 'Use this track.',
    decisions: [],
    constraints: [],
    evidence: [],
    confidence: 0.8,
    model: 'test-model',
    provider: 'openai',
  };
}

test('reasoning service reports disabled without an engine', () => {
  const service = createDJSyncReasoningService({ engine: null });
  const snapshot = service.snapshot();
  assert.equal(snapshot.configured, false);
  assert.equal(snapshot.status, 'disabled');
});

test('reasoning service delegates reasoning', async () => {
  const engine: DJReasoningEngine = {
    async reason(input) {
      assert.equal(input.trackId, 'track-1');
      return result();
    },
  };

  const service = createDJSyncReasoningService({ engine });
  const value = await service.reason({
    deviceId: 'device-1',
    trackId: 'track-1',
    profile: {},
    userRequest: 'Choose this track.',
  });

  assert.equal(value.reasoningId, 'reason-1');
  assert.equal(service.snapshot().status, 'ready');
  assert.ok(service.snapshot().lastReasonedAt);
});

test('reasoning service propagates engine failures', async () => {
  const service = createDJSyncReasoningService({
    engine: {
      async reason() {
        throw new Error('reasoning failed');
      },
    },
  });

  await assert.rejects(
    () => service.reason({ deviceId: 'device-1', trackId: 'track-1', profile: {}, userRequest: 'test' }),
    /reasoning failed/,
  );

  assert.equal(service.snapshot().status, 'error');
  assert.equal(service.snapshot().lastError, 'reasoning failed');
});


test('reasoning service requires a device id for persistence', async () => {
  const service = createDJSyncReasoningService({
    engine: {
      async reason() {
        return result();
      },
    },
    repository: {
      async save() {
        throw new Error('should not save');
      },
    },
  });

  await assert.rejects(
    () => service.reason({ trackId: 'track-1', profile: {}, userRequest: 'test' }),
    /requires a device id/,
  );
});

test('reasoning service saves results when repository is available', async () => {
  let saved = false;
  const service = createDJSyncReasoningService({
    engine: {
      async reason() {
        return result();
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
          reasoningId: input.result.reasoningId,
          engineVersion: input.result.engineVersion,
          model: input.result.model,
          provider: input.result.provider,
          request: input.request,
          result: input.result,
          createdAt: '2026-08-27T00:00:00.000Z',
        };
      },
    },
  });

  await service.reason({
    deviceId: 'device-1',
    trackId: 'track-1',
    profile: {},
    userRequest: 'test',
  });

  assert.equal(saved, true);
  assert.ok(service.snapshot().lastSavedAt);
});
