import type {
  JobExecutionResult,
  JobHandler,
  JobRecord,
} from './job-types.js';

export interface IntelligenceJobHandlerDependencies {
  refresh: (
    job: JobRecord,
  ) => Promise<JobExecutionResult>;

  preferenceUpdate: (
    job: JobRecord,
  ) => Promise<void>;

  retire: (
    job: JobRecord,
  ) => Promise<void>;
}

export function createIntelligenceJobHandlers(
  dependencies: IntelligenceJobHandlerDependencies,
) {
  return {
    refresh: {
      async execute(context) {
        return dependencies.refresh(context.job);
      },
    } satisfies JobHandler,

    preferenceUpdate: {
      async execute(context) {
        await dependencies.preferenceUpdate(context.job);
        return { completed: true };
      },
    } satisfies JobHandler,

    retire: {
      async execute(context) {
        await dependencies.retire(context.job);
        return { completed: true };
      },
    } satisfies JobHandler,
  };
}
