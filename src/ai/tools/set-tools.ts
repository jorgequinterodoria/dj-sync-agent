import {
  z,
} from 'zod';

import type {
  ToolDefinition,
  ToolExecutionContext,
} from './tool-types.js';

export interface SetToolAdapter {
  buildSet(
    input: BuildSetInput,
    context: ToolExecutionContext,
  ): Promise<unknown>;

  analyzeSet(
    input: AnalyzeSetInput,
    context: ToolExecutionContext,
  ): Promise<unknown>;
}

const buildInputSchema =
  z
    .object({
      request:
        z.string()
          .trim()
          .min(1)
          .max(1000),

      trackIds:
        z
          .array(
            z.string()
              .trim()
              .min(1),
          )
          .min(1)
          .max(100),

      startTrackId:
        z.string()
          .trim()
          .min(1)
          .optional(),

      trackCount:
        z.number()
          .int()
          .min(1)
          .max(100)
          .optional(),

      durationMinutes:
        z.number()
          .finite()
          .positive()
          .max(1440)
          .optional(),
    })
    .strict();

const analyzeInputSchema =
  z
    .object({
      request:
        z.string()
          .trim()
          .min(1)
          .max(1000),

      trackIds:
        z
          .array(
            z.string()
              .trim()
              .min(1),
          )
          .min(1)
          .max(100),
    })
    .strict();

export type BuildSetInput =
  z.infer<
    typeof buildInputSchema
  >;

export type AnalyzeSetInput =
  z.infer<
    typeof analyzeInputSchema
  >;

export function createSetTools(
  adapter: SetToolAdapter,
): readonly ToolDefinition[] {
  const buildTool:
    ToolDefinition =
    {
      name:
        'set.build',

      description:
        'Build a deterministic bounded DJ set proposal from selected library tracks.',

      risk:
        'read',

      inputSchema:
        buildInputSchema,

      timeoutMs:
        15_000,

      execute: (
        input,
        context,
      ) =>
        adapter.buildSet(
          input as BuildSetInput,
          context,
        ),
    };

  const analyzeTool:
    ToolDefinition =
    {
      name:
        'set.analyze',

      description:
        'Analyze an ordered DJ set for BPM, energy, harmony, genre switches and repetition.',

      risk:
        'read',

      inputSchema:
        analyzeInputSchema,

      timeoutMs:
        15_000,

      execute: (
        input,
        context,
      ) =>
        adapter.analyzeSet(
          input as AnalyzeSetInput,
          context,
        ),
    };

  return [
    buildTool,
    analyzeTool,
  ];
}