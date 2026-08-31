export type OrchestrationStage =
  | 'sync'
  | 'analysis'
  | 'intelligence'
  | 'memory'
  | 'reasoning'
  | 'recommendation'
  | 'personalization'
  | 'action';

export interface OrchestrationContext {
  deviceId: string;
  trackId?: string;
  trigger: 'startup' | 'sync_change' | 'manual' | 'scheduled';
  requestedAt: string;
  metadata?: Record<string, unknown>;
}

export interface StageResult {
  stage: OrchestrationStage;
  completed: boolean;
  skipped?: boolean;
  output?: unknown;
  error?: string;
}

export interface AutonomousCycleResult {
  schemaVersion: 1;
  cycleId: string;
  startedAt: string;
  finishedAt: string;
  completed: boolean;
  failedStage: OrchestrationStage | null;
  stages: StageResult[];
}

export interface AutonomousStageExecutor {
  sync?(context: OrchestrationContext): Promise<unknown>;
  analysis?(context: OrchestrationContext, previous: StageResult[]): Promise<unknown>;
  intelligence?(context: OrchestrationContext, previous: StageResult[]): Promise<unknown>;
  memory?(context: OrchestrationContext, previous: StageResult[]): Promise<unknown>;
  reasoning?(context: OrchestrationContext, previous: StageResult[]): Promise<unknown>;
  recommendation?(context: OrchestrationContext, previous: StageResult[]): Promise<unknown>;
  personalization?(context: OrchestrationContext, previous: StageResult[]): Promise<unknown>;
  action?(context: OrchestrationContext, previous: StageResult[]): Promise<unknown>;
}

export interface AutonomousOrchestrator {
  run(context: OrchestrationContext): Promise<AutonomousCycleResult>;
}
