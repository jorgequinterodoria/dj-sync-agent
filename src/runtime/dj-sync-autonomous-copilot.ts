import {
  createAutonomousOrchestrator,
} from '../orchestration/autonomous-copilot.js';
import type {
  AutonomousCycleResult,
  AutonomousOrchestrator,
  AutonomousStageExecutor,
  OrchestrationContext,
} from '../orchestration/autonomous-copilot-types.js';

export interface DJSyncAutonomousCopilotSnapshot {
  schemaVersion: 1;
  status: 'disabled' | 'idle' | 'running' | 'failed';
  deviceId: string;
  lastCycle: AutonomousCycleResult | null;
  lastError: string | null;
}

export interface DJSyncAutonomousCopilot {
  start(): Promise<void>;
  stop(): Promise<void>;
  run(context: OrchestrationContext): Promise<AutonomousCycleResult>;
  snapshot(): DJSyncAutonomousCopilotSnapshot;
}

export interface CreateDJSyncAutonomousCopilotOptions {
  deviceId: string;
  executors: AutonomousStageExecutor;
}

export function createDJSyncAutonomousCopilot(
  options: CreateDJSyncAutonomousCopilotOptions,
): DJSyncAutonomousCopilot {
  const deviceId = options.deviceId.trim();
  if (!deviceId) {
    throw new Error('DJ autonomous copilot requires a device id.');
  }

  const orchestrator: AutonomousOrchestrator =
    createAutonomousOrchestrator(options.executors);

  let status: DJSyncAutonomousCopilotSnapshot['status'] = 'idle';
  let lastCycle: AutonomousCycleResult | null = null;
  let lastError: string | null = null;

  return {
    async start() {
      status = 'idle';
      lastError = null;
    },

    async stop() {
      status = 'idle';
    },

    async run(context) {
      status = 'running';
      lastError = null;

      try {
        const result = await orchestrator.run({
          ...context,
          deviceId,
        });

        lastCycle = result;
        status = result.completed ? 'idle' : 'failed';
        lastError = result.completed
          ? null
          : result.stages.find((stage) => !stage.completed)?.error ?? 'Autonomous cycle failed.';

        return result;
      } catch (error) {
        status = 'failed';
        lastError = error instanceof Error ? error.message : String(error);
        throw error;
      }
    },

    snapshot() {
      return {
        schemaVersion: 1,
        status,
        deviceId,
        lastCycle,
        lastError,
      };
    },
  };
}
