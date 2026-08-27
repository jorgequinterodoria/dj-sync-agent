import type {
  ActionPreview,
} from '../../ai/actions/action-preview.js';
import type {
  ApprovalDecision,
} from '../../ai/actions/approval-gate.js';

export interface CopilotActionPrepareInput {
  readonly preview: ActionPreview;
  readonly deviceId: string;
  readonly requestId: string;
  readonly ttlMs?: number;
}

export interface CopilotActionExecuteInput {
  readonly preview: ActionPreview;
  readonly approvalId: string;
  readonly token: string;
  readonly deviceId: string;
  readonly requestId: string;
}

export type CopilotActionMutationResult =
  | {
      readonly ok: true;
      readonly approval?: ApprovalDecision;
      readonly result?: unknown;
    }
  | {
      readonly ok: false;
      readonly error: string;
    };
