import assert from 'node:assert/strict';
import test from 'node:test';

import { createAutonomousOrchestrator } from './autonomous-copilot.js';

const context = {
  deviceId: 'device-1',
  trackId: 'track-1',
  trigger: 'manual' as const,
  requestedAt: '2026-08-27T00:00:00.000Z',
};

test('autonomous orchestrator executes the full pipeline in order', async () => {
  const calls: string[] = [];
  const orchestrator = createAutonomousOrchestrator({
    sync: async () => { calls.push('sync'); return { ok: true }; },
    analysis: async () => { calls.push('analysis'); return { ok: true }; },
    intelligence: async () => { calls.push('intelligence'); return { ok: true }; },
    memory: async () => { calls.push('memory'); return { ok: true }; },
    reasoning: async () => { calls.push('reasoning'); return { ok: true }; },
    recommendation: async () => { calls.push('recommendation'); return { ok: true }; },
    personalization: async () => { calls.push('personalization'); return { ok: true }; },
    action: async () => { calls.push('action'); return { ok: true }; },
  });

  const result = await orchestrator.run(context);

  assert.deepEqual(calls, [
    'sync',
    'analysis',
    'intelligence',
    'memory',
    'reasoning',
    'recommendation',
    'personalization',
    'action',
  ]);
  assert.equal(result.completed, true);
  assert.equal(result.failedStage, null);
  assert.equal(result.stages.length, 8);
});

test('autonomous orchestrator stops at the first failed stage', async () => {
  const calls: string[] = [];
  const orchestrator = createAutonomousOrchestrator({
    sync: async () => { calls.push('sync'); return null; },
    analysis: async () => { calls.push('analysis'); throw new Error('analysis failed'); },
    intelligence: async () => { calls.push('intelligence'); return null; },
  });

  const result = await orchestrator.run(context);

  assert.deepEqual(calls, ['sync', 'analysis']);
  assert.equal(result.completed, false);
  assert.equal(result.failedStage, 'analysis');
  assert.equal(result.stages.at(-1)?.error, 'analysis failed');
});

test('missing stage executors are explicitly skipped', async () => {
  const orchestrator = createAutonomousOrchestrator({});

  const result = await orchestrator.run(context);

  assert.equal(result.completed, true);
  assert.equal(result.stages.length, 8);
  assert.equal(result.stages.every((stage) => stage.skipped === true), true);
});

test('stage failures preserve completed predecessor results', async () => {
  const orchestrator = createAutonomousOrchestrator({
    sync: async () => 'sync-output',
    analysis: async () => 'analysis-output',
    intelligence: async () => 'intelligence-output',
    memory: async () => { throw new Error('memory failed'); },
  });

  const result = await orchestrator.run(context);

  assert.equal(result.stages[0]?.output, 'sync-output');
  assert.equal(result.stages[1]?.output, 'analysis-output');
  assert.equal(result.stages[2]?.output, 'intelligence-output');
  assert.equal(result.failedStage, 'memory');
});
