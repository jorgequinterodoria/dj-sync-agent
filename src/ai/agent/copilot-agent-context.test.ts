import assert from 'node:assert/strict';
import test from 'node:test';

import {
  serializeCopilotContext,
} from './copilot-agent-context.js';

test(
  'copilot context serialization is versioned',
  () => {
    const context = {
      schemaVersion: 1 as const,
      request: {
        userMessage: 'recommend',
      },
      conversation: {
        summary: null,
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

    const serialized =
      serializeCopilotContext(
        context,
      );

    assert.match(
      serialized,
      /^DJ_COPILOT_CONTEXT_V1\n/,
    );

    assert.match(
      serialized,
      /END_DJ_COPILOT_CONTEXT_V1$/,
    );
  },
);
