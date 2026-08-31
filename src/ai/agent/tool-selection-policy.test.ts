import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ToolSelectionPolicy,
} from './tool-selection-policy.js';

test('tool policy allows read tools by default', () => {
  const policy =
    new ToolSelectionPolicy([
      {
        name: 'library.search',
        risk: 'read',
      },
      {
        name: 'actions.execute',
        risk: 'write',
      },
    ]);

  assert.equal(
    policy.decide('library.search').allowed,
    true,
  );

  assert.equal(
    policy.decide('actions.execute').allowed,
    false,
  );
});

test('tool policy requires approval for review tools', () => {
  const policy =
    new ToolSelectionPolicy(
      [
        {
          name: 'playlist.modify',
          risk: 'review',
        },
      ],
      ['read', 'review'],
    );

  assert.equal(
    policy.decide('playlist.modify').allowed,
    true,
  );
});

test('tool policy filters duplicates deterministically', () => {
  const policy =
    new ToolSelectionPolicy([
      {
        name: 'library.search',
        risk: 'read',
      },
      {
        name: 'history.get',
        risk: 'read',
      },
    ]);

  assert.deepEqual(
    policy.filter([
      'history.get',
      'library.search',
      'history.get',
      '',
    ]),
    [
      'history.get',
      'library.search',
    ],
  );
});

test('tool policy rejects unknown tools', () => {
  const policy =
    new ToolSelectionPolicy([]);

  assert.equal(
    policy.decide('missing').allowed,
    false,
  );
});
