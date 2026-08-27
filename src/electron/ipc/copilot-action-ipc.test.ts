import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createActionPreview,
} from '../../ai/actions/action-preview.js';

import {
  createDJSyncCopilotActionGate,
} from '../../runtime/dj-sync-copilot-action-gate.js';

import {
  createCopilotActionIpc,
} from './copilot-action-ipc.js';

test('action IPC keeps execution behind the gate', async () => {
  let executions = 0;

  const gate =
    createDJSyncCopilotActionGate({
      now: () =>
        '2026-08-27T00:00:00Z',

      executor: {
        async execute() {
          executions += 1;
          return {
            executed: true,
          };
        },
      },
    });

  const ipc =
    createCopilotActionIpc(
      gate,
    );

  const preview =
    createActionPreview({
      id: 'action-1',
      action: {
        type: 'playlist.add',
      },
      reason:
        'Add the selected track.',
      risk: 'review',
      affectedResources: [
        'track-1',
      ],
      reversible: true,
    });

  const prepared =
    ipc.prepare({
      preview,
      deviceId: 'device-1',
      requestId: 'request-1',
    });

  const beforeApproval =
    await ipc.execute({
      preview,
      approvalId:
        prepared.approval.approvalId,
      token:
        prepared.approval.token ?? '',
      deviceId: 'device-1',
      requestId: 'request-1',
    });

  assert.equal(
    beforeApproval.ok,
    false,
  );

  assert.equal(
    executions,
    0,
  );
});

test('action IPC approval and rejection are structured', () => {
  const gate =
    createDJSyncCopilotActionGate({
      now: () =>
        '2026-08-27T00:00:00Z',

      executor: {
        async execute() {
          return null;
        },
      },
    });

  const ipc =
    createCopilotActionIpc(
      gate,
    );

  const preview =
    createActionPreview({
      id: 'action-2',
      action: {
        type: 'playlist.remove',
      },
      reason:
        'Remove the selected track.',
      risk: 'review',
      affectedResources: [
        'track-2',
      ],
      reversible: true,
    });

  const prepared =
    ipc.prepare({
      preview,
      deviceId: 'device-1',
      requestId: 'request-2',
    });

  const rejected =
    ipc.reject(
      prepared.approval.approvalId,
    );

  assert.equal(
    rejected.ok,
    true,
  );
});
