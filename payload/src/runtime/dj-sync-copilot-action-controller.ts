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
  readonly executor: CopilotActionExecutor;
  readonly now?: () => string;
}

export interface CopilotActionControllerState {
  readonly preview: ActionPreview;
  readonly approval: ApprovalDecision;
  readonly status: CopilotActionUiStatus;
  readonly error?: string;
  readonly result?: unknown;
}

export interface DJSyncCopilotActionController {
  prepare(
    input: {
      readonly preview: ActionPreview;
      readonly deviceId: string;
      readonly requestId: string;
      readonly ttlMs?: number;
    },
  ): CopilotActionControllerState;

  approve(
    approvalId: string,
  ): CopilotActionControllerState;

  reject(
    approvalId: string,
  ): CopilotActionControllerState;

  approveAction(
    actionId: string,
  ): CopilotActionControllerState;

  rejectAction(
    actionId: string,
  ): CopilotActionControllerState;

  execute(
    input: {
      readonly deviceId: string;
      readonly requestId: string;
    },
  ): Promise<CopilotActionControllerState>;
}

function statusFromApproval(
  approval: ApprovalDecision,
): CopilotActionUiStatus {
  switch (approval.status) {
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

export function createDJSyncCopilotActionController(
  options: CopilotActionControllerOptions,
): DJSyncCopilotActionController {
  const gate =
    createDJSyncCopilotActionGate({
      executor:
        options.executor,
      ...(options.now !== undefined
        ? {
            now: options.now,
          }
        : {}),
    });

  let current:
    | CopilotActionControllerState
    | undefined;

  return {
    prepare(input) {
      const prepared =
        gate.prepare(input);

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

    approve(approvalId) {
      if (!current) {
        throw new Error(
          'No action is pending.',
        );
      }

      if (
        current.approval.approvalId !==
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
        error: undefined,
      };

      return current;
    },

    reject(approvalId) {
      if (!current) {
        throw new Error(
          'No action is pending.',
        );
      }

      if (
        current.approval.approvalId !==
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
        error: undefined,
      };

      return current;
    },

    approveAction(actionId) {
      if (!current) {
        throw new Error(
          'No action is pending.',
        );
      }

      if (current.preview.id !== actionId) {
        throw new Error(
          'Action id does not match the current action.',
        );
      }

      if (current.approval.status !== 'pending') {
        return current;
      }

      const approval = gate.approve(
        current.approval.approvalId,
      );

      current = {
        ...current,
        approval,
        status: statusFromApproval(approval),
        error: undefined,
      };

      return current;
    },

    rejectAction(actionId) {
      if (!current) {
        throw new Error(
          'No action is pending.',
        );
      }

      if (current.preview.id !== actionId) {
        throw new Error(
          'Action id does not match the current action.',
        );
      }

      if (current.approval.status !== 'pending') {
        return current;
      }

      const approval = gate.reject(
        current.approval.approvalId,
      );

      current = {
        ...current,
        approval,
        status: statusFromApproval(approval),
        error: undefined,
      };

      return current;
    },

    async execute(input) {
      if (!current) {
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
          status: 'failed',
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
          status: 'executed',
          result,
          error: undefined,
        };

        return current;
      } catch (error: unknown) {
        current = {
          ...action,
          status: 'failed',
          error:
            error instanceof Error
              ? error.message
              : String(error),
        };

        return current;
      }
    },
  };
}
