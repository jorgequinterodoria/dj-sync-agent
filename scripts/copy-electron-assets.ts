import {
  copyFile,
  mkdir,
} from 'node:fs/promises';

import {
  dirname,
  resolve,
} from 'node:path';

const projectRoot =
  resolve(
    import.meta.dirname,
    '..',
  );

const assets = [
  {
    source: resolve(
      projectRoot,
      'src/electron/renderer/index.html',
    ),
    destination: resolve(
      projectRoot,
      'dist/electron/renderer/index.html',
    ),
  },
  {
    source: resolve(
      projectRoot,
      'src/electron/renderer/styles.css',
    ),
    destination: resolve(
      projectRoot,
      'dist/electron/renderer/styles.css',
    ),
  },
];

for (
  const asset of assets
) {
  await mkdir(
    dirname(
      asset.destination,
    ),
    {
      recursive: true,
    },
  );

  await copyFile(
    asset.source,
    asset.destination,
  );
}

console.log(
  `Copied ${assets.length} Electron assets.`,
);