import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createInitialProductionUiSnapshot,
  reduceProductionUiState,
} from './production-ui-state.js';

test('production ui state keeps activity bounded', () => {
  let state =
    createInitialProductionUiSnapshot();

  for (
    let index = 0;
    index < 150;
    index += 1
  ) {
    state =
      reduceProductionUiState(
        state,
        {
          type:
            'activity.add',
          value: {
            id:
              `activity-${index}`,
            timestamp:
              '2026-08-27T00:00:00Z',
            label:
              `Activity ${index}`,
            status:
              'info',
          },
        },
      );
  }

  assert.equal(
    state.activities.length,
    100,
  );

  assert.equal(
    state.activities[0]?.id,
    'activity-50',
  );
});

test('production ui state updates the action preview independently', () => {
  const state =
    createInitialProductionUiSnapshot();

  const next =
    reduceProductionUiState(
      state,
      {
        type:
          'action.set',
        value: {
          id:
            'action-1',
          title:
            'Add track',
          description:
            'Add the selected track to the playlist.',
          risk:
            'write',
          affectedResources: [
            'playlist:1',
            'track:2',
          ],
          reversible:
            true,
          status:
            'pending',
        },
      },
    );

  assert.equal(
    state.pendingAction,
    null,
  );

  assert.equal(
    next.pendingAction?.id,
    'action-1',
  );
});

test('production ui state preserves existing messages', () => {
  const initial =
    createInitialProductionUiSnapshot();

  const first =
    reduceProductionUiState(
      initial,
      {
        type:
          'message.add',
        value: {
          id:
            'message-1',
          role:
            'user',
          content:
            'Find house tracks.',
          createdAt:
            '2026-08-27T00:00:00Z',
        },
      },
    );

  const second =
    reduceProductionUiState(
      first,
      {
        type:
          'message.add',
        value: {
          id:
            'message-2',
          role:
            'assistant',
          content:
            'I found several candidates.',
          createdAt:
            '2026-08-27T00:00:01Z',
        },
      },
    );

  assert.deepEqual(
    second.copilotMessages.map(
      (message) => message.id,
    ),
    [
      'message-1',
      'message-2',
    ],
  );
});
