import type {
  AutonomousCycleResult,
  AutonomousOrchestrator,
  AutonomousStageExecutor,
  OrchestrationContext,
  OrchestrationStage,
  StageResult,
} from './autonomous-copilot-types.js';

const STAGES: readonly OrchestrationStage[] = [
  'sync',
  'analysis',
  'intelligence',
  'memory',
  'reasoning',
  'recommendation',
  'personalization',
  'action',
];

function id(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function now(): string {
  return new Date().toISOString();
}

export function createAutonomousOrchestrator(
  executors: AutonomousStageExecutor,
): AutonomousOrchestrator {
  return {
    async run(context: OrchestrationContext): Promise<AutonomousCycleResult> {
      const startedAt = now();
      const stages: StageResult[] = [];
      let failedStage: OrchestrationStage | null = null;

      for (const stage of STAGES) {
        const executor = executors[stage];

        if (!executor) {
          stages.push({
            stage,
            completed: true,
            skipped: true,
          });
          continue;
        }

        try {
          const output = await executor(context, stages);
          stages.push({
            stage,
            completed: true,
            output,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          stages.push({
            stage,
            completed: false,
            error: message,
          });
          failedStage = stage;
          break;
        }
      }

      const finishedAt = now();

      return {
        schemaVersion: 1,
        cycleId: id(),
        startedAt,
        finishedAt,
        completed: failedStage === null,
        failedStage,
        stages,
      };
    },
  };
}
