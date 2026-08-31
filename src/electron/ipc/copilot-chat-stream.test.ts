import assert from 'node:assert/strict';
import test from 'node:test';

import {
  withConversationId,
} from './copilot-chat-stream.js';

test('stream events carry conversation identity', () => {
  const event =
    withConversationId(
      'conversation-1',
      {
        type: 'completed',
        response: 'Done',
        toolCalls: 1,
      },
    );

  assert.deepEqual(event, {
    type: 'completed',
    response: 'Done',
    toolCalls: 1,
    conversationId: 'conversation-1',
  });
});
