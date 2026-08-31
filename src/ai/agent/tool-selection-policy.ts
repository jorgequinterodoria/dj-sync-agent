export type ToolRisk =
  | 'read'
  | 'write'
  | 'review';

export interface ToolPolicyDefinition {
  readonly name: string;
  readonly risk: ToolRisk;
  readonly enabled?: boolean;
  readonly description?: string;
}

export interface ToolSelectionRequest {
  readonly userMessage: string;
  readonly requestedTools?: readonly string[];
}

export interface ToolSelectionDecision {
  readonly allowed: boolean;
  readonly reason: string;
}

const DEFAULT_ALLOWED_RISKS: readonly ToolRisk[] = [
  'read',
];

export class ToolSelectionPolicy {
  private readonly tools: ReadonlyMap<string, ToolPolicyDefinition>;
  private readonly allowedRisks: readonly ToolRisk[];

  public constructor(
    definitions: readonly ToolPolicyDefinition[],
    allowedRisks: readonly ToolRisk[] =
      DEFAULT_ALLOWED_RISKS,
  ) {
    const map = new Map<string, ToolPolicyDefinition>();

    for (const definition of definitions) {
      const name = definition.name.trim();

      if (!name) {
        throw new Error(
          'Tool policy requires a tool name.',
        );
      }

      map.set(name, {
        ...definition,
        name,
      });
    }

    this.tools = map;
    this.allowedRisks = [...allowedRisks];
  }

  public decide(
    toolName: string,
  ): ToolSelectionDecision {
    const definition =
      this.tools.get(toolName.trim());

    if (!definition) {
      return {
        allowed: false,
        reason: 'Tool is not registered in policy.',
      };
    }

    if (definition.enabled === false) {
      return {
        allowed: false,
        reason: 'Tool is disabled by policy.',
      };
    }

    if (
      !this.allowedRisks.includes(
        definition.risk,
      )
    ) {
      return {
        allowed: false,
        reason:
          definition.risk === 'review'
            ? 'Tool requires explicit approval.'
            : 'Tool risk is not allowed by policy.',
      };
    }

    return {
      allowed: true,
      reason: 'Tool is allowed by policy.',
    };
  }

  public filter(
    requestedTools: readonly string[],
  ): readonly string[] {
    const seen = new Set<string>();
    const result: string[] = [];

    for (const requested of requestedTools) {
      const name = requested.trim();

      if (!name || seen.has(name)) {
        continue;
      }

      if (this.decide(name).allowed) {
        seen.add(name);
        result.push(name);
      }
    }

    return result;
  }

  public registered(): readonly string[] {
    return [...this.tools.keys()].sort(
      (a, b) => a.localeCompare(b),
    );
  }
}
