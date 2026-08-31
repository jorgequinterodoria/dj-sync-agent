import assert from 'node:assert/strict';
import test from 'node:test';

import {
  mapWithConcurrency,
} from './bounded-concurrency.js';

test('bounded concurrency preserves input order', async () => {
  let active = 0;
  let maximum = 0;

  const result =
    await mapWithConcurrency(
      [1, 2, 3, 4],
      async (value) => {
        active += 1;
        maximum =
          Math.max(
            maximum,
            active,
          );

        await new Promise(
          (resolve) =>
            setTimeout(
              resolve,
              value === 1
                ? 15
                : 1,
            ),
        );

        active -= 1;

        return value * 2;
      },
      {
        concurrency: 2,
      },
    );

  assert.deepEqual(
    result,
    [2, 4, 6, 8],
  );

  assert.ok(
    maximum <= 2,
  );
});

test('bounded concurrency rejects invalid concurrency', async () => {
  await assert.rejects(
    () =>
      mapWithConcurrency(
        [1],
        async (value) =>
          value,
        {
          concurrency: 0,
        },
      ),
    /concurrency/i,
  );
});
