import assert from 'node:assert/strict';
import test from 'node:test';

import type {
  AICompletionRequest,
  AICompletionResponse,
  AIProvider,
} from '../ai/ai-provider.js';
import {
  createDJSyncCopilotUiService,
} from './dj-sync-copilot-ui.js';

function fakeProvider(): AIProvider {
  const requests: AICompletionRequest[] = [];

  return {
    id: 'openai',
    async complete(request): Promise<AICompletionResponse> {
      requests.push(request);
      return {
        provider: 'openai',
        model: request.model,
        text: `reply:${requests.length}`,
        finishReason: 'stop',
        usage: {
          inputTokens: 1,
          outputTokens: 1,
          totalTokens: 2,
        },
      };
    },
  };
}

test('copilot ui service maintains bounded conversation state', async () => {
  const service = createDJSyncCopilotUiService({
    provider: fakeProvider(),
    model: 'test-model',
  });

  const first = await service.send({
    conversationId: 'conversation-1',
    message: 'hello',
  });

  assert.equal(first.response, 'reply:1');
  assert.equal(first.toolCalls, 0);
  assert.equal(first.messages.length, 2);

  const second = await service.send({
    conversationId: 'conversation-1',
    message: 'continue',
  });

  assert.equal(second.response, 'reply:2');
  assert.equal(second.messages.length, 4);
});

test('copilot ui service rejects missing provider configuration', async () => {
  const service = createDJSyncCopilotUiService({
    env: {},
  });

  assert.equal(service.status().configured, false);

  await assert.rejects(
    service.send({
      conversationId: 'conversation-1',
      message: 'hello',
    }),
    /COPILOT_PROVIDER/,
  );
});

test('copilot ui service rejects blank input', async () => {
  const service = createDJSyncCopilotUiService({
    provider: fakeProvider(),
    model: 'test-model',
  });

  await assert.rejects(
    service.send({
      conversationId: 'conversation-1',
      message: '   ',
    }),
    /message is required/,
  );
});
