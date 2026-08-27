import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createActionPreview,
} from '../ai/actions/action-preview.js';

import {
  createDJSyncCopilotActionController,
} from './dj-sync-copilot-action-controller.js';

test('action controller exposes pending and approved states', () => {
  const controller =
    createDJSyncCopilotActionController({
      now: () =>
        '2026-08-27T00:00:00Z',
      executor: {
        async execute() {
          return {
            ok: true,
          };
        },
      },
    });

  const state =
    controller.prepare({
      preview:
        createActionPreview({
          id: 'action-1',
          action: {
            type: 'playlist.add',
          },
          reason: 'Add track.',
          risk: 'review',
          affectedResources: [
            'track-1',
          ],
          reversible: true,
        }),
      deviceId: 'device-1',
      requestId: 'request-1',
    });

  assert.equal(
    state.status,
    'pending',
  );

  const approved =
    controller.approve(
      state.approval.approvalId,
    );

  assert.equal(
    approved.status,
    'approved',
  );
});

test('action controller executes an approved action', async () => {
  let calls = 0;

  const controller =
    createDJSyncCopilotActionController({
      now: () =>
        '2026-08-27T00:00:00Z',

      executor: {
        async execute() {
          calls += 1;
          return {
            changed: true,
          };
        },
      },
    });

  const prepared =
    controller.prepare({
      preview:
        createActionPreview({
          id: 'action-2',
          action: {
            type: 'playlist.add',
          },
          reason: 'Add track.',
          risk: 'review',
          affectedResources: [],
          reversible: true,
        }),
      deviceId: 'device-1',
      requestId: 'request-2',
    });

  controller.approve(
    prepared.approval.approvalId,
  );

  const result =
    await controller.execute({
      deviceId: 'device-1',
      requestId: 'request-2',
    });

  assert.equal(
    result.status,
    'executed',
  );

  assert.deepEqual(
    result.result,
    {
      changed: true,
    },
  );

  assert.equal(
    calls,
    1,
  );
});

test('action controller rejects mismatched approval id', () => {
  const controller =
    createDJSyncCopilotActionController({
      now: () =>
        '2026-08-27T00:00:00Z',
      executor: {
        async execute() {
          return null;
        },
      },
    });

  controller.prepare({
    preview:
      createActionPreview({
        id: 'action-3',
        action: {
          type: 'playlist.add',
        },
        reason: 'Add track.',
        risk: 'review',
        affectedResources: [],
        reversible: true,
      }),
    deviceId: 'device-1',
    requestId: 'request-3',
  });

  assert.throws(
    () =>
      controller.approve(
        'wrong-approval',
      ),
    /does not match/,
  );
});
