import type { LiveEnergySnapshot } from './live-dj-context-state.js';

export interface LivePlannedEnergyPoint {
  sessionProgress01: number;
  targetEnergy01: number;
  stage: 'opening' | 'warmup' | 'build' | 'peak' | 'bridge' | 'cooldown' | 'closing';
}

export interface LiveEnergyCurveMilestones {
  startedAt: string | null;
  warmupEndedAt: string | null;
  peakStartedAt: string | null;
  peakEndedAt: string | null;
  outroStartedAt: string | null;
  currentStage: LivePlannedEnergyPoint['stage'];
}

export interface LiveCurveDeviationSummary {
  deviation01: number;
  actualAverageEnergy01: number | null;
  plannedAverageEnergy01: number | null;
  relativeBias: 'actual_above_planned' | 'actual_below_planned' | 'within_range';
  warnings: string[];
}

export const LIVE_ENERGY_CURVE_V1_PROGRESS = {
  warmupEndProgress: 0.2,
  buildEndProgress: 0.5,
  peakEndProgress: 0.85,
} as const;

export const LIVE_ENERGY_CURVE_V1_ENERGY_RANGES: Record<LivePlannedEnergyPoint['stage'], [number, number]> = {
  opening: [0.35, 0.5],
  warmup: [0.42, 0.6],
  build: [0.55, 0.72],
  peak: [0.68, 0.95],
  bridge: [0.6, 0.8],
  cooldown: [0.4, 0.65],
  closing: [0.2, 0.5],
};

export function buildPlannedEnergyCurve(args: {
  totalDurationMinutes: number;
  warmupMinutes?: number | null;
  peakMinutes?: number | null;
  cooldownMinutes?: number | null;
  openingEnergy01Peak?: number;
  samples?: number;
}): LivePlannedEnergyPoint[] {
  const samples = Math.max(8, Math.min(64, args.samples ?? 24));
  const totalMin = Math.max(5, args.totalDurationMinutes);
  const warmupMin = Math.max(2, args.warmupMinutes ?? Math.round(totalMin * LIVE_ENERGY_CURVE_V1_PROGRESS.warmupEndProgress));
  const peakMin = Math.max(5, args.peakMinutes ?? Math.round(totalMin * (LIVE_ENERGY_CURVE_V1_PROGRESS.peakEndProgress - LIVE_ENERGY_CURVE_V1_PROGRESS.buildEndProgress)));
  const buildMin = Math.max(5, Math.round(totalMin * (LIVE_ENERGY_CURVE_V1_PROGRESS.buildEndProgress - LIVE_ENERGY_CURVE_V1_PROGRESS.warmupEndProgress)));
  const cooldownMin = Math.max(2, args.cooldownMinutes ?? Math.max(2, totalMin - warmupMin - buildMin - peakMin));
  const openingMin = Math.max(1, Math.min(warmupMin / 2, 2));
  const peakEnergy = Math.max(0.6, Math.min(1, args.openingEnergy01Peak ?? 0.88));
  const openingEnd = openingMin / totalMin;
  const warmupEnd = Math.max(openingEnd + 0.01, (openingMin + warmupMin) / totalMin);
  const buildEnd = Math.max(warmupEnd + 0.01, (openingMin + warmupMin + buildMin) / totalMin);
  const peakEnd = Math.max(buildEnd + 0.01, (totalMin - cooldownMin) / totalMin);
  void peakMin;
  const out: LivePlannedEnergyPoint[] = [];
  for (let i = 0; i <= samples; i++) {
    const progress = i / samples;
    let stage: LivePlannedEnergyPoint['stage'];
    let target: number;
    if (progress <= openingEnd) {
      stage = 'opening';
      const local = progress / Math.max(0.0001, openingEnd);
      target = 0.35 + local * (0.48 - 0.35);
    } else if (progress <= warmupEnd) {
      stage = 'warmup';
      const local = (progress - openingEnd) / Math.max(0.0001, warmupEnd - openingEnd);
      target = 0.48 + local * (LIVE_ENERGY_CURVE_V1_ENERGY_RANGES.build[0] - 0.48);
    } else if (progress <= buildEnd) {
      stage = 'build';
      const local = (progress - warmupEnd) / Math.max(0.0001, buildEnd - warmupEnd);
      target = LIVE_ENERGY_CURVE_V1_ENERGY_RANGES.build[0] + local * (peakEnergy - LIVE_ENERGY_CURVE_V1_ENERGY_RANGES.build[0]);
    } else if (progress <= peakEnd) {
      stage = 'peak';
      const local = (progress - buildEnd) / Math.max(0.0001, peakEnd - buildEnd);
      const bump = Math.sin(local * Math.PI);
      target = peakEnergy - 0.06 + bump * 0.06;
    } else {
      const local = (progress - peakEnd) / Math.max(0.0001, 1 - peakEnd);
      if (local < 0.6) {
        stage = 'cooldown';
      } else {
        stage = 'closing';
      }
      target = Math.max(0.22, peakEnergy - 0.25 - local * 0.4);
    }
    out.push({
      sessionProgress01: progress,
      targetEnergy01: Math.max(0, Math.min(1, target)),
      stage,
    });
  }
  return out;
}

export function expectedEnergyForProgress(curve: LivePlannedEnergyPoint[], progress01: number): LivePlannedEnergyPoint | null {
  if (curve.length === 0) return null;
  const p = Math.max(0, Math.min(1, progress01));
  let best: LivePlannedEnergyPoint | null = null;
  let bestDistance = Infinity;
  for (const pt of curve) {
    const d = Math.abs(pt.sessionProgress01 - p);
    if (d < bestDistance) {
      best = pt;
      bestDistance = d;
    }
  }
  return best;
}

export function averageEnergy01(snapshots: readonly LiveEnergySnapshot[]): number | null {
  const values: number[] = [];
  for (const s of snapshots) {
    if (typeof s.energy01 === 'number' && !Number.isNaN(s.energy01)) {
      values.push(s.energy01);
    }
  }
  if (values.length === 0) return null;
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

export interface LiveEnergyTrackerOptions {
  readonly deviationWarningThreshold01?: number;
  readonly warmupMinSamples?: number;
  readonly peakMinSamples?: number;
  readonly cooldownMinSamples?: number;
}

export const LIVE_ENERGY_TRACKER_V1_DEFAULTS = {
  deviationWarningThreshold01: 0.25,
  warmupMinSamples: 6,
  peakMinSamples: 6,
  cooldownMinSamples: 6,
} as const satisfies Required<LiveEnergyTrackerOptions>;

export class LiveEnergyCurveTracker {
  private readonly planned: LivePlannedEnergyPoint[];
  private readonly options: Required<LiveEnergyTrackerOptions>;
  private readonly totalDurationMs: number;
  private startedAtMs: number;
  private snapshots: LiveEnergySnapshot[];
  private milestones: LiveEnergyCurveMilestones;

  constructor(args: {
    plannedCurve: LivePlannedEnergyPoint[];
    startedAt?: string;
    totalDurationMinutes: number;
    options?: LiveEnergyTrackerOptions;
  }) {
    this.planned = args.plannedCurve.length > 0 ? args.plannedCurve : buildPlannedEnergyCurve({ totalDurationMinutes: args.totalDurationMinutes });
    this.totalDurationMs = Math.max(5 * 60 * 1000, Math.trunc(args.totalDurationMinutes * 60 * 1000));
    this.startedAtMs = args.startedAt ? Date.parse(args.startedAt) || Date.now() : Date.now();
    this.snapshots = [];
    this.options = { ...LIVE_ENERGY_TRACKER_V1_DEFAULTS, ...(args.options ?? {}) };
    this.milestones = {
      startedAt: new Date(this.startedAtMs).toISOString(),
      warmupEndedAt: null,
      peakStartedAt: null,
      peakEndedAt: null,
      outroStartedAt: null,
      currentStage: 'opening',
    };
  }

  public getMilestones(): Readonly<LiveEnergyCurveMilestones> {
    return { ...this.milestones };
  }

  public getPlannedCurve(): readonly LivePlannedEnergyPoint[] {
    return this.planned.slice();
  }

  public getSnapshots(): readonly LiveEnergySnapshot[] {
    return this.snapshots.slice();
  }

  public appendSnapshot(snap: LiveEnergySnapshot, nowMs?: number): void {
    this.snapshots.push(snap);
    const n = nowMs ?? Date.now();
    const elapsed = Math.max(0, n - this.startedAtMs);
    const progress = Math.min(1, elapsed / Math.max(1, this.totalDurationMs));
    const expected = expectedEnergyForProgress(this.planned, progress);
    const recent = this.snapshots.slice(-Math.max(6, this.options.warmupMinSamples));
    const recentAvg = averageEnergy01(recent);
    const expectedStage = expected?.stage ?? 'opening';
    this.milestones.currentStage = expectedStage;
    if (!this.milestones.warmupEndedAt && (expectedStage === 'build' || expectedStage === 'peak') && recent.length >= this.options.warmupMinSamples) {
      this.milestones.warmupEndedAt = new Date(n).toISOString();
    }
    if (!this.milestones.peakStartedAt && expectedStage === 'peak' && recent.length >= this.options.peakMinSamples) {
      this.milestones.peakStartedAt = new Date(n).toISOString();
    }
    if (!this.milestones.peakEndedAt && this.milestones.peakStartedAt && expectedStage === 'cooldown') {
      this.milestones.peakEndedAt = new Date(n).toISOString();
    }
    if (!this.milestones.outroStartedAt && (expectedStage === 'closing' || (expectedStage === 'cooldown' && progress >= 0.9))) {
      this.milestones.outroStartedAt = new Date(n).toISOString();
    }
    void recentAvg;
  }

  public summarizeDeviation(nowMs?: number): LiveCurveDeviationSummary {
    const n = nowMs ?? Date.now();
    const elapsed = Math.max(0, n - this.startedAtMs);
    const progress = Math.min(1, elapsed / Math.max(1, this.totalDurationMs));
    const head = Math.max(1, Math.min(this.snapshots.length, Math.round(this.planned.length)));
    const actualAvg = averageEnergy01(this.snapshots);
    const plannedSamples: number[] = [];
    for (let i = 0; i < head; i++) {
      const p = this.snapshots.length <= 1 ? progress : (i / Math.max(1, this.snapshots.length - 1)) * progress;
      const e = expectedEnergyForProgress(this.planned, p);
      if (e) plannedSamples.push(e.targetEnergy01);
    }
    const plannedAvg = plannedSamples.length > 0 ? plannedSamples.reduce((a, b) => a + b, 0) / plannedSamples.length : null;
    const threshold = this.options.deviationWarningThreshold01;
    const warnings: string[] = [];
    let bias: LiveCurveDeviationSummary['relativeBias'] = 'within_range';
    let deviation = 0;
    if (actualAvg != null && plannedAvg != null) {
      deviation = Math.abs(actualAvg - plannedAvg);
      if (actualAvg - plannedAvg > threshold) {
        bias = 'actual_above_planned';
        warnings.push('live_curve_above_planned');
      } else if (plannedAvg - actualAvg > threshold) {
        bias = 'actual_below_planned';
        warnings.push('live_curve_below_planned');
      }
      if (deviation > threshold) {
        warnings.push('deviation_threshold_exceeded');
      }
    } else {
      deviation = 0;
    }
    if (this.snapshots.length < this.options.warmupMinSamples) {
      warnings.push('insufficient_samples');
    }
    return {
      deviation01: Math.max(0, Math.min(1, deviation)),
      actualAverageEnergy01: actualAvg,
      plannedAverageEnergy01: plannedAvg,
      relativeBias: bias,
      warnings,
    };
  }

  public adjustConstraintsForDeviation(
    baseConstraints: import('../../recommendations/recommendation-types.js').RecommendationConstraints,
    nowMs?: number,
  ): import('../../recommendations/recommendation-types.js').RecommendationConstraints {
    const summary = this.summarizeDeviation(nowMs);
    if (summary.warnings.includes('deviation_threshold_exceeded') && summary.actualAverageEnergy01 != null) {
      const next: import('../../recommendations/recommendation-types.js').RecommendationConstraints = { ...baseConstraints };
      if (summary.relativeBias === 'actual_below_planned') {
        const baseTarget = (typeof next.targetEnergy === 'number') ? next.targetEnergy : (summary.plannedAverageEnergy01 ?? 0.7);
        next.targetEnergy = Math.min(1, baseTarget + 0.05);
      } else if (summary.relativeBias === 'actual_above_planned') {
        const baseTarget = (typeof next.targetEnergy === 'number') ? next.targetEnergy : (summary.plannedAverageEnergy01 ?? 0.6);
        next.targetEnergy = Math.max(0, baseTarget - 0.05);
      }
      return next;
    }
    return baseConstraints;
  }
}

export function milestoneSummaryText(m: LiveEnergyCurveMilestones): string {
  const parts: string[] = [];
  if (m.startedAt) parts.push(`started:${m.startedAt}`);
  if (m.warmupEndedAt) parts.push(`warmup_end:${m.warmupEndedAt}`);
  if (m.peakStartedAt) parts.push(`peak_start:${m.peakStartedAt}`);
  if (m.peakEndedAt) parts.push(`peak_end:${m.peakEndedAt}`);
  if (m.outroStartedAt) parts.push(`outro_start:${m.outroStartedAt}`);
  parts.push(`stage:${m.currentStage}`);
  return parts.join(' ');
}
