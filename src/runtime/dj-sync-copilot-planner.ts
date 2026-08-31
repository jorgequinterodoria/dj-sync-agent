import type {
  ToolPlan,
  ToolPlanStep,
} from '../ai/agent/tool-plan.js';

import {
  validateToolPlan,
} from '../ai/planner/plan-validator.js';

import {
  ExecutionState,
} from '../ai/planner/execution-state.js';

import type {
  ToolExecutionContext,
  ToolResult,
} from '../ai/tools/tool-types.js';

import type {
  ToolRegistry,
} from '../ai/tools/tool-registry.js';

export interface DJSyncCopilotPlannerOptions {
  readonly registry: ToolRegistry;
  readonly toolContext: ToolExecutionContext;
  readonly maxSteps?: number;
  readonly maxToolCalls?: number;
  readonly maxReplans?: number;
  readonly maxAttemptsPerStep?: number;
}

export interface ReplanRequest {
  readonly failedStep: ToolPlanStep;
  readonly error: string;
  readonly completed: readonly {
    readonly step: ToolPlanStep;
    readonly result: ToolResult;
  }[];
}

export interface ReplanProvider {
  replan(
    request: ReplanRequest,
  ): Promise<ToolPlan | null>;
}

export interface PlannerExecutionResult {
  readonly state: ReturnType<
    ExecutionState['snapshot']
  >;
  readonly results: readonly {
    readonly step: ToolPlanStep;
    readonly result: ToolResult;
  }[];
  readonly replans: number;
}

export class DJSyncCopilotPlanner {
  private readonly registry: ToolRegistry;
  private readonly toolContext: ToolExecutionContext;
  private readonly maxSteps: number;
  private readonly maxToolCalls: number;
  private readonly maxReplans: number;
  private readonly maxAttemptsPerStep: number;

  public constructor(
    options: DJSyncCopilotPlannerOptions,
  ) {
    this.registry = options.registry;
    this.toolContext =
      options.toolContext;

    this.maxSteps =
      options.maxSteps ?? 8;

    this.maxToolCalls =
      options.maxToolCalls ?? 12;

    this.maxReplans =
      options.maxReplans ?? 2;

    this.maxAttemptsPerStep =
      options.maxAttemptsPerStep ?? 2;
  }

  public async execute(
    plan: ToolPlan,
    replanProvider?: ReplanProvider,
  ): Promise<PlannerExecutionResult> {
    const validation =
      validateToolPlan(
        plan,
        {
          availableTools:
            new Set(
              this.registry
                .list()
                .map(
                  (tool) =>
                    tool.name,
                ),
            ),
          maxSteps:
            this.maxSteps,
          maxToolCalls:
            this.maxToolCalls,
        },
      );

    if (!validation.valid) {
      throw new Error(
        validation.errors.join(' '),
      );
    }

    const state =
      new ExecutionState(
        this.toolContext.now,
      );

    const results: {
      readonly step: ToolPlanStep;
      readonly result: ToolResult;
    }[] = [];

    let currentPlan = plan;
    let replans = 0;
    let toolCalls = 0;

    while (true) {
      let failedStep:
        | {
            readonly step: ToolPlanStep;
            readonly error: string;
          }
        | undefined;

      for (
        const step of currentPlan.steps
      ) {
        const current =
          state.get(step.id);

        if (
          current?.status ===
          'completed'
        ) {
          continue;
        }

        if (
          current?.status ===
          'blocked'
        ) {
          continue;
        }

        const dependencyFailed =
          step.dependsOn.some(
            (dependency) => {
              const dependencyState =
                state.get(
                  dependency,
                );

              return (
                dependencyState?.status ===
                  'failed' ||
                dependencyState?.status ===
                  'blocked'
              );
            },
          );

        if (dependencyFailed) {
          state.block(
            step.id,
            'A required dependency did not complete.',
          );
          continue;
        }

        const attempts =
          state.get(
            step.id,
          )?.attempts ?? 0;

        if (
          attempts >=
          this.maxAttemptsPerStep
        ) {
          state.block(
            step.id,
            'Maximum attempts per step exceeded.',
          );
          continue;
        }

        if (
          toolCalls >=
          this.maxToolCalls
        ) {
          state.block(
            step.id,
            'Maximum tool calls exceeded.',
          );
          continue;
        }

        state.start(step.id);

        try {
          const result =
            await this.registry.execute(
              step.tool,
              step.arguments,
              this.toolContext,
            );

          toolCalls += 1;

          if (!result.ok) {
            const message =
              result.error?.message ??
              'Tool execution failed.';

            state.fail(
              step.id,
              message,
            );

            failedStep = {
              step,
              error: message,
            };

            break;
          }

          state.complete(
            step.id,
            result,
          );

          results.push({
            step,
            result,
          });
        } catch (error: unknown) {
          toolCalls += 1;

          const message =
            error instanceof Error
              ? error.message
              : String(error);

          state.fail(
            step.id,
            message,
          );

          failedStep = {
            step,
            error: message,
          };

          break;
        }
      }

      if (!failedStep) {
        return {
          state: state.snapshot(),
          results,
          replans,
        };
      }

      if (
        replanProvider === undefined ||
        replans >= this.maxReplans
      ) {
        return {
          state: state.snapshot(),
          results,
          replans,
        };
      }

      replans += 1;

      const completed =
        results.filter(
          ({ step }) =>
            currentPlan.steps.some(
              (candidate) =>
                candidate.id ===
                step.id,
            ),
        );

      const nextPlan =
        await replanProvider.replan({
          failedStep:
            failedStep.step,
          error:
            failedStep.error,
          completed,
        });

      if (!nextPlan) {
        return {
          state: state.snapshot(),
          results,
          replans,
        };
      }

      const nextValidation =
        validateToolPlan(
          nextPlan,
          {
            availableTools:
              new Set(
                this.registry
                  .list()
                  .map(
                    (tool) =>
                      tool.name,
                  ),
              ),
            maxSteps:
              this.maxSteps,
            maxToolCalls:
              this.maxToolCalls,
          },
        );

      if (!nextValidation.valid) {
        throw new Error(
          `Replanned tool plan is invalid: ${nextValidation.errors.join(' ')}`,
        );
      }

      currentPlan = nextPlan;
    }
  }
}
