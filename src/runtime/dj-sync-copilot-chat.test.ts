import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createDJSyncCopilotChat,
} from './dj-sync-copilot-chat.js';

import type {
  CopilotAgent,
} from '../ai/agent/copilot-agent.js';

test(
  'copilot chat delegates to the agent',
  async () => {
    const agent = {
      async run(input: {
        userMessage: string;
        signal?: AbortSignal;
      }) {
        return {
          response:
            `Echo: ${input.userMessage}`,

          messages: [
            {
              role: 'user' as const,
              content:
                input.userMessage,
            },
            {
              role: 'assistant' as const,
              content: 'ok',
            },
          ],

          toolExecutions: [],

          turns: 1,
        };
      },
    } as unknown as CopilotAgent;

    const chat =
      createDJSyncCopilotChat({
        conversationId:
          'conversation-1',
        agent,
      });

    const result =
      await chat.send('hello');

    assert.equal(
      result.conversationId,
      'conversation-1',
    );

    assert.equal(
      result.response,
      'Echo: hello',
    );

    assert.equal(
      result.toolCalls,
      0,
    );
  },
);

test(
  'copilot chat requires a conversation id',
  () => {
    assert.throws(
      () =>
        createDJSyncCopilotChat({
          conversationId: ' ',
          agent:
            {} as CopilotAgent,
        }),
      {
        message:
          'Copilot conversation id is required.',
      },
    );
  },
);