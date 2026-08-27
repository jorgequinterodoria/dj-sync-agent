import type {
  ToolPlan,
  ToolPlanStep,
} from '../agent/tool-plan.js';

export interface PlanValidationOptions {
  readonly availableTools: ReadonlySet<string>;
  readonly maxSteps?: number;
  readonly maxToolCalls?: number;
  readonly approvalGranted?: boolean;
}

export interface PlanValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

export function validateToolPlan(
  plan: ToolPlan,
  options: PlanValidationOptions,
): PlanValidationResult {
  const errors: string[] = [];

  if (plan.schemaVersion !== 1) {
    errors.push(
      'Unsupported tool plan schema version.',
    );
  }

  const maxSteps =
    options.maxSteps ?? 8;

  const maxToolCalls =
    options.maxToolCalls ?? 12;

  if (
    !Number.isInteger(maxSteps) ||
    maxSteps < 1
  ) {
    errors.push(
      'maxSteps must be a positive integer.',
    );
  }

  if (
    !Number.isInteger(maxToolCalls) ||
    maxToolCalls < 1
  ) {
    errors.push(
      'maxToolCalls must be a positive integer.',
    );
  }

  if (plan.steps.length > maxSteps) {
    errors.push(
      `Plan contains ${plan.steps.length} steps; maximum is ${maxSteps}.`,
    );
  }

  let estimatedCalls = 0;

  const ids = new Set<string>();
  const stepById =
    new Map<string, ToolPlanStep>();

  for (const step of plan.steps) {
    estimatedCalls += 1;

    if (!step.id.trim()) {
      errors.push(
        'Plan contains a step without an id.',
      );
    }

    if (ids.has(step.id)) {
      errors.push(
        `Duplicate step id: ${step.id}`,
      );
    }

    ids.add(step.id);
    stepById.set(step.id, step);

    if (
      !options.availableTools.has(
        step.tool,
      )
    ) {
      errors.push(
        `Unknown tool in plan: ${step.tool}`,
      );
    }

    if (!step.reason.trim()) {
      errors.push(
        `Step ${step.id} requires a reason.`,
      );
    }

    for (const dependency of step.dependsOn) {
      if (dependency === step.id) {
        errors.push(
          `Step ${step.id} cannot depend on itself.`,
        );
        continue;
      }

      if (!stepById.has(dependency)) {
        errors.push(
          `Step ${step.id} has an unknown dependency: ${dependency}`,
        );
        continue;
      }

      const dependencyIndex =
        plan.steps.findIndex(
          (candidate) =>
            candidate.id === dependency,
        );

      const stepIndex =
        plan.steps.findIndex(
          (candidate) =>
            candidate.id === step.id,
        );

      if (
        dependencyIndex >= stepIndex
      ) {
        errors.push(
          `Step ${step.id} depends on a future step: ${dependency}`,
        );
      }
    }

    if (
      (step.risk === 'write' ||
        step.risk === 'review') &&
      options.approvalGranted !== true
    ) {
      errors.push(
        `Step ${step.id} requires approval.`,
      );
    }
  }

  if (estimatedCalls > maxToolCalls) {
    errors.push(
      `Plan contains ${estimatedCalls} tool calls; maximum is ${maxToolCalls}.`,
    );
  }

  const visit = new Set<string>();
  const active = new Set<string>();

  const detectCycle = (
    id: string,
  ): void => {
    if (active.has(id)) {
      errors.push(
        `Dependency cycle detected at step: ${id}`,
      );
      return;
    }

    if (visit.has(id)) {
      return;
    }

    active.add(id);

    const step = stepById.get(id);

    for (const dependency of step?.dependsOn ??
      []) {
      if (stepById.has(dependency)) {
        detectCycle(dependency);
      }
    }

    active.delete(id);
    visit.add(id);
  };

  for (const step of plan.steps) {
    detectCycle(step.id);
  }

  return {
    valid: errors.length === 0,
    errors: [
      ...new Set(errors),
    ],
  };
}
