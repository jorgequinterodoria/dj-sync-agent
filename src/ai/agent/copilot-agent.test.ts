import assert from 'node:assert/strict';
import test from 'node:test';
import { z } from 'zod';

import {
  CopilotAgent,
  createCopilotAgent,
} from './copilot-agent.js';
import type {
  CopilotModel,
} from './copilot-agent-types.js';
import {
  createToolRegistry,
} from '../tools/tool-registry.js';

function registry() {
  const result = createToolRegistry();

  result.register({
    name: 'library.echo',
    description: 'Echo text.',
    risk: 'read',
    inputSchema: z.object({
      text: z.string().min(1),
    }),
    timeoutMs: 5_000,
    execute: async (input) =>
      ({ echoed: input.text }),
  });

  return result;
}

function model(
  responses: readonly {
    content: string;
    toolCalls?: readonly {
      id: string;
      name: string;
      arguments: unknown;
    }[];
  }[],
): CopilotModel {
  let index = 0;

  return {
    async generate() {
      const response =
        responses[Math.min(
          index++,
          responses.length - 1,
        )];

      if (!response) {
        throw new Error('Missing test response.');
      }

      return response;
    },
  };
}

test('copilot agent completes a plain response', async () => {
  const agent = createCopilotAgent({
    model: model([
      { content: 'Hello DJ.' },
    ]),
    registry: registry(),
    toolContext: {
      deviceId: 'device-1',
      now: () => '2026-08-27T00:00:00Z',
      requestId: 'req-1',
    },
  });

  assert.equal(
    (await agent.run({ userMessage: 'hello' }))
      .response,
    'Hello DJ.',
  );
});

test('copilot agent executes tools and returns final response', async () => {
  const agent = createCopilotAgent({
    model: model([
      {
        content: 'I will check that.',
        toolCalls: [
          {
            id: 'call-1',
            name: 'library.echo',
            arguments: { text: 'test' },
          },
        ],
      },
      {
        content: 'The tool returned the expected result.',
      },
    ]),
    registry: registry(),
    toolContext: {
      deviceId: 'device-1',
      now: () => '2026-08-27T00:00:00Z',
      requestId: 'req-1',
    },
  });

  const result = await agent.run({
    userMessage: 'use the tool',
  });

  assert.equal(
    result.toolExecutions.length,
    1,
  );
  assert.equal(
    result.toolExecutions[0]?.name,
    'library.echo',
  );
  assert.equal(
    result.response,
    'The tool returned the expected result.',
  );
});

test('copilot agent enforces tool call limits', async () => {
  const agent = new CopilotAgent({
    model: model([
      {
        content: '',
        toolCalls: [
          {
            id: 'call-1',
            name: 'library.echo',
            arguments: { text: 'test' },
          },
          {
            id: 'call-2',
            name: 'library.echo',
            arguments: { text: 'test' },
          },
        ],
      },
    ]),
    registry: registry(),
    toolContext: {
      deviceId: 'device-1',
      now: () => '2026-08-27T00:00:00Z',
      requestId: 'req-1',
    },
    maxToolCalls: 1,
  });

  await assert.rejects(
    agent.run({ userMessage: 'limit' }),
    {
      message:
        'Copilot tool call limit exceeded.',
    },
  );
});

test('copilot agent rejects missing device id', () => {
  assert.throws(
    () =>
      createCopilotAgent({
        model: model([{ content: 'ok' }]),
        registry: registry(),
        toolContext: {
          deviceId: ' ',
          now: () => '2026-08-27T00:00:00Z',
          requestId: 'req-1',
        },
      }),
    {
      message:
        'Copilot device id is required.',
    },
  );
});
