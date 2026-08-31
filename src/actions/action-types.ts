export const COPILOT_ACTION_ENGINE_VERSION = '1.0.0';

export type CopilotActionType =
  | 'audio.analyze'
  | 'intelligence.refresh'
  | 'memory.index'
  | 'reasoning.run';

export type CopilotActionRisk = 'safe' | 'review_required';

export interface CopilotActionContext {
  deviceId: string;
  trackId: string;
  request: string;
  reasoningId?: string | null;
  source?: string | null;
}

export interface CopilotAction {
  schemaVersion: 1;
  actionId: string;
  engineVersion: string;
  type: CopilotActionType;
  risk: CopilotActionRisk;
  requiresApproval: boolean;
  deviceId: string;
  trackId: string;
  input: Record<string, unknown>;
  rationale: string;
  confidence: number;
  createdAt: string;
}

export interface CopilotActionResult {
  schemaVersion: 1;
  actionId: string;
  actionType: CopilotActionType;
  status: 'completed' | 'failed' | 'rejected';
  output: Record<string, unknown>;
  error: string | null;
  startedAt: string;
  completedAt: string;
}

export interface CopilotActionRunRecord {
  id: number;
  deviceId: string;
  trackId: string;
  actionId: string;
  actionType: CopilotActionType;
  risk: CopilotActionRisk;
  approved: boolean;
  request: string;
  input: Record<string, unknown>;
  result: CopilotActionResult;
  createdAt: string;
}
