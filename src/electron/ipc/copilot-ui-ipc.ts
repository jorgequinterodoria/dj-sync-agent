import {
  ipcMain,
} from 'electron';

import {
  IPC_CHANNELS,
} from './channels.js';

import type {
  CopilotChatSendInput,
} from './copilot-chat-contracts.js';

import type {
  DJSyncCopilotUiService,
} from '../../runtime/dj-sync-copilot-ui.js';

import type {
  DJSyncCopilotActionController,
} from '../../runtime/dj-sync-copilot-action-controller.js';

export interface RegisterCopilotUiIpcOptions {
  readonly chat: DJSyncCopilotUiService;
  readonly actions: DJSyncCopilotActionController;
}

export interface CopilotActionUiResult {
  readonly ok: boolean;
  readonly approvalId: string | null;
  readonly status: string | null;
  readonly error: string | null;
}

export function registerCopilotUiIpc(
  options: RegisterCopilotUiIpcOptions,
): void {
  ipcMain.handle(
    IPC_CHANNELS.copilotStatus,
    () => options.chat.status(),
  );

  ipcMain.handle(
    IPC_CHANNELS.copilotChatSend,
    async (
      _event,
      input: CopilotChatSendInput,
    ) => {
      try {
        return {
          ok: true as const,
          result: await options.chat.send(input),
        };
      } catch (error: unknown) {
        return {
          ok: false as const,
          error: {
            code:
              'execution_failed' as const,
            message:
              error instanceof Error
                ? error.message
                : String(error),
          },
        };
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.copilotActionApprove,
    (
      _event,
      approvalId: string,
    ): CopilotActionUiResult => {
      try {
        const state =
          options.actions.approveAction(
            approvalId,
          );

        return {
          ok: true,
          approvalId:
            state.approval.approvalId,
          status: state.status,
          error: state.error ?? null,
        };
      } catch (error: unknown) {
        return {
          ok: false,
          approvalId: null,
          status: null,
          error:
            error instanceof Error
              ? error.message
              : String(error),
        };
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.copilotActionReject,
    (
      _event,
      approvalId: string,
    ): CopilotActionUiResult => {
      try {
        const state =
          options.actions.rejectAction(
            approvalId,
          );

        return {
          ok: true,
          approvalId:
            state.approval.approvalId,
          status: state.status,
          error: state.error ?? null,
        };
      } catch (error: unknown) {
        return {
          ok: false,
          approvalId: null,
          status: null,
          error:
            error instanceof Error
              ? error.message
              : String(error),
        };
      }
    },
  );
}
