import assert from 'node:assert/strict';
import test from 'node:test';

import {
  InMemoryActionAudit,
} from './action-audit.js';

test('action audit preserves event order', () => {
  const audit =
    new InMemoryActionAudit();

  audit.append({
    event: 'requested',
    actionId: 'action-1',
    deviceId: 'device-1',
    requestId: 'request-1',
    timestamp:
      '2026-08-27T00:00:00Z',
  });

  audit.append({
    event: 'approved',
    actionId: 'action-1',
    approvalId: 'approval-1',
    deviceId: 'device-1',
    requestId: 'request-1',
    timestamp:
      '2026-08-27T00:00:01Z',
  });

  assert.deepEqual(
    audit.list().map(
      (record) => record.event,
    ),
    [
      'requested',
      'approved',
    ],
  );
});
