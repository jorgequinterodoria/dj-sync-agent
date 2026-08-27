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

function requireCurrent(
  current:
    | CopilotActionControllerState
    | undefined,
): CopilotActionControllerState {
  if (!current) {
    throw new Error(
      'No action is pending.',
    );
  }

  return current;
}

function withoutError(
  state: CopilotActionControllerState,
): CopilotActionControllerState {
  const {
    error: _error,
    ...rest
  } = state;

  return rest;
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

      const state: CopilotActionControllerState = {
        preview:
          prepared.preview,

        approval:
          prepared.approval,

        status:
          statusFromApproval(
            prepared.approval,
          ),
      };

      current = state;

      return state;
    },

    approve(approvalId) {
      const existing =
        requireCurrent(current);

      if (
        existing.approval.approvalId !==
        approvalId
      ) {
        throw new Error(
          'Approval id does not match the current action.',
        );
      }

      if (
        existing.approval.status !==
        'pending'
      ) {
        return existing;
      }

      const approval =
        gate.approve(
          approvalId,
        );

      const next =
        withoutError({
          preview:
            existing.preview,

          approval,

          status:
            statusFromApproval(
              approval,
            ),
        });

      current = next;

      return next;
    },

    reject(approvalId) {
      const existing =
        requireCurrent(current);

      if (
        existing.approval.approvalId !==
        approvalId
      ) {
        throw new Error(
          'Approval id does not match the current action.',
        );
      }

      if (
        existing.approval.status !==
        'pending'
      ) {
        return existing;
      }

      const approval =
        gate.reject(
          approvalId,
        );

      const next =
        withoutError({
          preview:
            existing.preview,

          approval,

          status:
            statusFromApproval(
              approval,
            ),
        });

      current = next;

      return next;
    },

    async execute(input) {
      const existing =
        requireCurrent(current);

      if (
        existing.approval.status !==
        'approved'
      ) {
        return existing;
      }

      const token =
        existing.approval.token;

      if (!token) {
        const failed:
          CopilotActionControllerState = {
          preview:
            existing.preview,

          approval:
            existing.approval,

          status: 'failed',

          error:
            'Approved action is missing a token.',
        };

        current = failed;

        return failed;
      }

      try {
        const result =
          await gate.execute({
            preview:
              existing.preview,

            approvalId:
              existing.approval
                .approvalId,

            token,

            deviceId:
              input.deviceId,

            requestId:
              input.requestId,
          });

        const executed:
          CopilotActionControllerState = {
          preview:
            existing.preview,

          approval:
            existing.approval,

          status: 'executed',

          result,
        };

        current = executed;

        return executed;
      } catch (error: unknown) {
        const failed:
          CopilotActionControllerState = {
          preview:
            existing.preview,

          approval:
            existing.approval,

          status: 'failed',

          error:
            error instanceof Error
              ? error.message
              : String(error),
        };

        current = failed;

        return failed;
      }
    },
  };
}