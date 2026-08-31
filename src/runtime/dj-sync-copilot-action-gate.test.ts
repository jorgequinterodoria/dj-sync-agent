import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createActionPreview,
} from '../ai/actions/action-preview.js';

import {
  createDJSyncCopilotActionGate,
} from './dj-sync-copilot-action-gate.js';

test(
  'action gate executes only after approval',
  async () => {
    let executions = 0;

    const gate =
      createDJSyncCopilotActionGate({
        now: () =>
          '2026-08-27T00:00:00Z',

        executor: {
          async execute() {
            executions += 1;

            return {
              ok: true,
            };
          },
        },
      });

    const preview =
      createActionPreview({
        id: 'action-1',
        action: {
          type: 'playlist.add',
        },
        reason:
          'Add track to playlist.',
        risk: 'review',
        affectedResources: [
          'track-1',
        ],
        reversible: true,
      });

    const prepared =
      gate.prepare({
        preview,
        deviceId: 'device-1',
        requestId: 'request-1',
      });

    assert.equal(
      prepared.approval.status,
      'pending',
    );

    await assert.rejects(
      gate.execute({
        preview,
        approvalId:
          prepared.approval.approvalId,
        token:
          prepared.approval.token ?? '',
        deviceId: 'device-1',
        requestId: 'request-1',
      }),
      /not executable/,
    );

    assert.equal(
      executions,
      0,
    );

    const approved =
      gate.approve(
        prepared.approval.approvalId,
      );

    assert.equal(
      approved.status,
      'approved',
    );

    const result =
      await gate.execute({
        preview,
        approvalId:
          approved.approvalId,
        token:
          approved.token ?? '',
        deviceId: 'device-1',
        requestId: 'request-1',
      });

    assert.deepEqual(
      result,
      {
        ok: true,
      },
    );

    assert.equal(
      executions,
      1,
    );
  },
);

test(
  'action gate records failed execution',
  async () => {
    const gate =
      createDJSyncCopilotActionGate({
        now: () =>
          '2026-08-27T00:00:00Z',

        executor: {
          async execute() {
            throw new Error(
              'execution failed',
            );
          },
        },
      });

    const preview =
      createActionPreview({
        id: 'action-2',
        action: {
          type: 'playlist.add',
        },
        reason:
          'Add track.',
        risk: 'review',
        affectedResources: [],
        reversible: true,
      });

    const prepared =
      gate.prepare({
        preview,
        deviceId: 'device-1',
        requestId: 'request-2',
      });

    const approved =
      gate.approve(
        prepared.approval.approvalId,
      );

    assert.equal(
      approved.status,
      'approved',
    );

    const token =
      approved.token;

    assert.ok(
      token,
      'Expected an approval token after approval.',
    );

    await assert.rejects(
      gate.execute({
        preview,
        approvalId:
          approved.approvalId,
        token,
        deviceId: 'device-1',
        requestId: 'request-2',
      }),
      {
        message: 'execution failed',
      },
    );

    const audit =
      gate.audit();

    assert.equal(
      audit.some(
        (record) =>
          record.event ===
          'requested',
      ),
      true,
    );

    assert.equal(
      audit.some(
        (record) =>
          record.event ===
          'previewed',
      ),
      true,
    );

    assert.equal(
      audit.some(
        (record) =>
          record.event ===
          'approved',
      ),
      true,
    );

    assert.equal(
      audit.some(
        (record) =>
          record.event ===
          'failed',
      ),
      true,
    );
  },
);