import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createInitialProductionUiSnapshot,
} from './production-ui-state.js';

import {
  renderProductionUiForTest,
} from './production-ui.js';

test('production ui render contains accessible main regions', () => {
  const snapshot =
    createInitialProductionUiSnapshot();

  const html =
    renderProductionUiForTest(
      snapshot,
    );

  assert.match(
    html,
    /aria-labelledby="ds-page-title"/,
  );

  assert.match(
    html,
    /aria-labelledby="ds-copilot-title"/,
  );

  assert.match(
    html,
    /aria-live="polite"/,
  );

  assert.match(
    html,
    /id="ds-copilot-input"/,
  );
});

test('production ui render escapes user-facing content', () => {
  const snapshot = {
    ...createInitialProductionUiSnapshot(),
    track: {
      id:
        'track-1',
      title:
        '<unsafe-title>',
      artist:
        'Artist & One',
      bpm:
        128,
      key:
        '8A',
    },
  };

  const html =
    renderProductionUiForTest(
      snapshot,
    );

  assert.match(
    html,
    /&lt;unsafe-title&gt;/,
  );

  assert.match(
    html,
    /Artist &amp; One/,
  );

  assert.doesNotMatch(
    html,
    /<unsafe-title>/,
  );
});

test('production ui render exposes approval controls only with a pending action', () => {
  const base =
    createInitialProductionUiSnapshot();

  const withoutAction =
    renderProductionUiForTest(
      base,
    );

  assert.doesNotMatch(
    withoutAction,
    /data-action="approve"/,
  );

  const withAction =
    renderProductionUiForTest({
      ...base,
      pendingAction: {
        id:
          'action-1',
        title:
          'Add track',
        description:
          'Add the selected track.',
        risk:
          'write',
        affectedResources: [
          'playlist:1',
          'track:1',
        ],
        reversible:
          true,
        status:
          'pending',
      },
    });

  assert.match(
    withAction,
    /data-action="approve"/,
  );

  assert.match(
    withAction,
    /data-action="reject"/,
  );
});
