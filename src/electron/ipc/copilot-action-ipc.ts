import type {
  CopilotActionExecuteInput,
  CopilotActionMutationResult,
  CopilotActionPrepareInput,
} from './copilot-action-contracts.js';

import type {
  DJSyncCopilotActionGate,
  PreparedCopilotAction,
} from '../../runtime/dj-sync-copilot-action-gate.js';

export interface CopilotActionIpc {
  prepare(
    input: CopilotActionPrepareInput,
  ): PreparedCopilotAction;

  approve(
    approvalId: string,
  ): CopilotActionMutationResult;

  reject(
    approvalId: string,
  ): CopilotActionMutationResult;

  execute(
    input: CopilotActionExecuteInput,
  ): Promise<CopilotActionMutationResult>;
}

function errorMessage(
  error: unknown,
): string {
  return error instanceof Error
    ? error.message
    : String(error);
}

export function createCopilotActionIpc(
  gate: DJSyncCopilotActionGate,
): CopilotActionIpc {
  return {
    prepare: (input) =>
      gate.prepare(input),

    approve(approvalId) {
      try {
        return {
          ok: true,
          approval:
            gate.approve(
              approvalId,
            ),
        };
      } catch (error) {
        return {
          ok: false,
          error:
            errorMessage(error),
        };
      }
    },

    reject(approvalId) {
      try {
        return {
          ok: true,
          approval:
            gate.reject(
              approvalId,
            ),
        };
      } catch (error) {
        return {
          ok: false,
          error:
            errorMessage(error),
        };
      }
    },

    async execute(input) {
      try {
        return {
          ok: true,
          result:
            await gate.execute(
              input,
            ),
        };
      } catch (error) {
        return {
          ok: false,
          error:
            errorMessage(error),
        };
      }
    },
  };
}
