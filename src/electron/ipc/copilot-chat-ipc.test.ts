import assert from 'node:assert/strict';
import test from 'node:test';

import type {
  CopilotChatSendInput,
} from './copilot-chat-contracts.js';

test('copilot chat input has the stable IPC shape', () => {
  const input: CopilotChatSendInput = {
    conversationId: 'conversation-1',
    message: 'find a darker track',
  };

  assert.equal(input.conversationId, 'conversation-1');
  assert.equal(input.message, 'find a darker track');
});
