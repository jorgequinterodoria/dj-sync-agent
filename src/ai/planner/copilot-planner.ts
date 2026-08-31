import type {
  ToolPlan,
  ToolPlanStep,
} from '../agent/tool-plan.js';

export interface PlannerRequest {
  readonly userMessage: string;
  readonly availableTools: readonly string[];
}

export interface PlannerStepDraft {
  readonly id: string;
  readonly tool: string;
  readonly arguments: unknown;
  readonly reason: string;
  readonly dependsOn?: readonly string[];
  readonly risk: 'read' | 'write' | 'review';
}

export interface Planner {
  plan(
    request: PlannerRequest,
  ): Promise<ToolPlan>;
}

export interface CopilotPlannerOptions {
  readonly createPlan: (
    request: PlannerRequest,
  ) =>
    | readonly PlannerStepDraft[]
    | Promise<readonly PlannerStepDraft[]>;
  readonly maxPlanSteps?: number;
}

function positiveLimit(
  value: number | undefined,
  fallback: number,
): number {
  if (value === undefined) return fallback;

  if (!Number.isInteger(value) || value < 1) {
    throw new Error(
      'Planner maxPlanSteps must be a positive integer.',
    );
  }

  return value;
}

export class CopilotPlanner
  implements Planner {
  private readonly createPlan: CopilotPlannerOptions['createPlan'];
  private readonly maxPlanSteps: number;

  public constructor(
    options: CopilotPlannerOptions,
  ) {
    this.createPlan = options.createPlan;
    this.maxPlanSteps = positiveLimit(
      options.maxPlanSteps,
      8,
    );
  }

  public async plan(
    request: PlannerRequest,
  ): Promise<ToolPlan> {
    const userMessage =
      request.userMessage.trim();

    if (!userMessage) {
      throw new Error(
        'Planner user message is required.',
      );
    }

    const steps =
      await this.createPlan({
        userMessage,
        availableTools:
          [...request.availableTools].sort(
            (a, b) => a.localeCompare(b),
          ),
      });

    if (steps.length > this.maxPlanSteps) {
      throw new Error(
        `Planner step limit exceeded: ${this.maxPlanSteps}.`,
      );
    }

    const normalized: ToolPlanStep[] =
      steps.map((step) => ({
        id: step.id.trim(),
        tool: step.tool.trim(),
        arguments: step.arguments,
        reason: step.reason.trim(),
        dependsOn: [
          ...(step.dependsOn ?? []),
        ]
          .map((dependency) =>
            dependency.trim(),
          )
          .filter(Boolean),
        risk: step.risk,
      }));

    return {
      schemaVersion: 1,
      steps: normalized,
      requiresApproval: normalized.some(
        (step) =>
          step.risk === 'write' ||
          step.risk === 'review',
      ),
    };
  }
}

export function createCopilotPlanner(
  options: CopilotPlannerOptions,
): CopilotPlanner {
  return new CopilotPlanner(options);
}
