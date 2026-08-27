import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createDJSyncCopilotContext,
} from './dj-sync-copilot-context.js';

test('runtime context assembles bounded context', () => {
  const context =
    createDJSyncCopilotContext({
      budget: {
        maxCandidates: 1,
      },
    });

  const result = context.assemble(
    {
      userMessage: 'recommend a track',
      currentTrackId: 'track-1',
    },
    {
      conversation: {
        summary: null,
        recentMessages: [],
        constraints: [],
      },
      library: {
        candidates: [
          { id: 'a' },
          { id: 'b' },
        ],
      },
    },
  );

  assert.equal(
    result.request.currentTrackId,
    'track-1',
  );
  assert.equal(
    result.library.candidates.length,
    1,
  );
});

test('runtime context keeps sources independent', () => {
  const context =
    createDJSyncCopilotContext();

  const result = context.assemble(
    {
      userMessage: 'hello',
    },
    {
      conversation: {
        summary: 'Conversation only',
        recentMessages: [],
        constraints: [],
      },
    },
  );

  assert.equal(
    result.track,
    null,
  );
  assert.deepEqual(
    result.semantic.results,
    [],
  );
});
