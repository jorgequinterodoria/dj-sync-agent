import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatBpm,
  formatConnection,
  formatCopilotState,
  formatKey,
  formatSyncState,
} from './production-ui-format.js';

test('formatBpm handles missing and fractional bpm', () => {
  assert.equal(
    formatBpm(null),
    '—',
  );

  assert.equal(
    formatBpm(128),
    '128',
  );

  assert.equal(
    formatBpm(127.5),
    '127.5',
  );
});

test('formatKey handles empty values', () => {
  assert.equal(
    formatKey(null),
    '—',
  );

  assert.equal(
    formatKey(' 8A '),
    '8A',
  );
});

test('format status labels are stable', () => {
  assert.equal(
    formatConnection(
      'connected',
    ),
    'Connected',
  );

  assert.equal(
    formatCopilotState(
      'awaiting_approval',
    ),
    'Waiting for approval',
  );

  assert.equal(
    formatSyncState(
      'running',
    ),
    'Running',
  );
});
