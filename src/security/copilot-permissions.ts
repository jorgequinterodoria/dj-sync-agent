export type CopilotPermissionMode =
  | 'read-only'
  | 'interactive';

export type CopilotPermissionDecision =
  | 'allow'
  | 'deny'
  | 'approval_required';

export interface CopilotPermissionInput {
  readonly toolName: string;
  readonly risk: 'read' | 'write' | 'review' | 'execute';
  readonly mode: CopilotPermissionMode;
  readonly approvalGranted?: boolean;
}

export interface CopilotPermissionPolicyOptions {
  readonly allowedTools?: readonly string[];
  readonly deniedTools?: readonly string[];
}

export class CopilotPermissionPolicy {
  private readonly allowedTools: ReadonlySet<string> | null;
  private readonly deniedTools: ReadonlySet<string>;

  public constructor(
    options: CopilotPermissionPolicyOptions = {},
  ) {
    this.allowedTools =
      options.allowedTools === undefined
        ? null
        : new Set(
            options.allowedTools.map(
              (tool) => tool.trim(),
            ),
          );

    this.deniedTools = new Set(
      (options.deniedTools ?? []).map(
        (tool) => tool.trim(),
      ),
    );
  }

  public decide(
    input: CopilotPermissionInput,
  ): CopilotPermissionDecision {
    const toolName = input.toolName.trim();

    if (!toolName) return 'deny';
    if (this.deniedTools.has(toolName)) return 'deny';

    if (
      this.allowedTools !== null &&
      !this.allowedTools.has(toolName)
    ) {
      return 'deny';
    }

    if (input.risk === 'read') return 'allow';
    if (input.mode === 'read-only') return 'deny';
    if (input.approvalGranted === true) return 'allow';

    return 'approval_required';
  }

  public assertExecutable(
    input: CopilotPermissionInput,
  ): void {
    const decision = this.decide(input);

    if (decision === 'allow') return;

    if (decision === 'approval_required') {
      throw new Error(
        'Explicit approval is required before this Copilot operation can execute.',
      );
    }

    throw new Error(
      'Copilot operation is denied by permissions policy.',
    );
  }
}
