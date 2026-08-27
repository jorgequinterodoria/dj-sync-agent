import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createDJSyncCopilotAgentContext,
} from './dj-sync-copilot-agent.js';

test(
  'runtime copilot context provider delegates to assembler',
  async () => {
    const provider =
      createDJSyncCopilotAgentContext({
        budget: {
          maxCandidates: 1,
        },

        async sources() {
          return {
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
          };
        },
      });

    const context =
      await provider.build({
        userMessage:
          'recommend something',
      });

    assert.equal(
      context.schemaVersion,
      1,
    );

    assert.equal(
      context.library.candidates.length,
      1,
    );
  },
);
