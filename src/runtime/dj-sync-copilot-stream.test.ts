import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createDJSyncCopilotStream,
} from './dj-sync-copilot-stream.js';

import type {
  CopilotAgent,
} from '../ai/agent/copilot-agent.js';

test(
  'copilot stream emits lifecycle and completion events',
  async () => {
    const events: string[] = [];

    const stream =
      createDJSyncCopilotStream({
        conversationId: 'conversation-1',
        agent: {
          async run() {
            return {
              response: 'Done.',
              messages: [],
              toolExecutions: [
                {
                  id: 'tool-1',
                  name: 'library.search_tracks',
                  result: {
                    ok: true,
                    data: [],
                  },
                },
              ],
              turns: 2,
            };
          },
        } as unknown as CopilotAgent,
      });

    await stream.run(
      {
        userMessage: 'search',
      },
      (event) => {
        events.push(event.type);
      },
    );

    assert.deepEqual(events, [
      'started',
      'tool',
      'assistant',
      'completed',
    ]);
  },
);

test(
  'copilot stream emits error events',
  async () => {
    const events: string[] = [];

    const stream =
      createDJSyncCopilotStream({
        conversationId: 'conversation-2',
        agent: {
          async run() {
            throw new Error('provider failed');
          },
        } as unknown as CopilotAgent,
      });

    await assert.rejects(
      stream.run(
        { userMessage: 'hello' },
        (event) => {
          events.push(event.type);
        },
      ),
      {
        message: 'provider failed',
      },
    );

    assert.deepEqual(events, [
      'started',
      'error',
    ]);
  },
);
