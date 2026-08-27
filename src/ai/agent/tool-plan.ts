export interface ToolPlanStep {
  readonly id: string;
  readonly tool: string;
  readonly arguments: unknown;
  readonly reason: string;
  readonly dependsOn: readonly string[];
  readonly risk: 'read' | 'write' | 'review';
}

export interface ToolPlan {
  readonly schemaVersion: 1;
  readonly steps: readonly ToolPlanStep[];
  readonly requiresApproval: boolean;
}

function normalizeId(
  value: string,
): string {
  const normalized = value.trim();

  if (!normalized) {
    throw new Error(
      'Tool plan step id is required.',
    );
  }

  return normalized;
}

export function createToolPlan(
  steps: readonly ToolPlanStep[],
): ToolPlan {
  const normalized: ToolPlanStep[] = [];
  const seenIds = new Set<string>();
  let requiresApproval = false;

  for (const step of steps) {
    const id = normalizeId(step.id);

    if (seenIds.has(id)) {
      throw new Error(
        `Duplicate tool plan step id: ${id}`,
      );
    }

    seenIds.add(id);

    const dependencies = [
      ...new Set(
        step.dependsOn
          .map((value) => value.trim())
          .filter(Boolean),
      ),
    ];

    for (const dependency of dependencies) {
      if (!seenIds.has(dependency)) {
        throw new Error(
          `Tool plan dependency must reference a previous step: ${dependency}`,
        );
      }
    }

    if (
      step.risk === 'write' ||
      step.risk === 'review'
    ) {
      requiresApproval = true;
    }

    normalized.push({
      ...step,
      id,
      tool: step.tool.trim(),
      reason: step.reason.trim(),
      dependsOn: dependencies,
    });
  }

  return {
    schemaVersion: 1,
    steps: normalized,
    requiresApproval,
  };
}
