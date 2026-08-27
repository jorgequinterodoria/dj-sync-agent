import type {
  JobHandler,
  JobRecord,
  JobExecutionResult,
} from './job-types.js';

export interface IntelligenceJobHandlerDependencies {
  refresh:
    (
      job:
        JobRecord,
    ) =>
      Promise<void>;

  preferenceUpdate:
    (
      job:
        JobRecord,
    ) =>
      Promise<void>;

  retire:
    (
      job:
        JobRecord,
    ) =>
      Promise<void>;
}

export function createIntelligenceJobHandlers(
  dependencies:
    IntelligenceJobHandlerDependencies,
) {
  const result:
    JobExecutionResult = {
    completed:
      true,
  };

  return {
    refresh: {
      async execute(
        context,
      ):
        Promise<JobExecutionResult> {
        await dependencies.refresh(
          context.job,
        );

        return result;
      },
    } satisfies JobHandler,

    preferenceUpdate: {
      async execute(
        context,
      ):
        Promise<JobExecutionResult> {
        await dependencies.preferenceUpdate(
          context.job,
        );

        return result;
      },
    } satisfies JobHandler,

    retire: {
      async execute(
        context,
      ):
        Promise<JobExecutionResult> {
        await dependencies.retire(
          context.job,
        );

        return result;
      },
    } satisfies JobHandler,
  };
}