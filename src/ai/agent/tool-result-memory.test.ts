import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ToolResultMemory,
} from './tool-result-memory.js';

test('tool result memory deduplicates call keys', () => {
  const memory =
    new ToolResultMemory();

  memory.remember({
    callKey: 'library.search:1',
    tool: 'library.search',
    result: { items: ['a'] },
  });

  memory.remember({
    callKey: 'library.search:1',
    tool: 'library.search',
    result: { items: ['b'] },
  });

  assert.equal(
    memory.entriesInOrder().length,
    1,
  );

  assert.deepEqual(
    memory.get('library.search:1')?.result,
    { items: ['a'] },
  );
});

test('tool result memory exposes stable insertion order', () => {
  const memory =
    new ToolResultMemory();

  memory.remember({
    callKey: 'a',
    tool: 'library.search',
    result: 1,
  });

  memory.remember({
    callKey: 'b',
    tool: 'history.get',
    result: 2,
  });

  assert.deepEqual(
    memory.entriesInOrder().map(
      (entry) => entry.callKey,
    ),
    ['a', 'b'],
  );
});
