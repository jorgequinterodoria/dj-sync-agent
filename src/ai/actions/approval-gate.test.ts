import assert from 'node:assert/strict';
import test from 'node:test';

import {
  InMemoryApprovalGate,
} from './approval-gate.js';

import {
  createActionPreview,
} from './action-preview.js';

function preview() {
  return createActionPreview({
    id: 'preview-1',
    action: {
      type: 'playlist.add',
      trackId: 'track-1',
    },
    reason: 'Add track to playlist.',
    risk: 'review',
    affectedResources: [
      'track-1',
      'playlist-1',
    ],
    reversible: true,
  });
}

test('approval gate requires explicit approval', () => {
  const gate =
    new InMemoryApprovalGate();

  const pending =
    gate.request({
      preview: preview(),
      deviceId: 'device-1',
      requestId: 'request-1',
      now: '2026-08-27T00:00:00Z',
    });

  assert.equal(
    pending.status,
    'pending',
  );

  assert.throws(
    () =>
      gate.consume({
        approvalId:
          pending.approvalId,
        token:
          pending.token ?? '',
        preview: preview(),
        deviceId: 'device-1',
        requestId: 'request-1',
        now: '2026-08-27T00:01:00Z',
      }),
    /Approval is not executable/,
  );
});

test('approved action can be consumed once', () => {
  const gate =
    new InMemoryApprovalGate();

  const pending =
    gate.request({
      preview: preview(),
      deviceId: 'device-1',
      requestId: 'request-1',
      now: '2026-08-27T00:00:00Z',
    });

  const approved =
    gate.approve(
      pending.approvalId,
    );

  assert.equal(
    approved.status,
    'approved',
  );

  const consumed =
    gate.consume({
      approvalId:
        approved.approvalId,
      token:
        approved.token ?? '',
      preview: preview(),
      deviceId: 'device-1',
      requestId: 'request-1',
      now: '2026-08-27T00:01:00Z',
    });

  assert.equal(
    consumed.status,
    'approved',
  );

  assert.throws(
    () =>
      gate.consume({
        approvalId:
          approved.approvalId,
        token:
          approved.token ?? '',
        preview: preview(),
        deviceId: 'device-1',
        requestId: 'request-1',
        now: '2026-08-27T00:01:30Z',
      }),
    /already been consumed/,
  );
});

test('approval gate rejects mismatched device', () => {
  const gate =
    new InMemoryApprovalGate();

  const pending =
    gate.request({
      preview: preview(),
      deviceId: 'device-1',
      requestId: 'request-1',
      now: '2026-08-27T00:00:00Z',
    });

  gate.approve(
    pending.approvalId,
  );

  assert.throws(
    () =>
      gate.consume({
        approvalId:
          pending.approvalId,
        token:
          gate.get(
            pending.approvalId,
          )?.token ?? '',
        preview: preview(),
        deviceId: 'device-2',
        requestId: 'request-1',
        now: '2026-08-27T00:01:00Z',
      }),
    /device mismatch/,
  );
});

test('expired approval cannot execute', () => {
  const gate =
    new InMemoryApprovalGate();

  const pending =
    gate.request({
      preview: preview(),
      deviceId: 'device-1',
      requestId: 'request-1',
      now: '2026-08-27T00:00:00Z',
      ttlMs: 1_000,
    });

  gate.approve(
    pending.approvalId,
  );

  assert.throws(
    () =>
      gate.consume({
        approvalId:
          pending.approvalId,
        token:
          gate.get(
            pending.approvalId,
          )?.token ?? '',
        preview: preview(),
        deviceId: 'device-1',
        requestId: 'request-1',
        now: '2026-08-27T00:00:02Z',
      }),
    /expired/,
  );
});

test('changed action cannot reuse approval', () => {
  const gate =
    new InMemoryApprovalGate();

  const original =
    preview();

  const pending =
    gate.request({
      preview: original,
      deviceId: 'device-1',
      requestId: 'request-1',
      now: '2026-08-27T00:00:00Z',
    });

  gate.approve(
    pending.approvalId,
  );

  const changed =
    createActionPreview({
      ...original,
      action: {
        type: 'playlist.add',
        trackId: 'track-2',
      },
    });

  assert.throws(
    () =>
      gate.consume({
        approvalId:
          pending.approvalId,
        token:
          gate.get(
            pending.approvalId,
          )?.token ?? '',
        preview: changed,
        deviceId: 'device-1',
        requestId: 'request-1',
        now: '2026-08-27T00:00:10Z',
      }),
    /action hash mismatch/,
  );
});
