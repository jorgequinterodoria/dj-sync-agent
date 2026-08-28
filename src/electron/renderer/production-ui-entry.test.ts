import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createInitialProductionUiSnapshot,
} from './production-ui/production-ui-state.js';

test('phase 31 production UI baseline contains the production workspace state', () => {
  const snapshot =
    createInitialProductionUiSnapshot();

  assert.equal(snapshot.connection, 'connecting');
  assert.equal(snapshot.sync, 'idle');
  assert.equal(snapshot.copilot, 'idle');
  assert.equal(snapshot.pendingAction, null);
  assert.deepEqual(snapshot.copilotMessages, []);
});
