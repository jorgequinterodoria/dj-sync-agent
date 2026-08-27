import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createConversationMemoryStore,
} from './conversation-memory-store.js';
import type {
  ConversationSnapshot,
} from './conversation-memory-types.js';

function snapshot(): ConversationSnapshot {
  return {
    schemaVersion: 1,
    conversationId: 'conversation-1',
    createdAt: '2026-08-27T00:00:00Z',
    updatedAt: '2026-08-27T00:00:00Z',
    summary: null,
    messages: [],
    constraints: [],
  };
}

test('conversation store delegates load', async () => {
  let loaded = false;

  const store = createConversationMemoryStore({
    async load(id) {
      loaded = id === 'conversation-1';
      return loaded ? snapshot() : null;
    },
    async save() {},
    async delete() {},
  });

  assert.deepEqual(
    await store.load('conversation-1'),
    snapshot(),
  );
  assert.equal(loaded, true);
});

test('conversation store delegates save', async () => {
  let saved: ConversationSnapshot | null = null;

  const store = createConversationMemoryStore({
    async load() {
      return null;
    },
    async save(value) {
      saved = value;
    },
    async delete() {},
  });

  await store.save(snapshot());

  assert.deepEqual(saved, snapshot());
});

test('conversation store delegates delete', async () => {
  let deleted = '';

  const store = createConversationMemoryStore({
    async load() {
      return null;
    },
    async save() {},
    async delete(id) {
      deleted = id;
    },
  });

  await store.delete('conversation-1');

  assert.equal(deleted, 'conversation-1');
});
