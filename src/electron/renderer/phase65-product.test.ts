import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

test('PHASE65: dashboard metric slots are wired to live workspace stats', async () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const html = await readFile(join(here, 'index.html'), 'utf8');

  for (const id of [
    'stat-tracks',
    'stat-playlists',
    'stat-sets',
    'stat-hours',
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }

  assert.doesNotMatch(
    html,
    /<span class="label">Tracks<\/span><span class="value">8,742<\/span>/,
  );
});
