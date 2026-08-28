import { readFile, writeFile, copyFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';

const root = '/mnt/data/recon31';
const bundle = '/mnt/data/phase31-final-integration';

async function read(path) { return readFile(join(root, path), 'utf8'); }
async function write(path, value) { await mkdir(dirname(join(root, path)), { recursive: true }); await writeFile(join(root, path), value); }
async function replaceOnce(path, source, needle, replacement, label) {
  const count = source.split(needle).length - 1;
  if (count !== 1) throw new Error(`${label}: expected exactly 1 occurrence, got ${count}`);
  return source.replace(needle, replacement);
}

let channels = await read('src/electron/ipc/channels.ts');
if (!channels.includes('copilotChatSend:')) {
  channels = await replaceOnce(
    'src/electron/ipc/channels.ts',
    channels,
    "  audioAnalyzeAndPersist:\n    'audio:analyze-and-persist',\n",
    "  audioAnalyzeAndPersist:\n    'audio:analyze-and-persist',\n\n  copilotStatus:\n    'copilot:status',\n\n  copilotChatSend:\n    'copilot:chat-send',\n\n  copilotActionApprove:\n    'copilot:action-approve',\n\n  copilotActionReject:\n    'copilot:action-reject',\n",
    'channels'
  );
  await write('src/electron/ipc/channels.ts', channels);
}

let contracts = await read('src/electron/ipc/contracts.ts');
if (!contracts.includes('export interface CopilotUiStatus')) {
  contracts = await replaceOnce(
    'src/electron/ipc/contracts.ts',
    contracts,
    "export interface DJSyncRendererApi {\n",
    "export interface CopilotUiStatus {\n  readonly configured: boolean;\n  readonly provider: 'openai' | 'anthropic' | 'openai-compatible' | null;\n  readonly model: string | null;\n  readonly lastRequestAt: string | null;\n  readonly lastResponseAt: string | null;\n  readonly lastError: string | null;\n}\n\nexport interface CopilotActionUiResult {\n  readonly ok: boolean;\n  readonly approvalId: string | null;\n  readonly status: string | null;\n  readonly error: string | null;\n}\n\nexport interface DJSyncRendererApi {\n",
    'contracts types'
  );
  contracts = await replaceOnce(
    'src/electron/ipc/contracts.ts',
    contracts,
    "  audio: {\n",
    "  copilot: {\n    status(): Promise<CopilotUiStatus>;\n    chat(input: {\n      readonly conversationId: string;\n      readonly message: string;\n    }): Promise<\n      | { readonly ok: true; readonly result: unknown }\n      | { readonly ok: false; readonly error: { readonly code: string; readonly message: string } }\n    >;\n  };\n\n  copilotAction: {\n    approve(approvalId: string): Promise<CopilotActionUiResult>;\n    reject(approvalId: string): Promise<CopilotActionUiResult>;\n  };\n\n  audio: {\n",
    'contracts api'
  );
  await write('src/electron/ipc/contracts.ts', contracts);
}

let preload = await read('src/electron/preload.cts');
if (!preload.includes('copilotChatSend')) {
  preload = await replaceOnce(
    'src/electron/preload.cts',
    preload,
    "  audioAnalyzeAndPersist:\n    'audio:analyze-and-persist',\n",
    "  audioAnalyzeAndPersist:\n    'audio:analyze-and-persist',\n\n  copilotStatus:\n    'copilot:status',\n\n  copilotChatSend:\n    'copilot:chat-send',\n\n  copilotActionApprove:\n    'copilot:action-approve',\n\n  copilotActionReject:\n    'copilot:action-reject',\n",
    'preload channels'
  );
  preload = await replaceOnce(
    'src/electron/preload.cts',
    preload,
    "    audio: {\n",
    "    copilot: {\n      status: () =>\n        ipcRenderer.invoke(\n          IPC_CHANNELS.copilotStatus,\n        ),\n\n      chat: (input: {\n        conversationId: string;\n        message: string;\n      }) =>\n        ipcRenderer.invoke(\n          IPC_CHANNELS.copilotChatSend,\n          input,\n        ),\n    },\n\n    copilotAction: {\n      approve: (approvalId: string) =>\n        ipcRenderer.invoke(\n          IPC_CHANNELS.copilotActionApprove,\n          approvalId,\n        ),\n\n      reject: (approvalId: string) =>\n        ipcRenderer.invoke(\n          IPC_CHANNELS.copilotActionReject,\n          approvalId,\n        ),\n    },\n\n    audio: {\n",
    'preload api'
  );
  await write('src/electron/preload.cts', preload);
}

// Canonical renderer.d.ts bridge. Replace the legacy incompatible declaration only when it is the old API.
let rendererD = await read('src/electron/renderer.d.ts');
if (rendererD.includes('interface DJSyncApi') && rendererD.includes('applicationStatus()')) {
  rendererD = "import type { DJSyncRendererApi } from './ipc/contracts.js';\n\ndeclare global {\n  interface Window {\n    djSync: DJSyncRendererApi;\n  }\n}\n\nexport {};\n";
  await write('src/electron/renderer.d.ts', rendererD);
}

let html = await read('src/electron/renderer/index.html');
const startMarker = `        <section\n          id="view-dashboard"\n          class="view-section"\n        >`;
const endMarker = `        <section\n          id="view-library"`;
if (!html.includes(startMarker) || !html.includes(endMarker)) throw new Error('index.html dashboard markers not found');
const start = html.indexOf(startMarker);
const end = html.indexOf(endMarker);
if (start > end) throw new Error('index.html marker order invalid');
const productionSection = `        <section\n          id="view-dashboard"\n          class="view-section production-workspace-view"\n          aria-labelledby="production-workspace-title"\n        >\n          <h2 id="production-workspace-title" class="sr-only">DJ Sync Production Workspace</h2>\n          <div id="production-ui-root"></div>\n        </section>\n\n`;
html = html.slice(0, start) + productionSection + html.slice(end);
if (!html.includes('src="./production-ui-entry.js"')) {
  html = html.replace(
    `    <script\n      type="module"\n      src="./audio.js"\n    ></script>\n`,
    `    <script\n      type="module"\n      src="./audio.js"\n    ></script>\n    <script\n      type="module"\n      src="./production-ui-entry.js"\n    ></script>\n`
  );
}
if (!html.includes('production-workspace-view')) throw new Error('production workspace section missing after patch');
await write('src/electron/renderer/index.html', html);

let prod = await read('src/electron/renderer/production-ui/production-ui.ts');
prod = prod.replace(
  `  if (!action) {\n    return '';\n  }`,
  `  if (!action || action.status !== 'pending') {\n    return '';\n  }`
);
await write('src/electron/renderer/production-ui/production-ui.ts', prod);

let main = await read('src/electron/main.ts');
if (!main.includes('registerCopilotUiIpc')) {
  main = await replaceOnce(
    'src/electron/main.ts',
    main,
    "import {\n  registerIpcHandlers,\n} from './ipc/register.js';\n",
    "import {\n  registerIpcHandlers,\n} from './ipc/register.js';\n\nimport {\n  registerCopilotUiIpc,\n} from './ipc/copilot-ui-ipc.js';\n\nimport {\n  createDJSyncCopilotUiService,\n} from '../runtime/dj-sync-copilot-ui.js';\n\nimport {\n  createDJSyncCopilotActionController,\n} from '../runtime/dj-sync-copilot-action-controller.js';\n",
    'main imports'
  );
  main = await replaceOnce(
    'src/electron/main.ts',
    main,
    "const library =\n  createRekordboxLibraryService(\n    config,\n  );\n",
    "const library =\n  createRekordboxLibraryService(\n    config,\n  );\n\nconst copilotUi =\n  createDJSyncCopilotUiService();\n\nconst copilotActions =\n  createDJSyncCopilotActionController({\n    executor: {\n      async execute() {\n        throw new Error(\n          'Real DJ action execution is deferred to Phase 32.',\n        );\n      },\n    },\n  });\n",
    'main services'
  );
  main = await replaceOnce(
    'src/electron/main.ts',
    main,
    "    registerIpcHandlers({\n      applicationState,\n      library,\n      getAppInfo,\n    });\n",
    "    registerIpcHandlers({\n      applicationState,\n      library,\n      getAppInfo,\n    });\n\n    registerCopilotUiIpc({\n      chat: copilotUi,\n      actions: copilotActions,\n    });\n",
    'main ipc'
  );
  await write('src/electron/main.ts', main);
}

// Copy the integration modules into the clone.
await copyFile(join(bundle, 'src/runtime/dj-sync-copilot-ui.ts'), join(root, 'src/runtime/dj-sync-copilot-ui.ts'));
await copyFile(join(bundle, 'src/runtime/dj-sync-copilot-ui.test.ts'), join(root, 'src/runtime/dj-sync-copilot-ui.test.ts'));
await copyFile(join(bundle, 'src/electron/ipc/copilot-ui-ipc.ts'), join(root, 'src/electron/ipc/copilot-ui-ipc.ts'));
await copyFile(join(bundle, 'src/electron/renderer/production-ui/production-ui-types.ts'), join(root, 'src/electron/renderer/production-ui/production-ui-types.ts'));
await copyFile(join(bundle, 'src/electron/renderer/production-ui/production-ui-state.ts'), join(root, 'src/electron/renderer/production-ui/production-ui-state.ts'));
await copyFile(join(bundle, 'src/electron/renderer/production-ui/production-ui-format.ts'), join(root, 'src/electron/renderer/production-ui/production-ui-format.ts'));
await copyFile(join(bundle, 'src/electron/renderer/production-ui/production-ui.ts'), join(root, 'src/electron/renderer/production-ui/production-ui.ts'));
await copyFile(join(bundle, 'src/electron/renderer/production-ui/index.ts'), join(root, 'src/electron/renderer/production-ui/index.ts'));

console.log('Phase 31 integration applied to clone.');
