import assert from 'node:assert/strict';
import test from 'node:test';

import {
  parseToolCall,
  parseToolCalls,
} from './tool-call-parser.js';

test('tool call parser normalizes JSON argument strings', () => {
  const parsed = parseToolCall({
    id: 'call-1',
    name: 'library.search_tracks',
    arguments: '{"limit":5}',
  });

  assert.equal(parsed.ok, true);

  if (parsed.ok) {
    assert.deepEqual(parsed.call.arguments, { limit: 5 });
  }
});

test('tool call parser rejects malformed argument JSON', () => {
  const parsed = parseToolCall({
    id: 'call-1',
    name: 'library.search_tracks',
    arguments: '{',
  });

  assert.equal(parsed.ok, false);
});

test('tool call parser accepts native argument objects', () => {
  const parsed = parseToolCall({
    id: 'call-1',
    name: 'library.get_track',
    arguments: { id: '123' },
  });

  assert.equal(parsed.ok, true);
});

test('tool call parser collects multiple valid and invalid calls', () => {
  const parsed = parseToolCalls([
    {
      id: '1',
      name: 'library.get_track',
      arguments: { id: '1' },
    },
    {
      name: 'library.get_track',
      arguments: { id: '2' },
    },
  ]);

  assert.equal(parsed.calls.length, 1);
  assert.equal(parsed.errors.length, 1);
});
