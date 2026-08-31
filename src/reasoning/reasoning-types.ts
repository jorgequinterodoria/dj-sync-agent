export type DJReasoningPriority = 'low' | 'normal' | 'high';

export type DJReasoningDecisionType =
  | 'keep'
  | 'prefer'
  | 'avoid'
  | 'suggest'
  | 'investigate';

export interface DJReasoningEvidence {
  source: 'track' | 'intelligence' | 'memory' | 'user';
  key: string;
  value: unknown;
  weight: number;
}

export interface DJReasoningDecision {
  type: DJReasoningDecisionType;
  subject: string;
  rationale: string;
  confidence: number;
}

export interface DJReasoningContext {
  deviceId?: string;
  trackId: string;
  profile: unknown;
  userRequest: string;
  constraints?: string[];
  memory?: Array<{
    trackId: string;
    trackHash: string | null;
    similarity: number | null;
  }>;
  recentTracks?: string[];
}

export interface DJReasoningResult {
  schemaVersion: 1;
  engineVersion: string;
  reasoningId: string;
  generatedAt: string;
  trackId: string;
  priority: DJReasoningPriority;
  summary: string;
  decisions: DJReasoningDecision[];
  constraints: string[];
  evidence: DJReasoningEvidence[];
  confidence: number;
  model: string;
  provider: string;
}

export interface DJReasoningRunRecord {
  id: number;
  deviceId: string;
  trackId: string;
  reasoningId: string;
  engineVersion: string;
  model: string;
  provider: string;
  request: string;
  result: DJReasoningResult;
  createdAt: string;
}
