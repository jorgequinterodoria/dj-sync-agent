import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = process.cwd();
const here = dirname(fileURLToPath(import.meta.url));
const payload = resolve(decodeURIComponent(here), 'payload');

// Fail early with a useful message if the Phase 31 payload is incomplete.
const canonicalActionController = join(
  payload,
  'src/runtime/dj-sync-copilot-action-controller.ts',
);

try {
  await readFile(canonicalActionController);
} catch {
  throw new Error(
    'Phase 31 payload is incomplete: missing src/runtime/dj-sync-copilot-action-controller.ts',
  );
}

async function readRepo(relativePath) {
  return readFile(join(repo, relativePath), 'utf8');
}

async function writeRepo(relativePath, value) {
  const path = join(repo, relativePath);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, value);
}

function replaceOnce(source, needle, replacement, label) {
  const count = source.split(needle).length - 1;
  if (count !== 1) {
    throw new Error(`${label}: expected exactly one match, got ${count}`);
  }
  return source.replace(needle, replacement);
}

async function copyPayload(relativePath) {
  const target = join(repo, relativePath);
  await mkdir(dirname(target), { recursive: true });
  await copyFile(join(payload, relativePath), target);
}

// 1. Public IPC channels.
let channels = await readRepo('src/electron/ipc/channels.ts');
if (!channels.includes('copilotChatSend:')) {
  channels = replaceOnce(
    channels,
    "  audioAnalyzeAndPersist:\n    'audio:analyze-and-persist',\n",
    "  audioAnalyzeAndPersist:\n    'audio:analyze-and-persist',\n\n  copilotStatus:\n    'copilot:status',\n\n  copilotChatSend:\n    'copilot:chat-send',\n\n  copilotActionApprove:\n    'copilot:action-approve',\n\n  copilotActionReject:\n    'copilot:action-reject',\n",
    'channels'
  );
  await writeRepo('src/electron/ipc/channels.ts', channels);
}

// 2. Renderer contract. Preserve all unrelated contracts already present.
let contracts = await readRepo('src/electron/ipc/contracts.ts');
if (!contracts.includes('export interface CopilotUiStatus')) {
  contracts = replaceOnce(
    contracts,
    'export interface DJSyncRendererApi {\n',
    `export interface CopilotUiStatus {\n  readonly configured: boolean;\n  readonly provider: 'openai' | 'anthropic' | 'openai-compatible' | null;\n  readonly model: string | null;\n  readonly lastRequestAt: string | null;\n  readonly lastResponseAt: string | null;\n  readonly lastError: string | null;\n}\n\nexport interface CopilotActionUiResult {\n  readonly ok: boolean;\n  readonly approvalId: string | null;\n  readonly status: string | null;\n  readonly error: string | null;\n}\n\nexport interface DJSyncRendererApi {\n`,
    'contracts types'
  );
  contracts = replaceOnce(
    contracts,
    '  audio: {\n',
    `  copilot: {\n    status(): Promise<CopilotUiStatus>;\n    chat(input: {\n      readonly conversationId: string;\n      readonly message: string;\n    }): Promise<\n      | { readonly ok: true; readonly result: unknown }\n      | { readonly ok: false; readonly error: { readonly code: string; readonly message: string } }\n    >;\n  };\n\n  copilotAction: {\n    approve(actionId: string): Promise<CopilotActionUiResult>;\n    reject(actionId: string): Promise<CopilotActionUiResult>;\n  };\n\n  audio: {\n`,
    'contracts api'
  );
  await writeRepo('src/electron/ipc/contracts.ts', contracts);
}

// 3. Secure preload surface; only narrow IPC methods cross the bridge.
let preload = await readRepo('src/electron/preload.cts');
if (!preload.includes('copilotChatSend')) {
  preload = replaceOnce(
    preload,
    "  audioAnalyzeAndPersist:\n    'audio:analyze-and-persist',\n",
    "  audioAnalyzeAndPersist:\n    'audio:analyze-and-persist',\n\n  copilotStatus:\n    'copilot:status',\n\n  copilotChatSend:\n    'copilot:chat-send',\n\n  copilotActionApprove:\n    'copilot:action-approve',\n\n  copilotActionReject:\n    'copilot:action-reject',\n",
    'preload channels'
  );
  preload = replaceOnce(
    preload,
    '    audio: {\n',
    `    copilot: {\n      status: () =>\n        ipcRenderer.invoke(\n          IPC_CHANNELS.copilotStatus,\n        ),\n\n      chat: (input: {\n        conversationId: string;\n        message: string;\n      }) =>\n        ipcRenderer.invoke(\n          IPC_CHANNELS.copilotChatSend,\n          input,\n        ),\n    },\n\n    copilotAction: {\n      approve: (actionId: string) =>\n        ipcRenderer.invoke(\n          IPC_CHANNELS.copilotActionApprove,\n          actionId,\n        ),\n\n      reject: (actionId: string) =>\n        ipcRenderer.invoke(\n          IPC_CHANNELS.copilotActionReject,\n          actionId,\n        ),\n    },\n\n    audio: {\n`,
    'preload api'
  );
  await writeRepo('src/electron/preload.cts', preload);
}

// 4. Main window initialization: use the existing application runtime and add the Copilot UI boundary.
let main = await readRepo('src/electron/main.ts');
if (!main.includes('registerCopilotUiIpc')) {
  main = replaceOnce(
    main,
    "import {\n  registerIpcHandlers,\n} from './ipc/register.js';\n",
    `import {\n  registerIpcHandlers,\n} from './ipc/register.js';\n\nimport {\n  registerCopilotUiIpc,\n} from './ipc/copilot-ui-ipc.js';\n\nimport {\n  createDJSyncCopilotUiService,\n} from '../runtime/dj-sync-copilot-ui.js';\n\nimport {\n  createDJSyncCopilotActionController,\n} from '../runtime/dj-sync-copilot-action-controller.js';\n`,
    'main imports'
  );
  main = replaceOnce(
    main,
    `const library =\n  createRekordboxLibraryService(\n    config,\n  );\n`,
    `const library =\n  createRekordboxLibraryService(\n    config,\n  );\n\nconst copilotUi =\n  createDJSyncCopilotUiService();\n\nconst copilotActions =\n  createDJSyncCopilotActionController({\n    executor: {\n      async execute() {\n        throw new Error(\n          'Real DJ action execution is deferred to Phase 32.',\n        );\n      },\n    },\n  });\n`,
    'main services'
  );
  main = replaceOnce(
    main,
    `    registerIpcHandlers({\n      applicationState,\n      library,\n      getAppInfo,\n    });\n`,
    `    registerIpcHandlers({\n      applicationState,\n      library,\n      getAppInfo,\n    });\n\n    registerCopilotUiIpc({\n      chat: copilotUi,\n      actions: copilotActions,\n    });\n`,
    'main IPC registration'
  );
  await writeRepo('src/electron/main.ts', main);
}

// 5. Replace only the obsolete renderer type declaration if that exact legacy surface is still present.
const rendererD = await readRepo('src/electron/renderer.d.ts');
if (rendererD.includes('interface DJSyncApi') && rendererD.includes('applicationStatus()')) {
  await writeRepo(
    'src/electron/renderer.d.ts',
    `import type { DJSyncRendererApi } from './ipc/contracts.js';\n\ndeclare global {\n  interface Window {\n    djSync: DJSyncRendererApi;\n  }\n}\n\nexport {};\n`,
  );
}

// 6. Make Dashboard the Production Workspace. Library and Audio remain untouched.
let html = await readRepo('src/electron/renderer/index.html');
if (!html.includes('id="production-ui-root"')) {
  const startMarker = `        <section\n          id="view-dashboard"`;
  const libraryMarker = `        <section\n          id="view-library"`;
  const start = html.indexOf(startMarker);
  const end = html.indexOf(libraryMarker);
  if (start < 0 || end < 0 || start >= end) {
    throw new Error('index.html dashboard/library boundaries were not found.');
  }
  const dashboardSection = `        <section\n          id="view-dashboard"\n          class="view-section production-workspace-view"\n          aria-labelledby="production-workspace-title"\n        >\n          <h2 id="production-workspace-title" class="ds-sr-only">DJ Sync Production Workspace</h2>\n          <div id="production-ui-root"></div>\n        </section>\n\n`;
  html = html.slice(0, start) + dashboardSection + html.slice(end);
}
if (!html.includes('src="./production-ui-entry.js"')) {
  const audioScript = `    <script\n      type="module"\n      src="./audio.js"\n    ></script>\n`;
  html = replaceOnce(
    html,
    audioScript,
    `${audioScript}    <script\n      type="module"\n      src="./production-ui-entry.js"\n    ></script>\n`,
    'index.html production entry'
  );
}
await writeRepo('src/electron/renderer/index.html', html);

// 7. Phase 31 action cards are visible only for genuinely pending approvals.
const productionUiPath = 'src/electron/renderer/production-ui/production-ui.ts';
let productionUi = await readRepo(productionUiPath);
if (productionUi.includes('if (!action) {')) {
  productionUi = productionUi.replace(
    'if (!action) {\n    return \'\';\n  }',
    "if (!action || action.status !== 'pending') {\n    return '';\n  }",
  );
  await writeRepo(productionUiPath, productionUi);
}

// 8. Install the canonical Phase 31 action controller.
//
// The action-controller implementation already exists as part of this Phase 31
// payload. Earlier versions of this installer tried to patch the user's
// Phase 30 file with whitespace-sensitive text anchors. That is unsafe because
// equivalent implementations can have different formatting/signatures. The
// Phase 31 controller is now the authoritative boundary implementation, so
// install it atomically and avoid brittle source rewriting.
await copyPayload('src/runtime/dj-sync-copilot-action-controller.ts');

// 9. New integration modules and focused tests.
for (const file of [
  'src/runtime/dj-sync-copilot-ui.ts',
  'src/runtime/dj-sync-copilot-ui.test.ts',
  'src/electron/ipc/copilot-ui-ipc.ts',
  'src/electron/renderer/production-ui-entry.ts',
  'src/electron/renderer/production-ui-entry.test.ts',
]) {
  await copyPayload(file);
}

console.log('Phase 31 final integration applied successfully.');
