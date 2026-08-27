import {
  parseToolCalls,
} from './tool-call-parser.js';

import {
  serializeCopilotContext,
} from './copilot-agent-context.js';

import type {
  CopilotAgentOptions,
  CopilotAgentRunInput,
  CopilotAgentRunResult,
  CopilotMessage,
  CopilotModelRequest,
  CopilotModelResponse,
} from './copilot-agent-types.js';

const DEFAULT_MAX_TOOL_CALLS = 8;
const DEFAULT_MAX_TURNS = 6;
const DEFAULT_TIMEOUT_MS = 60_000;

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<T> {
  if (signal?.aborted) {
    return Promise.reject(
      new Error('Copilot request aborted.'),
    );
  }

  return new Promise<T>((resolve, reject) => {
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;

      settled = true;

      reject(
        new Error(
          'Copilot request timed out.',
        ),
      );
    }, timeoutMs);

    const onAbort = (): void => {
      if (settled) return;

      settled = true;
      clearTimeout(timer);

      reject(
        new Error(
          'Copilot request aborted.',
        ),
      );
    };

    signal?.addEventListener(
      'abort',
      onAbort,
      { once: true },
    );

    promise.then(
      (value) => {
        if (settled) return;

        settled = true;
        clearTimeout(timer);

        signal?.removeEventListener(
          'abort',
          onAbort,
        );

        resolve(value);
      },
      (error: unknown) => {
        if (settled) return;

        settled = true;
        clearTimeout(timer);

        signal?.removeEventListener(
          'abort',
          onAbort,
        );

        reject(error);
      },
    );
  });
}

function buildToolManifest(
  options: CopilotAgentOptions,
): CopilotModelRequest['tools'] {
  return options.registry.list().map(
    (tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    }),
  );
}

function ensureMessage(
  content: string,
): CopilotMessage {
  return {
    role: 'assistant',
    content,
  };
}

function normalizedLimits(
  options: CopilotAgentOptions,
): {
  readonly maxToolCalls: number;
  readonly maxTurns: number;
  readonly timeoutMs: number;
} {
  return {
    maxToolCalls:
      Math.max(
        1,
        options.maxToolCalls ??
          DEFAULT_MAX_TOOL_CALLS,
      ),

    maxTurns:
      Math.max(
        1,
        options.maxTurns ??
          DEFAULT_MAX_TURNS,
      ),

    timeoutMs:
      Math.max(
        1,
        options.timeoutMs ??
          DEFAULT_TIMEOUT_MS,
      ),
  };
}

export class CopilotAgent {
  private readonly options: CopilotAgentOptions;

  public constructor(
    options: CopilotAgentOptions,
  ) {
    if (!options.model) {
      throw new Error(
        'Copilot model is required.',
      );
    }

    if (!options.registry) {
      throw new Error(
        'Copilot tool registry is required.',
      );
    }

    if (
      !options.toolContext.deviceId.trim()
    ) {
      throw new Error(
        'Copilot device id is required.',
      );
    }

    this.options = options;
  }

  public async run(
    input: CopilotAgentRunInput,
  ): Promise<CopilotAgentRunResult> {
    const userMessage =
      input.userMessage.trim();

    if (!userMessage) {
      throw new Error(
        'Copilot user message is required.',
      );
    }

    const limits =
      normalizedLimits(this.options);

    const deadline =
      AbortSignal.timeout(
        limits.timeoutMs,
      );

    const signal = input.signal
      ? AbortSignal.any([
          input.signal,
          deadline,
        ])
      : deadline;

    const messages: CopilotMessage[] = [];

    if (
      this.options.systemPrompt?.trim()
    ) {
      messages.push({
        role: 'system',
        content:
          this.options.systemPrompt.trim(),
      });
    }

    if (
      this.options.contextProvider
    ) {
      const context =
        await withTimeout(
          this.options.contextProvider.build({
            userMessage,
          }),
          limits.timeoutMs,
          signal,
        );

      messages.push({
        role: 'system',
        content:
          serializeCopilotContext(
            context,
          ),
      });
    }

    messages.push({
      role: 'user',
      content: userMessage,
    });

    const toolManifest =
      buildToolManifest(
        this.options,
      );

    const toolExecutions = [];
    let turns = 0;

    while (true) {
      turns += 1;

      if (
        turns > limits.maxTurns
      ) {
        throw new Error(
          'Copilot turn limit exceeded.',
        );
      }

      let response:
        CopilotModelResponse;

      try {
        response =
          await withTimeout(
            this.options.model.generate(
              {
                messages: [...messages],
                tools: toolManifest,
              },
              signal,
            ),
            limits.timeoutMs,
            signal,
          );
      } catch (error: unknown) {
        const message =
          error instanceof Error
            ? error.message
            : String(error);

        throw new Error(
          /timed out|aborted/i.test(
            message,
          )
            ? `Copilot timeout: ${message}`
            : `Copilot model error: ${message}`,
        );
      }

      const parsed =
        parseToolCalls(
          response.toolCalls,
        );

      if (
        parsed.errors.length > 0
      ) {
        throw new Error(
          parsed.errors.join(' '),
        );
      }

      if (
        parsed.calls.length === 0
      ) {
        const finalResponse =
          response.content.trim();

        if (!finalResponse) {
          throw new Error(
            'Copilot model returned an empty response.',
          );
        }

        messages.push(
          ensureMessage(
            finalResponse,
          ),
        );

        return {
          response: finalResponse,
          messages,
          toolExecutions,
          turns,
        };
      }

      messages.push({
        role: 'assistant',
        content:
          response.content.trim(),
      });

      for (
        const call of parsed.calls
      ) {
        if (
          toolExecutions.length >=
          limits.maxToolCalls
        ) {
          throw new Error(
            'Copilot tool call limit exceeded.',
          );
        }

        const requestId =
          `${this.options.toolContext.requestId}:${call.id}`;

        const result =
          await this.options.registry.execute(
            call.name,
            call.arguments,
            {
              ...this.options.toolContext,
              requestId,
              signal,
            },
          );

        toolExecutions.push({
          id: call.id,
          name: call.name,
          result,
        });

        messages.push({
          role: 'tool',
          toolCallId: call.id,
          toolName: call.name,
          content:
            JSON.stringify(result),
        });
      }
    }
  }
}

export function createCopilotAgent(
  options: CopilotAgentOptions,
): CopilotAgent {
  return new CopilotAgent(options);
}
