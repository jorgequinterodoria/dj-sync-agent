import assert from 'node:assert/strict';
import test from 'node:test';
import { InMemoryApprovalGate } from './approval-gate.js';
import { createActionPreview } from './action-preview.js';

function preview() {
  return createActionPreview({
    id: 'preview-1',
    action: { type: 'playlist.add', trackId: 'track-1' },
    reason: 'Add track.',
    risk: 'write',
    affectedResources: ['track:track-1'],
    reversible: true,
  });
}

test('approval requires explicit approval', () => {
  const gate = new InMemoryApprovalGate({ now: () => '2026-08-27T00:00:00Z' });
  const pending = gate.request({
    preview: preview(), deviceId: 'device-1', requestId: 'request-1', now: '2026-08-27T00:00:00Z',
  });
  assert.equal(pending.status, 'pending');
  assert.equal(pending.token, undefined);
  assert.throws(() => gate.consume({
    approvalId: pending.approvalId, token: '', preview: preview(), deviceId: 'device-1', requestId: 'request-1', now: '2026-08-27T00:00:01Z',
  }), /not executable/i);
});

test('approved action is one-shot', () => {
  const gate = new InMemoryApprovalGate({ now: () => '2026-08-27T00:00:00Z' });
  const pending = gate.request({
    preview: preview(), deviceId: 'device-1', requestId: 'request-1', now: '2026-08-27T00:00:00Z',
  });
  const approved = gate.approve(pending.approvalId);
  assert.ok(approved.token);
  const token = approved.token;
  gate.consume({
    approvalId: approved.approvalId, token, preview: preview(), deviceId: 'device-1', requestId: 'request-1', now: '2026-08-27T00:00:01Z',
  });
  assert.throws(() => gate.consume({
    approvalId: approved.approvalId, token, preview: preview(), deviceId: 'device-1', requestId: 'request-1', now: '2026-08-27T00:00:02Z',
  }), /already been consumed/i);
});

test('expired approval cannot execute', () => {
  let current = '2026-08-27T00:00:00Z';
  const gate = new InMemoryApprovalGate({ now: () => current });
  const pending = gate.request({
    preview: preview(), deviceId: 'device-1', requestId: 'request-1', now: current, ttlMs: 1000,
  });
  current = '2026-08-27T00:00:02Z';
  const expired = gate.approve(pending.approvalId);
  assert.equal(expired.status, 'expired');
});
