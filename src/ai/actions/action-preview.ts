import { secureActionHash, secureId } from '../../security/secure-approval.js';

export type ActionRisk = 'write' | 'review';

export interface ActionPreview {
  readonly id: string;
  readonly action: unknown;
  readonly reason: string;
  readonly risk: ActionRisk;
  readonly affectedResources: readonly string[];
  readonly reversible: boolean;
  readonly actionHash: string;
}

function required(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`Action preview ${field} is required.`);
  return normalized;
}

export function createActionPreview(
  input: Omit<ActionPreview, 'id' | 'actionHash'> & { readonly id?: string },
): ActionPreview {
  const id = input.id === undefined ? secureId() : required(input.id, 'id');
  const reason = required(input.reason, 'reason');
  const affectedResources = [...new Set(
    input.affectedResources.map((value) => value.trim()).filter(Boolean),
  )];
  const actionHash = secureActionHash({
    action: input.action,
    reason,
    risk: input.risk,
    affectedResources,
    reversible: input.reversible,
  });

  return {
    id,
    action: input.action,
    reason,
    risk: input.risk,
    affectedResources,
    reversible: input.reversible,
    actionHash,
  };
}

export function hashActionPreview(preview: ActionPreview): string {
  return preview.actionHash;
}
