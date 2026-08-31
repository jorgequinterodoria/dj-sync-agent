import assert from 'node:assert/strict';
import test from 'node:test';

import type { DJReasoningResult } from '../reasoning/reasoning-types.js';
import {
  createCopilotActionEngine,
} from './action-engine.js';
import { validateCopilotAction } from './action-validator.js';
import type { CopilotAction } from './action-types.js';

const reasoning: DJReasoningResult = {
  schemaVersion: 1,
  engineVersion: '1.0.0',
  reasoningId: 'reason-1',
  generatedAt: '2026-08-27T00:00:00.000Z',
  trackId: 'track-1',
  priority: 'high',
  summary: 'Keep the track available for the next decision.',
  decisions: [
    {
      type: 'prefer',
      subject: 'track-1',
      rationale: 'Compatible tempo and strong metadata.',
      confidence: 0.92,
    },
    {
      type: 'investigate',
      subject: 'track-1',
      rationale: 'Refresh local audio analysis before final selection.',
      confidence: 0.8,
    },
  ],
  constraints: [],
  evidence: [],
  confidence: 0.9,
  model: 'test-model',
  provider: 'openai',
};

test('action engine derives validated actions from reasoning', () => {
  const engine = createCopilotActionEngine({
    executor: {
      async execute() {
        return {};
      },
    },
    now: () => '2026-08-27T00:00:00.000Z',
    id: (() => {
      let value = 0;
      return () => `action-${++value}`;
    })(),
  });

  const actions = engine.deriveFromReasoning(
    {
      deviceId: 'device-1',
      trackId: 'track-1',
      request: 'Prepare this track.',
    },
    reasoning,
  );

  assert.equal(actions.length, 2);
  assert.equal(actions[0]?.type, 'intelligence.refresh');
  assert.equal(actions[1]?.type, 'audio.analyze');
  assert.equal(actions.every((action) => action.requiresApproval === false), true);
});

test('action engine executes safe actions', async () => {
  let executions = 0;
  const engine = createCopilotActionEngine({
    executor: {
      async execute(action) {
        executions += 1;
        return { type: action.type };
      },
    },
    now: () => '2026-08-27T00:00:00.000Z',
  });

  const action = engine.deriveFromReasoning(
    {
      deviceId: 'device-1',
      trackId: 'track-1',
      request: 'Prepare.',
    },
    reasoning,
  )[0]!;

  const result = await engine.execute(action);

  assert.equal(result.status, 'completed');
  assert.deepEqual(result.output, { type: 'intelligence.refresh' });
  assert.equal(executions, 1);
});

test('action engine rejects review-required actions without approval', async () => {
  const engine = createCopilotActionEngine({
    executor: {
      async execute() {
        throw new Error('must not execute');
      },
    },
  });

  const action: CopilotAction = {
    schemaVersion: 1,
    actionId: 'action-1',
    engineVersion: '1.0.0',
    type: 'memory.index',
    risk: 'review_required',
    requiresApproval: true,
    deviceId: 'device-1',
    trackId: 'track-1',
    input: {},
    rationale: 'Requires operator approval.',
    confidence: 0.8,
    createdAt: '2026-08-27T00:00:00.000Z',
  };

  const result = await engine.execute(action);

  assert.equal(result.status, 'rejected');
  assert.equal(result.error, 'approval_required');
});

test('validator rejects unsafe approval configuration', () => {
  assert.throws(
    () =>
      validateCopilotAction({
        schemaVersion: 1,
        actionId: 'action-1',
        engineVersion: '1.0.0',
        type: 'audio.analyze',
        risk: 'review_required',
        requiresApproval: false,
        deviceId: 'device-1',
        trackId: 'track-1',
        input: {},
        rationale: 'Invalid.',
        confidence: 0.5,
        createdAt: '2026-08-27T00:00:00.000Z',
      }),
    /must require approval/,
  );
});
