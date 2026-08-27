import type {
  ToolRegistry,
} from '../tools/tool-registry.js';

import {
  createActionPreview,
} from '../actions/action-preview.js';

import type {
  ValidatedDJAction,
} from '../actions/action-types.js';

import type {
  DJSyncCopilotActionGate,
} from '../../runtime/dj-sync-copilot-action-gate.js';

import {
  CopilotPermissionPolicy,
} from '../../security/copilot-permissions.js';

import type {
  AutonomousActionPort,
  AutonomousAuthorization,
  AutonomousReadToolExecutor,
} from './autonomous-copilot.js';

export function createRegistryReadExecutor(
  registry: ToolRegistry,
  now: () => string,
): AutonomousReadToolExecutor {
  return {
    async execute(input) {
      const context = {
        deviceId:
          input.deviceId,

        requestId:
          input.requestId,

        signal:
          input.signal,

        now,
      };

      const result =
        await registry.execute(
          input.tool,
          input.arguments,
          context,
        );

      if (!result.ok) {
        throw new Error(
          result.error.message,
        );
      }

      return result;
    },
  };
}

function riskForAction(
  action: ValidatedDJAction,
): 'write' | 'review' {
  return action.reversible
    ? 'write'
    : 'review';
}

export function createGateActionPort(
  gate: DJSyncCopilotActionGate,
  id: () => string,
): AutonomousActionPort {
  return {
    prepare(input) {
      const preview =
        createActionPreview({
          id:
            id(),

          action:
            input.action.action,

          reason:
            input.reason,

          risk:
            riskForAction(
              input.action,
            ),

          affectedResources:
            input.action
              .affectedResources,

          reversible:
            input.action
              .reversible,
        });

      return gate.prepare({
        preview,

        deviceId:
          input.deviceId,

        requestId:
          input.requestId,
      });
    },

    approve(
      approvalId,
    ) {
      return gate.approve(
        approvalId,
      );
    },

    reject(
      approvalId,
    ) {
      return gate.reject(
        approvalId,
      );
    },

    execute(input) {
      return gate.execute(
        input,
      );
    },
  };
}

export function createCopilotAuthorization(
  policy: CopilotPermissionPolicy,
): AutonomousAuthorization {
  return {
    assertAllowed(input) {
      policy.assertExecutable({
        toolName:
          input.toolName,

        risk:
          input.risk,

        mode:
          'interactive',
      });
    },
  };
}