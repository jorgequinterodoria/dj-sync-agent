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
  CopilotPendingActionView,
} from './contracts.js';

import type {
  DJSyncCopilotUiService,
} from '../../runtime/dj-sync-copilot-ui.js';

import type {
  DJSyncCopilotActionController,
  CopilotActionControllerState,
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

function toPendingActionView(
  state: CopilotActionControllerState | undefined,
): CopilotPendingActionView | null {
  if (!state) {
    return null;
  }

  const preview =
    state.preview;

  if (state.status !== 'pending') {
    return null;
  }

  return {
    id: preview.id,
    title: preview.reason,
    description: preview.reason,
    risk: preview.risk,
    affectedResources:
      preview.affectedResources,
    reversible: preview.reversible,
    status: state.status,
    approvalId:
      state.approval.approvalId,
  };
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
    IPC_CHANNELS.copilotActionGetCurrent,
    (): CopilotPendingActionView | null => {
      const state =
        options.actions.getCurrentState();

      return toPendingActionView(state);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.copilotActionApprove,
    (
      _event,
      actionId: string,
    ): CopilotActionUiResult => {
      try {
        const state =
          options.actions.approveAction(
            actionId,
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
      actionId: string,
    ): CopilotActionUiResult => {
      try {
        const state =
          options.actions.rejectAction(
            actionId,
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
