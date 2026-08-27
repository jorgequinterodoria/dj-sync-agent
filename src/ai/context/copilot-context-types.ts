export interface ContextBudget {
  readonly maxMessages: number;
  readonly maxCandidates: number;
  readonly maxHistory: number;
  readonly maxMemoryResults: number;
  readonly maxContextChars: number;
}

export interface ContextSource<T> {
  readonly items: readonly T[];
  readonly truncated: boolean;
}

export interface CopilotContextRequest {
  readonly userMessage: string;
  readonly currentTrackId?: string;
}

export interface ConversationContext {
  readonly summary: string | null;
  readonly recentMessages: readonly unknown[];
  readonly constraints: readonly unknown[];
}

export interface TrackContext {
  readonly track: unknown;
  readonly intelligence?: unknown;
}

export interface LibraryContext {
  readonly candidates: readonly unknown[];
  readonly stats?: unknown;
}

export interface HistoryContext {
  readonly recentPlays: readonly unknown[];
  readonly relatedPlays?: readonly unknown[];
}

export interface IntelligenceContext {
  readonly profile?: unknown;
  readonly setAnalysis?: unknown;
  readonly transition?: unknown;
}

export interface PersonalizationContext {
  readonly profile?: unknown;
  readonly preferences?: readonly unknown[];
}

export interface SemanticContext {
  readonly results: readonly unknown[];
}

export interface CopilotContext {
  readonly schemaVersion: 1;
  readonly request: CopilotContextRequest;
  readonly conversation: ConversationContext;
  readonly track: TrackContext | null;
  readonly library: LibraryContext;
  readonly history: HistoryContext;
  readonly intelligence: IntelligenceContext;
  readonly personalization: PersonalizationContext;
  readonly semantic: SemanticContext;
  readonly truncated: readonly string[];
  readonly estimatedChars: number;
}

export interface CopilotContextSourceBundle {
  readonly conversation: ConversationContext;
  readonly track?: TrackContext | null;
  readonly library?: LibraryContext;
  readonly history?: HistoryContext;
  readonly intelligence?: IntelligenceContext;
  readonly personalization?: PersonalizationContext;
  readonly semantic?: SemanticContext;
}
