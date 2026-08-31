import assert from 'node:assert/strict';
import test from 'node:test';

import {
  validateProductionRelease,
} from './production-release.js';

test('production release accepts required build and release artifacts', () => {
  const result = validateProductionRelease({
    requiredBuildArtifacts: [
      'dist/electron/main.js',
      'dist/electron/preload.cjs',
    ],
    releaseArtifacts: [
      {
        name: 'DJ-Sync-Agent-0.9.4-mac-arm64.dmg',
        bytes: 100,
      },
      {
        name: 'DJ-Sync-Agent-0.9.4-mac-arm64.zip',
        bytes: 200,
      },
    ],
  });

  assert.equal(result.ok, true);
  assert.equal(result.releaseArtifacts.length, 2);
});

test('production release rejects an empty artifact list', () => {
  assert.throws(
    () =>
      validateProductionRelease({
        requiredBuildArtifacts: ['dist/electron/main.js'],
        releaseArtifacts: [],
      }),
    /No non-empty release artifacts/,
  );
});

test('production release rejects zero-byte artifacts', () => {
  assert.throws(
    () =>
      validateProductionRelease({
        requiredBuildArtifacts: ['dist/electron/main.js'],
        releaseArtifacts: [
          { name: 'release.zip', bytes: 0 },
        ],
      }),
    /non-empty files/,
  );
});

test('production release rejects blank required paths', () => {
  assert.throws(
    () =>
      validateProductionRelease({
        requiredBuildArtifacts: [''],
        releaseArtifacts: [
          { name: 'release.zip', bytes: 10 },
        ],
      }),
    /paths cannot be blank/,
  );
});
