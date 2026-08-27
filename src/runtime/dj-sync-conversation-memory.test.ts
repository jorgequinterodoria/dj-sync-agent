import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createDJSyncConversationMemory,
} from './dj-sync-conversation-memory.js';
import {
  InMemoryConversationMemoryStore,
} from '../ai/memory/conversation-memory.js';

test('runtime conversation memory exposes session state', async () => {
  const memory =
    createDJSyncConversationMemory({
      conversationId: 'session-1',
      store:
        new InMemoryConversationMemoryStore(),
      maxMessages: 2,
    });

  await memory.addMessage({
    id: '1',
    role: 'user',
    content: 'hello',
    createdAt: '2026-08-27T00:00:01Z',
  });

  await memory.addMessage({
    id: '2',
    role: 'assistant',
    content: 'hi',
    createdAt: '2026-08-27T00:00:02Z',
  });

  await memory.addMessage({
    id: '3',
    role: 'user',
    content: 'continue',
    createdAt: '2026-08-27T00:00:03Z',
  });

  assert.deepEqual(
    (await memory.recentMessages()).map(
      (message) => message.id,
    ),
    ['2', '3'],
  );
});

test('runtime conversation memory persists explicit constraints', async () => {
  const store =
    new InMemoryConversationMemoryStore();

  const memory =
    createDJSyncConversationMemory({
      conversationId: 'session-2',
      store,
    });

  await memory.upsertConstraint({
    key: 'genre',
    value: 'progressive',
    source: 'user',
    createdAt: '2026-08-27T00:00:01Z',
  });

  assert.equal(
    (await memory.constraints())[0]?.value,
    'progressive',
  );
});

test('runtime conversation memory clears its session', async () => {
  const store =
    new InMemoryConversationMemoryStore();

  const memory =
    createDJSyncConversationMemory({
      conversationId: 'session-3',
      store,
    });

  await memory.setSummary('temporary');
  await memory.clear();

  const restored =
    createDJSyncConversationMemory({
      conversationId: 'session-3',
      store,
    });

  assert.equal(
    (await restored.load()).summary,
    null,
  );
});
