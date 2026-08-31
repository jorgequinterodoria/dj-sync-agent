import { access, stat } from 'node:fs/promises';
import { constants } from 'node:fs';

import {
  validateProductionRelease,
} from '../src/electron/production-release.js';

const REQUIRED = [
  'dist/electron/main.js',
  'dist/electron/preload.cjs',
];

const RELEASE_DIR = 'release';

async function exists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  for (const path of REQUIRED) {
    if (!await exists(path)) {
      throw new Error(
        `Required Electron build artifact is missing: ${path}`,
      );
    }
  }

  if (!await exists(RELEASE_DIR)) {
    throw new Error(
      `Release directory is missing: ${RELEASE_DIR}`,
    );
  }

  const entries = await (await import('node:fs/promises')).readdir(
    RELEASE_DIR,
    { withFileTypes: true },
  );

  const artifacts = [];

  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }

    const path = `${RELEASE_DIR}/${entry.name}`;
    const info = await stat(path);

    if (info.size > 0) {
      artifacts.push({
        name: entry.name,
        bytes: info.size,
      });
    }
  }

  const result = validateProductionRelease({
    requiredBuildArtifacts: REQUIRED,
    releaseArtifacts: artifacts,
  });

  console.log(
    JSON.stringify(
      {
        ok: result.ok,
        artifacts: result.releaseArtifacts,
      },
      null,
      2,
    ),
  );
}

await main();
