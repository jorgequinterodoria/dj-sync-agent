import type {
  ToolExecutionContext,
  ToolResult,
} from '../ai/tools/tool-types.js';

import type {
  ToolRegistry,
} from '../ai/tools/tool-registry.js';

import {
  ToolSelectionPolicy,
} from '../ai/agent/tool-selection-policy.js';

import type {
  ToolPlan,
  ToolPlanStep,
} from '../ai/agent/tool-plan.js';

import {
  ToolResultMemory,
} from '../ai/agent/tool-result-memory.js';

export interface DJSyncToolOrchestratorOptions {
  readonly registry: ToolRegistry;
  readonly policy: ToolSelectionPolicy;
  readonly toolContext: ToolExecutionContext;
}

export interface ToolOrchestrationResult {
  readonly completed: readonly {
    readonly step: ToolPlanStep;
    readonly result: ToolResult;
    readonly cached: boolean;
  }[];
  readonly blocked: readonly {
    readonly step: ToolPlanStep;
    readonly reason: string;
  }[];
}

export class DJSyncToolOrchestrator {
  private readonly registry: ToolRegistry;
  private readonly policy: ToolSelectionPolicy;
  private readonly toolContext: ToolExecutionContext;
  private readonly memory =
    new ToolResultMemory();

  public constructor(
    options: DJSyncToolOrchestratorOptions,
  ) {
    this.registry = options.registry;
    this.policy = options.policy;
    this.toolContext = options.toolContext;
  }

  public async executePlan(
    plan: ToolPlan,
  ): Promise<ToolOrchestrationResult> {
    const completed: {
      readonly step: ToolPlanStep;
      readonly result: ToolResult;
      readonly cached: boolean;
    }[] = [];

    const blocked: {
      readonly step: ToolPlanStep;
      readonly reason: string;
    }[] = [];

    for (const step of plan.steps) {
      const decision =
        this.policy.decide(step.tool);

      if (!decision.allowed) {
        blocked.push({
          step,
          reason: decision.reason,
        });
        continue;
      }

      const dependencyBlocked =
        step.dependsOn.some(
          (dependency) =>
            blocked.some(
              (entry) =>
                entry.step.id ===
                dependency,
            ),
        );

      if (dependencyBlocked) {
        blocked.push({
          step,
          reason:
            'A required dependency was blocked.',
        });
        continue;
      }

      const callKey =
        this.buildCallKey(step);

      const cached =
        this.memory.get(callKey);

      if (cached) {
        completed.push({
          step,
          result:
            cached.result as ToolResult,
          cached: true,
        });
        continue;
      }

      const result =
        await this.registry.execute(
          step.tool,
          step.arguments,
          this.toolContext,
        );

      this.memory.remember({
        callKey,
        tool: step.tool,
        result,
      });

      completed.push({
        step,
        result,
        cached: false,
      });
    }

    return {
      completed,
      blocked,
    };
  }

  public clearMemory(): void {
    this.memory.clear();
  }

  private buildCallKey(
    step: ToolPlanStep,
  ): string {
    return [
      step.tool,
      JSON.stringify(step.arguments),
    ].join(':');
  }
}
