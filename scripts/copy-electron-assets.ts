import {
  copyFile,
  mkdir,
} from 'node:fs/promises';
import {
  dirname,
  resolve,
} from 'node:path';
import {
  fileURLToPath,
} from 'node:url';

type Asset = Readonly<{
  readonly source: string;
  readonly destination: string;
}>;

const projectRoot = resolve(
  dirname(
    fileURLToPath(
      import.meta.url,
    ),
  ),
  '..',
);

const assets: readonly Asset[] = [
  {
    source:
      resolve(
        projectRoot,
        'src/electron/renderer/index.html',
      ),
    destination:
      resolve(
        projectRoot,
        'dist/electron/renderer/index.html',
      ),
  },
  {
    source:
      resolve(
        projectRoot,
        'src/electron/renderer/styles.css',
      ),
    destination:
      resolve(
        projectRoot,
        'dist/electron/renderer/styles.css',
      ),
  },
  {
    source:
      resolve(
        projectRoot,
        'src/electron/renderer/production-ui/production-ui.css',
      ),
    destination:
      resolve(
        projectRoot,
        'dist/electron/renderer/production-ui/production-ui.css',
      ),
  },
];

for (const asset of assets) {
  await mkdir(
    dirname(asset.destination),
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
