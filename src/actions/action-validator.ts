import type {
  CopilotAction,
  CopilotActionType,
} from './action-types.js';

const SUPPORTED_TYPES: readonly CopilotActionType[] = [
  'audio.analyze',
  'intelligence.refresh',
  'memory.index',
  'reasoning.run',
];

function clampConfidence(value: unknown): number {
  const numberValue = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numberValue)) return 0;
  return Math.max(0, Math.min(1, numberValue));
}

function requiredString(
  value: unknown,
  field: string,
): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Action ${field} is required.`);
  }
  return value.trim();
}

export function validateCopilotAction(
  action: CopilotAction,
): CopilotAction {
  if (action.schemaVersion !== 1) {
    throw new Error('Unsupported copilot action schema version.');
  }

  requiredString(action.actionId, 'action id');
  requiredString(action.deviceId, 'device id');
  requiredString(action.trackId, 'track id');
  requiredString(action.rationale, 'rationale');

  if (!SUPPORTED_TYPES.includes(action.type)) {
    throw new Error(`Unsupported copilot action type: ${String(action.type)}`);
  }

  if (action.risk !== 'safe' && action.risk !== 'review_required') {
    throw new Error(`Unsupported copilot action risk: ${String(action.risk)}`);
  }

  if (typeof action.requiresApproval !== 'boolean') {
    throw new Error('Action requiresApproval must be a boolean.');
  }

  if (!action.input || typeof action.input !== 'object' || Array.isArray(action.input)) {
    throw new Error('Action input must be an object.');
  }

  if (action.risk === 'review_required' && !action.requiresApproval) {
    throw new Error('Review-required actions must require approval.');
  }

  return {
    ...action,
    deviceId: action.deviceId.trim(),
    trackId: action.trackId.trim(),
    rationale: action.rationale.trim(),
    confidence: clampConfidence(action.confidence),
  };
}
