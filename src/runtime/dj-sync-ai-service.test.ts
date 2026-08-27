import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createDJSyncAIService,
} from './dj-sync-ai-service.js';

test(
  'AI service reports disabled state when provider is missing',
  () => {
    const service =
      createDJSyncAIService({
        provider:
          null,
      });

    const snapshot =
      service.snapshot();

    assert.equal(
      snapshot.configured,
      false,
    );

    assert.equal(
      snapshot.provider,
      null,
    );

    assert.equal(
      snapshot.status,
      'disabled',
    );

    assert.equal(
      snapshot.lastRequestAt,
      null,
    );

    assert.equal(
      snapshot.lastResponseAt,
      null,
    );

    assert.equal(
      snapshot.lastError,
      null,
    );
  },
);

test(
  'AI service completes requests through provider',
  async () => {
    const service =
      createDJSyncAIService({
        provider: {
          id:
            'openai-compatible',

          async complete(
            request,
          ) {
            assert.equal(
              request.model,
              'test-model',
            );

            return {
              provider:
                'openai-compatible',

              model:
                'test-model',

              text:
                'hello',

              finishReason:
                'stop',

              usage: {
                inputTokens:
                  1,

                outputTokens:
                  1,

                totalTokens:
                  2,
              },
            };
          },
        },
      });

    const response =
      await service.complete({
        model:
          'test-model',

        messages: [
          {
            role:
              'user',

            content:
              'hello',
          },
        ],
      });

    assert.equal(
      response.text,
      'hello',
    );

    const snapshot =
      service.snapshot();

    assert.equal(
      snapshot.configured,
      true,
    );

    assert.equal(
      snapshot.provider,
      'openai-compatible',
    );

    assert.equal(
      snapshot.status,
      'ready',
    );

    assert.ok(
      snapshot.lastRequestAt,
    );

    assert.ok(
      snapshot.lastResponseAt,
    );

    assert.equal(
      snapshot.lastError,
      null,
    );
  },
);

test(
  'AI service reports provider failures',
  async () => {
    const service =
      createDJSyncAIService({
        provider: {
          id:
            'openai-compatible',

          async complete() {
            throw new Error(
              'provider failed',
            );
          },
        },
      });

    await assert.rejects(
      () =>
        service.complete({
          model:
            'test-model',

          messages: [
            {
              role:
                'user',

              content:
                'hello',
            },
          ],
        }),
      /provider failed/,
    );

    const snapshot =
      service.snapshot();

    assert.equal(
      snapshot.status,
      'error',
    );

    assert.equal(
      snapshot.lastError,
      'provider failed',
    );
  },
);