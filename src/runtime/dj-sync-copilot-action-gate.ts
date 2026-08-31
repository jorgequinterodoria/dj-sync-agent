import type {
  ActionPreview,
} from '../ai/actions/action-preview.js';

import {
  InMemoryActionAudit,
} from '../ai/actions/action-audit.js';

import type {
  ApprovalGate,
  ApprovalDecision,
} from '../ai/actions/approval-gate.js';

import {
  InMemoryApprovalGate,
} from '../ai/actions/approval-gate.js';

export interface CopilotActionExecutor {
  execute(
    action: unknown,
  ): Promise<unknown>;
}

export interface DJSyncCopilotActionGateOptions {
  readonly approvalGate?: ApprovalGate;
  readonly executor: CopilotActionExecutor;
  readonly now?: () => string;
}

export interface PreparedCopilotAction {
  readonly preview: ActionPreview;
  readonly approval: ApprovalDecision;
}

export interface DJSyncCopilotActionGate {
  prepare(
    input: {
      readonly preview: ActionPreview;
      readonly deviceId: string;
      readonly requestId: string;
      readonly ttlMs?: number;
    },
  ): PreparedCopilotAction;

  approve(
    approvalId: string,
  ): ApprovalDecision;

  reject(
    approvalId: string,
  ): ApprovalDecision;

  execute(
    input: {
      readonly preview: ActionPreview;
      readonly approvalId: string;
      readonly token: string;
      readonly deviceId: string;
      readonly requestId: string;
    },
  ): Promise<unknown>;

  audit():
    ReturnType<
      InMemoryActionAudit['list']
    >;
}

function defaultNow(): string {
  return new Date().toISOString();
}

export function createDJSyncCopilotActionGate(
  options: DJSyncCopilotActionGateOptions,
): DJSyncCopilotActionGate {
  const now =
    options.now ??
    defaultNow;

  /*
   * IMPORTANT:
   *
   * The approval gate must use the exact same clock as
   * the surrounding runtime/controller.
   *
   * This is essential for:
   * - deterministic tests;
   * - simulated time;
   * - expiration checks;
   * - controller/gate state consistency.
   *
   * When an external ApprovalGate is supplied, ownership of
   * its clock remains with that implementation.
   */
  const gate =
    options.approvalGate ??
    new InMemoryApprovalGate({
      now,
    });

  const audit =
    new InMemoryActionAudit();

  return {
    prepare(input) {
      const timestamp =
        now();

      audit.append({
        event:
          'requested',

        actionId:
          input.preview.id,

        deviceId:
          input.deviceId,

        requestId:
          input.requestId,

        timestamp,
      });

      const approval =
        gate.request({
          preview:
            input.preview,

          deviceId:
            input.deviceId,

          requestId:
            input.requestId,

          now:
            timestamp,

          ...(input.ttlMs !==
          undefined
            ? {
                ttlMs:
                  input.ttlMs,
              }
            : {}),
        });

      audit.append({
        event:
          'previewed',

        actionId:
          input.preview.id,

        approvalId:
          approval.approvalId,

        deviceId:
          input.deviceId,

        requestId:
          input.requestId,

        timestamp:
          now(),
      });

      return {
        preview:
          input.preview,

        approval,
      };
    },

    approve(
      approvalId,
    ) {
      const approval =
        gate.approve(
          approvalId,
        );

      let event:
        | 'approved'
        | 'rejected'
        | 'expired';

      if (
        approval.status ===
        'approved'
      ) {
        event =
          'approved';
      } else if (
        approval.status ===
        'expired'
      ) {
        event =
          'expired';
      } else {
        event =
          'rejected';
      }

      audit.append({
        event,

        actionId:
          approval.previewId,

        approvalId:
          approval.approvalId,

        deviceId:
          approval.deviceId,

        requestId:
          approval.requestId,

        timestamp:
          now(),
      });

      return approval;
    },

    reject(
      approvalId,
    ) {
      const approval =
        gate.reject(
          approvalId,
        );

      audit.append({
        event:
          approval.status ===
          'expired'
            ? 'expired'
            : 'rejected',

        actionId:
          approval.previewId,

        approvalId:
          approval.approvalId,

        deviceId:
          approval.deviceId,

        requestId:
          approval.requestId,

        timestamp:
          now(),
      });

      return approval;
    },

    async execute(input) {
      try {
        const approval =
          gate.consume({
            approvalId:
              input.approvalId,

            token:
              input.token,

            preview:
              input.preview,

            deviceId:
              input.deviceId,

            requestId:
              input.requestId,

            now:
              now(),
          });

        const result =
          await options.executor.execute(
            input.preview.action,
          );

        audit.append({
          event:
            'executed',

          actionId:
            input.preview.id,

          approvalId:
            approval.approvalId,

          deviceId:
            input.deviceId,

          requestId:
            input.requestId,

          timestamp:
            now(),

          result,
        });

        return result;
      } catch (
        error
      ) {
        audit.append({
          event:
            'failed',

          actionId:
            input.preview.id,

          approvalId:
            input.approvalId,

          deviceId:
            input.deviceId,

          requestId:
            input.requestId,

          timestamp:
            now(),

          result:
            error instanceof Error
              ? error.message
              : String(error),
        });

        throw error;
      }
    },

    audit() {
      return audit.list();
    },
  };
}