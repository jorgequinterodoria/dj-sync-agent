import assert from 'node:assert/strict';
import test from 'node:test';
import { z } from 'zod';

import {
  CopilotAgent,
} from './copilot-agent.js';

import type {
  CopilotMessage,
  CopilotModel,
} from './copilot-agent-types.js';

import {
  createToolRegistry,
} from '../tools/tool-registry.js';

function registry() {
  const result =
    createToolRegistry();

  result.register({
    name: 'library.echo',
    description: 'Echo text.',
    risk: 'read',

    inputSchema:
      z.object({
        text: z.string().min(1),
      }),

    timeoutMs: 5_000,

    execute: async (input) =>
      ({
        echoed: input.text,
      }),
  });

  return result;
}

function model(
  responses: readonly {
    readonly content: string;

    readonly toolCalls?: readonly {
      readonly id: string;
      readonly name: string;
      readonly arguments: unknown;
    }[];
  }[],
): CopilotModel {
  let index = 0;

  return {
    async generate() {
      const response =
        responses[
          Math.min(
            index++,
            responses.length - 1,
          )
        ];

      if (!response) {
        throw new Error(
          'Missing test response.',
        );
      }

      return response;
    },
  };
}

interface CapturedRequest {
  readonly messages: readonly CopilotMessage[];
}

const baseContext = {
  schemaVersion: 1 as const,

  request: {
    userMessage: 'hello',
  },

  conversation: {
    summary:
      'Previous conversation',
    recentMessages: [],
    constraints: [],
  },

  track: null,

  library: {
    candidates: [],
  },

  history: {
    recentPlays: [],
  },

  intelligence: {},

  personalization: {},

  semantic: {
    results: [],
  },

  truncated: [],

  estimatedChars: 0,
};

test(
  'copilot agent completes a plain response',
  async () => {
    const agent =
      new CopilotAgent({
        model: model([
          {
            content:
              'Hello DJ.',
          },
        ]),

        registry: registry(),

        toolContext: {
          deviceId: 'device-1',
          now: () =>
            '2026-08-27T00:00:00Z',
          requestId: 'req-1',
        },
      });

    assert.equal(
      (
        await agent.run({
          userMessage: 'hello',
        })
      ).response,
      'Hello DJ.',
    );
  },
);

test(
  'copilot agent injects bounded context before the user message',
  async () => {
    let captured:
      CapturedRequest | undefined;

    const contextProvider = {
      async build() {
        return baseContext;
      },
    };

    const contextModel: CopilotModel = {
      async generate(request) {
        captured = {
          messages: request.messages,
        };

        return {
          content:
            'Context received.',
        };
      },
    };

    const agent =
      new CopilotAgent({
        model: contextModel,
        registry: registry(),

        toolContext: {
          deviceId: 'device-1',
          now: () =>
            '2026-08-27T00:00:00Z',
          requestId: 'req-1',
        },

        contextProvider,
      });

    await agent.run({
      userMessage: 'hello',
    });

    assert.notEqual(
      captured,
      undefined,
    );

    const request =
      captured;

    if (!request) {
      throw new Error(
        'Expected captured model request.',
      );
    }

    assert.equal(
      request.messages[0]?.role,
      'system',
    );

    assert.match(
      request.messages[0]?.content ?? '',
      /DJ_COPILOT_CONTEXT_V1/,
    );

    assert.equal(
      request.messages[
        request.messages.length - 1
      ]?.role,
      'user',
    );
  },
);

test(
  'copilot agent executes tools and returns final response',
  async () => {
    const agent =
      new CopilotAgent({
        model: model([
          {
            content:
              'I will check that.',

            toolCalls: [
              {
                id: 'call-1',
                name:
                  'library.echo',
                arguments: {
                  text: 'test',
                },
              },
            ],
          },

          {
            content:
              'The tool returned the expected result.',
          },
        ]),

        registry: registry(),

        toolContext: {
          deviceId: 'device-1',
          now: () =>
            '2026-08-27T00:00:00Z',
          requestId: 'req-1',
        },
      });

    const result =
      await agent.run({
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
  },
);

test(
  'copilot agent enforces tool call limits',
  async () => {
    const agent =
      new CopilotAgent({
        model: model([
          {
            content: '',

            toolCalls: [
              {
                id: 'call-1',
                name:
                  'library.echo',
                arguments: {
                  text: 'test',
                },
              },

              {
                id: 'call-2',
                name:
                  'library.echo',
                arguments: {
                  text: 'test',
                },
              },
            ],
          },
        ]),

        registry: registry(),

        toolContext: {
          deviceId: 'device-1',
          now: () =>
            '2026-08-27T00:00:00Z',
          requestId: 'req-1',
        },

        maxToolCalls: 1,
      });

    await assert.rejects(
      agent.run({
        userMessage: 'limit',
      }),
      {
        message:
          'Copilot tool call limit exceeded.',
      },
    );
  },
);

test(
  'copilot agent rejects missing device id',
  () => {
    assert.throws(
      () =>
        new CopilotAgent({
          model: model([
            {
              content: 'ok',
            },
          ]),

          registry: registry(),

          toolContext: {
            deviceId: ' ',
            now: () =>
              '2026-08-27T00:00:00Z',
            requestId: 'req-1',
          },
        }),
      {
        message:
          'Copilot device id is required.',
      },
    );
  },
);