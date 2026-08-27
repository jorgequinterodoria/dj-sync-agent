import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createDJSyncConversationService,
} from './dj-sync-conversation-service.js';
import {
  ConversationMemory,
} from '../ai/memory/conversation-memory.js';

test('conversation service persists messages through memory', async () => {
  const memory = new ConversationMemory({
    conversationId: 'conversation-1',
    store: {
      async load() {
        return null;
      },
      async save() {},
      async delete() {},
    },
    now: () => '2026-08-27T00:00:00Z',
  });

  const service =
    createDJSyncConversationService({
      memory,
    });

  const snapshot =
    await service.addMessage({
      id: 'message-1',
      role: 'user',
      content: 'hello',
      createdAt: '2026-08-27T00:00:01Z',
    });

  assert.equal(
    snapshot.messages.length,
    1,
  );
});

test('conversation service clears persisted memory', async () => {
  let deleted = false;

  const memory = new ConversationMemory({
    conversationId: 'conversation-2',
    store: {
      async load() {
        return null;
      },
      async save() {},
      async delete() {
        deleted = true;
      },
    },
  });

  const service =
    createDJSyncConversationService({
      memory,
    });

  await service.clear();

  assert.equal(deleted, true);
});
