import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ConversationMemory,
  InMemoryConversationMemoryStore,
} from './conversation-memory.js';

function createMemory(
  maxMessages = 3,
  maxConstraints = 2,
) {
  return new ConversationMemory({
    conversationId: 'conversation-1',
    store: new InMemoryConversationMemoryStore(),
    maxMessages,
    maxConstraints,
    now: () => '2026-08-27T00:00:00.000Z',
  });
}

test('conversation memory creates an empty deterministic snapshot', async () => {
  const memory = createMemory();
  const snapshot = await memory.load();

  assert.equal(snapshot.schemaVersion, 1);
  assert.equal(snapshot.conversationId, 'conversation-1');
  assert.deepEqual(snapshot.messages, []);
  assert.deepEqual(snapshot.constraints, []);
  assert.equal(snapshot.summary, null);
});

test('conversation memory bounds recent messages', async () => {
  const memory = createMemory(2);

  await memory.addMessage({
    id: '1',
    role: 'user',
    content: 'one',
    createdAt: '2026-08-27T00:00:01Z',
  });

  await memory.addMessage({
    id: '2',
    role: 'assistant',
    content: 'two',
    createdAt: '2026-08-27T00:00:02Z',
  });

  const snapshot = await memory.addMessage({
    id: '3',
    role: 'user',
    content: 'three',
    createdAt: '2026-08-27T00:00:03Z',
  });

  assert.deepEqual(
    snapshot.messages.map((message) => message.id),
    ['2', '3'],
  );
});

test('conversation memory orders messages deterministically', async () => {
  const memory = createMemory();

  await memory.addMessage({
    id: 'b',
    role: 'assistant',
    content: 'b',
    createdAt: '2026-08-27T00:00:02Z',
  });

  await memory.addMessage({
    id: 'a',
    role: 'user',
    content: 'a',
    createdAt: '2026-08-27T00:00:01Z',
  });

  assert.deepEqual(
    (await memory.load()).messages.map(
      (message) => message.id,
    ),
    ['a', 'b'],
  );
});

test('conversation memory replaces duplicate message ids', async () => {
  const memory = createMemory();

  await memory.addMessage({
    id: 'same',
    role: 'user',
    content: 'old',
    createdAt: '2026-08-27T00:00:01Z',
  });

  const snapshot = await memory.addMessage({
    id: 'same',
    role: 'user',
    content: 'new',
    createdAt: '2026-08-27T00:00:02Z',
  });

  assert.equal(snapshot.messages.length, 1);
  assert.equal(snapshot.messages[0]?.content, 'new');
});

test('conversation memory persists summaries separately', async () => {
  const memory = createMemory();

  await memory.addMessage({
    id: '1',
    role: 'user',
    content: 'I am preparing a two hour set.',
    createdAt: '2026-08-27T00:00:01Z',
  });

  await memory.setSummary(
    'User is preparing a two hour set.',
  );

  const restored = new ConversationMemory({
    conversationId: 'conversation-1',
    store: new InMemoryConversationMemoryStore(),
  });

  const snapshot = await restored.load();

  assert.equal(snapshot.summary, null);
});

test('conversation memory persists through the same store', async () => {
  const store =
    new InMemoryConversationMemoryStore();

  const memory = new ConversationMemory({
    conversationId: 'conversation-2',
    store,
    now: () => '2026-08-27T00:00:00Z',
  });

  await memory.setSummary('Summary');

  const restored = new ConversationMemory({
    conversationId: 'conversation-2',
    store,
    now: () => '2026-08-27T00:00:01Z',
  });

  assert.equal(
    (await restored.load()).summary,
    'Summary',
  );
});

test('conversation memory stores explicit constraints', async () => {
  const memory = createMemory(
    3,
    2,
  );

  await memory.upsertConstraint({
    key: 'maxBpm',
    value: '128',
    source: 'user',
    createdAt: '2026-08-27T00:00:01Z',
  });

  await memory.upsertConstraint({
    key: 'avoidArtists',
    value: 'Artist A',
    source: 'user',
    createdAt: '2026-08-27T00:00:02Z',
  });

  const constraints =
    await memory.getConstraints();

  assert.deepEqual(
    constraints.map(
      (constraint) => constraint.key,
    ),
    ['avoidArtists', 'maxBpm'],
  );
});

test('conversation memory bounds constraints', async () => {
  const memory = createMemory(3, 1);

  await memory.upsertConstraint({
    key: 'first',
    value: 'one',
    source: 'derived',
    createdAt: '2026-08-27T00:00:01Z',
  });

  await memory.upsertConstraint({
    key: 'second',
    value: 'two',
    source: 'derived',
    createdAt: '2026-08-27T00:00:02Z',
  });

  assert.deepEqual(
    (await memory.getConstraints()).map(
      (constraint) => constraint.key,
    ),
    ['second'],
  );
});

test('conversation memory rejects blank ids and content', async () => {
  const memory = createMemory();

  await assert.rejects(
    memory.addMessage({
      id: ' ',
      role: 'user',
      content: 'hello',
      createdAt: '2026-08-27T00:00:01Z',
    }),
    {
      message: 'Message id is required.',
    },
  );

  await assert.rejects(
    memory.addMessage({
      id: '1',
      role: 'user',
      content: ' ',
      createdAt: '2026-08-27T00:00:01Z',
    }),
    {
      message:
        'Conversation message content is required.',
    },
  );
});
