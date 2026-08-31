import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createCopilotContextAssembler,
} from './copilot-context-assembler.js';

test('context assembler produces deterministic bounded context', () => {
  const assembler =
    createCopilotContextAssembler({
      budget: {
        maxMessages: 2,
        maxCandidates: 2,
        maxHistory: 1,
        maxMemoryResults: 1,
      },
    });

  const sources = {
    conversation: {
      summary: 'Set planning',
      recentMessages: [
        { id: '1', content: 'one' },
        { id: '2', content: 'two' },
        { id: '3', content: 'three' },
      ],
      constraints: [
        { key: 'maxBpm', value: '128' },
      ],
    },
    library: {
      candidates: [
        { id: 'a' },
        { id: 'b' },
        { id: 'c' },
      ],
      stats: { trackCount: 100 },
    },
    history: {
      recentPlays: [
        { trackId: 'a' },
        { trackId: 'b' },
      ],
    },
    semantic: {
      results: [
        { id: 'memory-1' },
        { id: 'memory-2' },
      ],
    },
  };

  const first = assembler.assemble(
    { userMessage: 'recommend' },
    sources,
  );

  const second = assembler.assemble(
    { userMessage: 'recommend' },
    sources,
  );

  assert.deepEqual(first, second);
  assert.equal(
    first.conversation.recentMessages.length,
    2,
  );
  assert.equal(
    first.library.candidates.length,
    2,
  );
  assert.equal(
    first.history.recentPlays.length,
    1,
  );
  assert.equal(
    first.semantic.results.length,
    1,
  );
});

test('context assembler rejects empty messages', () => {
  const assembler =
    createCopilotContextAssembler();

  assert.throws(
    () =>
      assembler.assemble(
        { userMessage: ' ' },
        {
          conversation: {
            summary: null,
            recentMessages: [],
            constraints: [],
          },
        },
      ),
    {
      message:
        'Copilot context user message is required.',
    },
  );
});
