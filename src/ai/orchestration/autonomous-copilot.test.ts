import assert from 'node:assert/strict';
import test from 'node:test';
import { createAutonomousCopilot } from './autonomous-copilot.js';

function context() {
  return {
    schemaVersion: 1 as const,
    request: { userMessage: 'prepare set' },
    conversation: { summary: null, recentMessages: [], constraints: [] },
    track: null,
    library: { candidates: [] },
    history: { recentPlays: [] },
    intelligence: {},
    personalization: {},
    semantic: { results: [] },
    truncated: [],
    estimatedChars: 1,
  };
}

function readPlan() {
  return {
    schemaVersion: 1 as const,
    requiresApproval: false,
    steps: [{
      id: 'read', tool: 'library.search', arguments: {}, reason: 'Read candidates.', dependsOn: [], risk: 'read' as const,
    }],
  };
}

function actionPlan() {
  return {
    schemaVersion: 1 as const,
    requiresApproval: true,
    steps: [{
      id: 'action', tool: 'playlist.add', arguments: {
        type: 'playlist.add', playlistId: 'playlist-1', trackId: 'track-1',
      }, reason: 'Add the selected track.', dependsOn: [], risk: 'write' as const,
    }],
  };
}

test('autonomous copilot executes read plan', async () => {
  const copilot = createAutonomousCopilot({
    contextProvider: { async build() { return context(); } },
    planner: { async plan() { return readPlan(); } },
    reads: { async execute() { return { items: ['track-1'] }; } },
    actionMapper: { validate() { throw new Error('unused'); } },
    actions: {
      prepare() { throw new Error('unused'); },
      approve() { throw new Error('unused'); },
      reject() { throw new Error('unused'); },
      async execute() { throw new Error('unused'); },
    },
  });

  const result = await copilot.run({
    requestId: 'request-1', deviceId: 'device-1', userMessage: 'prepare set',
  });

  assert.equal(result.status, 'completed');
  assert.deepEqual(result.state.completedStepIds, ['read']);
});

test('autonomous copilot suspends writes, blocks duplicate request, and resumes once approved', async () => {
  let executions = 0;

  const pendingPreview = {
    id: 'preview-1',
    action: { type: 'playlist.add', playlistId: 'playlist-1', trackId: 'track-1' },
    reason: 'Add track.',
    risk: 'write' as const,
    affectedResources: ['track:track-1'],
    reversible: true,
    actionHash: 'hash-1',
  };

  const copilot = createAutonomousCopilot({
    contextProvider: { async build() { return context(); } },
    planner: { async plan() { return actionPlan(); } },
    reads: { async execute() { return null; } },
    actionMapper: {
      validate() {
        return {
          action: actionPlan().steps[0]!.arguments as never,
          actionHash: 'hash-1',
          affectedResources: ['track:track-1'],
          reversible: true,
        };
      },
    },
    actions: {
      prepare() {
        return {
          preview: pendingPreview,
          approval: {
            status: 'pending' as const,
            approvalId: 'approval-1', previewId: 'preview-1', actionHash: 'hash-1',
            deviceId: 'device-1', requestId: 'request-1',
            issuedAt: '2026-08-27T00:00:00Z', expiresAt: '2026-08-27T00:05:00Z',
          },
        };
      },
      approve() {
        return {
          status: 'approved' as const,
          approvalId: 'approval-1', previewId: 'preview-1', actionHash: 'hash-1',
          deviceId: 'device-1', requestId: 'request-1',
          issuedAt: '2026-08-27T00:00:00Z', expiresAt: '2026-08-27T00:05:00Z',
          token: 'token-1',
        };
      },
      reject() { throw new Error('unused'); },
      async execute() {
        executions += 1;
        return { ok: true };
      },
    },
  });

  const first = await copilot.run({
    requestId: 'request-1', deviceId: 'device-1', userMessage: 'prepare set',
  });

  assert.equal(first.status, 'awaiting_approval');

  await assert.rejects(
    copilot.run({ requestId: 'request-1', deviceId: 'device-1', userMessage: 'duplicate' }),
    /already active or awaiting approval/i,
  );

  const resumed = await copilot.approveAndResume({
    request: { requestId: 'request-1', deviceId: 'device-1', userMessage: 'prepare set' },
    pendingAction: first.pendingAction!,
  });

  assert.equal(resumed.status, 'completed');
  assert.equal(executions, 1);
});

test('autonomous copilot can reject a pending action', async () => {
  let rejected = 0;

  const copilot = createAutonomousCopilot({
    contextProvider: { async build() { return context(); } },
    planner: { async plan() { return actionPlan(); } },
    reads: { async execute() { return null; } },
    actionMapper: {
      validate() {
        return {
          action: actionPlan().steps[0]!.arguments as never,
          actionHash: 'hash-2', affectedResources: [], reversible: true,
        };
      },
    },
    actions: {
      prepare() {
        return {
          preview: {
            id: 'preview-2', action: {}, reason: 'test', risk: 'write' as const,
            affectedResources: [], reversible: true, actionHash: 'hash-2',
          },
          approval: {
            status: 'pending' as const, approvalId: 'approval-2', previewId: 'preview-2',
            actionHash: 'hash-2', deviceId: 'device-1', requestId: 'request-2',
            issuedAt: '2026-08-27T00:00:00Z', expiresAt: '2026-08-27T00:05:00Z',
          },
        };
      },
      approve() { throw new Error('unused'); },
      reject() {
        rejected += 1;
        return {
          status: 'rejected' as const, approvalId: 'approval-2', previewId: 'preview-2',
          actionHash: 'hash-2', deviceId: 'device-1', requestId: 'request-2',
          issuedAt: '2026-08-27T00:00:00Z', expiresAt: '2026-08-27T00:05:00Z',
        };
      },
      async execute() { throw new Error('must not execute'); },
    },
  });

  const first = await copilot.run({
    requestId: 'request-2', deviceId: 'device-1', userMessage: 'prepare set',
  });

  assert.equal(first.status, 'awaiting_approval');

  const rejectedResult = copilot.rejectPending({
    requestId: 'request-2',
    approvalId: first.pendingAction!.approval.approvalId,
  });

  assert.equal(rejectedResult.status, 'rejected');
  assert.equal(rejected, 1);
});
