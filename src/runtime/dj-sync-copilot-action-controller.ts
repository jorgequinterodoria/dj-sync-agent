import type {
  ActionPreview,
} from '../ai/actions/action-preview.js';

import type {
  ApprovalDecision,
} from '../ai/actions/approval-gate.js';

import {
  createDJSyncCopilotActionGate,
} from './dj-sync-copilot-action-gate.js';

import type {
  CopilotActionExecutor,
} from './dj-sync-copilot-action-gate.js';

export type CopilotActionUiStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'expired'
  | 'executed'
  | 'failed';

export interface CopilotActionControllerOptions {
  readonly executor:
    CopilotActionExecutor;

  readonly now?:
    () => string;
}

export interface CopilotActionControllerState {
  readonly preview:
    ActionPreview;

  readonly approval:
    ApprovalDecision;

  readonly status:
    CopilotActionUiStatus;

  readonly error?:
    string;

  readonly result?:
    unknown;
}

export interface DJSyncCopilotActionController {
  prepare(
    input: {
      readonly preview:
        ActionPreview;

      readonly deviceId:
        string;

      readonly requestId:
        string;

      readonly ttlMs?:
        number;
    },
  ):
    CopilotActionControllerState;

  approve(
    approvalId: string,
  ):
    CopilotActionControllerState;

  reject(
    approvalId: string,
  ):
    CopilotActionControllerState;

  execute(
    input: {
      readonly deviceId:
        string;

      readonly requestId:
        string;
    },
  ):
    Promise<
      CopilotActionControllerState
    >;
}

function statusFromApproval(
  approval:
    ApprovalDecision,
): CopilotActionUiStatus {
  switch (
    approval.status
  ) {
    case 'approved':
      return 'approved';

    case 'rejected':
      return 'rejected';

    case 'expired':
      return 'expired';

    case 'pending':
      return 'pending';
  }
}

function defaultNow(): string {
  return new Date().toISOString();
}

export function createDJSyncCopilotActionController(
  options:
    CopilotActionControllerOptions,
): DJSyncCopilotActionController {
  const now =
    options.now ??
    defaultNow;

  const gate =
    createDJSyncCopilotActionGate({
      executor:
        options.executor,

      now,
    });

  let current:
    | CopilotActionControllerState
    | undefined;

  return {
    prepare(input) {
      const prepared =
        gate.prepare(
          input,
        );

      current = {
        preview:
          prepared.preview,

        approval:
          prepared.approval,

        status:
          statusFromApproval(
            prepared.approval,
          ),
      };

      return current;
    },

    approve(
      approvalId,
    ) {
      if (
        current ===
        undefined
      ) {
        throw new Error(
          'No action is pending.',
        );
      }

      if (
        current.approval
          .approvalId !==
        approvalId
      ) {
        throw new Error(
          'Approval id does not match the current action.',
        );
      }

      if (
        current.approval.status !==
        'pending'
      ) {
        return current;
      }

      const approval =
        gate.approve(
          approvalId,
        );

      current = {
        ...current,

        approval,

        status:
          statusFromApproval(
            approval,
          ),
      };

      return current;
    },

    reject(
      approvalId,
    ) {
      if (
        current ===
        undefined
      ) {
        throw new Error(
          'No action is pending.',
        );
      }

      if (
        current.approval
          .approvalId !==
        approvalId
      ) {
        throw new Error(
          'Approval id does not match the current action.',
        );
      }

      if (
        current.approval.status !==
        'pending'
      ) {
        return current;
      }

      const approval =
        gate.reject(
          approvalId,
        );

      current = {
        ...current,

        approval,

        status:
          statusFromApproval(
            approval,
          ),
      };

      return current;
    },

    async execute(
      input,
    ) {
      if (
        current ===
        undefined
      ) {
        throw new Error(
          'No action is pending.',
        );
      }

      const action =
        current;

      if (
        action.approval.status !==
        'approved'
      ) {
        return action;
      }

      const token =
        action.approval.token;

      if (!token) {
        current = {
          ...action,

          status:
            'failed',

          error:
            'Approved action is missing a token.',
        };

        return current;
      }

      try {
        const result =
          await gate.execute({
            preview:
              action.preview,

            approvalId:
              action.approval
                .approvalId,

            token,

            deviceId:
              input.deviceId,

            requestId:
              input.requestId,
          });

        current = {
          ...action,

          status:
            'executed',

          result,
        };

        return current;
      } catch (
        error: unknown
      ) {
        const message =
          error instanceof Error
            ? error.message
            : String(error);

        /*
         * If the final execution boundary determines that the
         * approval expired, expose that precise UI state rather
         * than incorrectly reporting a generic failure.
         */
        if (
          /approval has expired/i.test(
            message,
          )
        ) {
          const expiredApproval:
            ApprovalDecision =
            {
              ...action.approval,
              status:
                'expired',
            };

          current = {
            ...action,

            approval:
              expiredApproval,

            status:
              'expired',
          };

          return current;
        }

        current = {
          ...action,

          status:
            'failed',

          error:
            message,
        };

        return current;
      }
    },
  };
}