export type ActionRisk = 'write' | 'review';

export interface ActionPreview {
  readonly id: string;
  readonly action: unknown;
  readonly reason: string;
  readonly risk: ActionRisk;
  readonly affectedResources: readonly string[];
  readonly reversible: boolean;
}

function normalized(value: string, field: string): string {
  const result = value.trim();

  if (!result) {
    throw new Error(
      `Action preview ${field} is required.`,
    );
  }

  return result;
}

export function createActionPreview(
  input: Omit<ActionPreview, 'id'> & {
    readonly id?: string;
  },
): ActionPreview {
  const id = input.id === undefined
    ? crypto.randomUUID()
    : normalized(input.id, 'id');

  const reason = normalized(
    input.reason,
    'reason',
  );

  const resources = [
    ...new Set(
      input.affectedResources
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ];

  return {
    id,
    action: input.action,
    reason,
    risk: input.risk,
    affectedResources: resources,
    reversible: input.reversible,
  };
}

export function hashActionPreview(
  preview: ActionPreview,
): string {
  const serialized = JSON.stringify({
    id: preview.id,
    action: preview.action,
    reason: preview.reason,
    risk: preview.risk,
    affectedResources:
      preview.affectedResources,
    reversible:
      preview.reversible,
  });

  let hash = 2166136261;

  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (
    hash >>> 0
  ).toString(16).padStart(8, '0');
}
