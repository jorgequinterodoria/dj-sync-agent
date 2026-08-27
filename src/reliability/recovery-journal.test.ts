import assert from 'node:assert/strict';
import test from 'node:test';

import {
  InMemoryRecoveryJournal,
} from './recovery-journal.js';

test('recovery journal restores the latest checkpoint', async () => {
  const journal =
    new InMemoryRecoveryJournal<{
      readonly step: string;
    }>();

  await journal.append({
    requestId:
      'request-1',
    status:
      'started',
    sequence:
      1,
    timestampMs:
      100,
  });

  await journal.append({
    requestId:
      'request-1',
    status:
      'checkpoint',
    sequence:
      2,
    timestampMs:
      200,
    checkpoint: {
      step:
        'search',
    },
  });

  const latest =
    await journal.latest(
      'request-1',
    );

  assert.deepEqual(
    latest?.checkpoint,
    {
      step:
        'search',
    },
  );
});

test('recovery journal isolates request ids', async () => {
  const journal =
    new InMemoryRecoveryJournal();

  await journal.append({
    requestId:
      'a',
    status:
      'completed',
    sequence:
      1,
    timestampMs:
      1,
  });

  await journal.append({
    requestId:
      'b',
    status:
      'completed',
    sequence:
      1,
    timestampMs:
      1,
  });

  assert.equal(
    (
      await journal.list(
        'a',
      )
    ).length,
    1,
  );

  assert.equal(
    (
      await journal.list(
        'b',
      )
    ).length,
    1,
  );
});
