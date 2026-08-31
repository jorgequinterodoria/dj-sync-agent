import type { NormalizedTrack } from '../../rekordbox/normalized-track.js';
import type { DJTrack } from '../domain/dj-track.js';
import type { DJCue } from '../domain/dj-cue.js';
import type { DJPlaylist } from '../domain/dj-playlist.js';
import type {
  DJBehaviorProfileRow,
  DJPreferenceDimension,
  DJPreferenceKind,
  DJPreferenceRow,
  DJSessionRow,
  DJSessionTrackFlags,
  DJSessionTrackRow,
  DJTransitionRow,
  NormalizedTrackRow,
  PlaylistEntryRow,
  PlaylistRow,
  CueRow,
  RecommendationFeedbackRow,
} from './types.js';
import type { DJSessionInput, DJSessionTrackInput } from './ports.js';
import type { ExplicitPreferenceInput, ImplicitPreferenceEvidence } from './ports.js';
import type { PersonalizedTrackProfile } from '../../personalization/personalization-types.js';

export function isoNow(now?: string): string {
  return now ?? new Date().toISOString();
}

export function toNormalizedTrackRow(track: DJTrack, now?: string): NormalizedTrackRow {
  const ts = isoNow(now);
  return {
    track_id: track.identity.id,
    schema_version: track.schemaVersion,
    identity_uuid: track.identity.uuid,
    title: track.metadata.title,
    artist: track.metadata.artist,
    album: track.metadata.album,
    genre: track.metadata.genre,
    label: track.metadata.label,
    musical_key: track.metadata.key,
    remixer: track.metadata.remixer,
    composer: track.metadata.composer,
    isrc: track.metadata.isrc,
    bpm_raw: track.technical.bpmRaw,
    bpm: track.technical.bpm,
    length_seconds: track.technical.lengthSeconds,
    bitrate: track.technical.bitrate,
    bit_depth: track.technical.bitDepth,
    sample_rate: track.technical.sampleRate,
    rating: track.technical.rating,
    play_count: track.technical.playCount,
    file_type: track.technical.fileType,
    analyzed: track.technical.analyzed,
    primary_file_id: track.primaryFile.id,
    primary_file_path: track.primaryFile.path,
    primary_file_local_path: track.primaryFile.localPath,
    primary_file_hash: track.primaryFile.hash,
    primary_file_size: track.primaryFile.size,
    primary_file_kind: track.primaryFile.kind,
    rb_local_deleted: track.sync.rbLocalDeleted,
    rb_local_usn: track.sync.rbLocalUsn,
    sync_updated_at: track.sync.updatedAt,
    normalized_track_json: JSON.stringify(track),
    created_at: ts,
    updated_at: ts,
  };
}

export function toDJTrackFromRow(row: NormalizedTrackRow): DJTrack {
  const parsed = JSON.parse(row.normalized_track_json) as NormalizedTrack;
  return parsed;
}

export function toPlaylistRows(
  playlist: DJPlaylist,
  now?: string,
): { row: PlaylistRow; entries: PlaylistEntryRow[] } {
  const ts = isoNow(now);
  const row: PlaylistRow = {
    playlist_id: playlist.id,
    name: playlist.name,
    parent_id: playlist.parentId,
    source: playlist.source,
    track_count: playlist.trackIds.length,
    updated_at: playlist.updatedAt,
    created_at: ts,
  };
  const entries: PlaylistEntryRow[] = playlist.trackIds.map((trackId, index) => ({
    playlist_id: playlist.id,
    track_id: trackId,
    track_no: index + 1,
    created_at: ts,
  }));
  return { row, entries };
}

export function toDJPlaylistFromRow(
  row: PlaylistRow,
  entries: ReadonlyArray<PlaylistEntryRow>,
): DJPlaylist {
  const ordered = [...entries].sort((a, b) => a.track_no - b.track_no);
  return {
    id: row.playlist_id,
    name: row.name,
    parentId: row.parent_id,
    source: row.source,
    updatedAt: row.updated_at,
    trackIds: ordered.map((e) => e.track_id),
  };
}

export function toCueRows(
  trackId: string,
  cues: ReadonlyArray<DJCue>,
  now?: string,
): CueRow[] {
  const ts = isoNow(now);
  return cues.map<CueRow>((cue) => ({
    cue_id: cue.id,
    track_id: trackId,
    kind: typeof cue.type === 'number' ? cue.type : null,
    in_msec: cue.positionSeconds != null ? Math.round(cue.positionSeconds * 1000) : null,
    out_msec: null,
    color: cue.color != null ? Number(cue.color) : null,
    active_loop: null,
    comment: cue.comment ?? cue.name ?? null,
    beat_loop_size: null,
    content_uuid: null,
    uuid: null,
    created_at: ts,
  }));
}

export function toDJCuesFromRows(rows: ReadonlyArray<CueRow>): DJCue[] {
  return [...rows]
    .sort((a, b) => (a.in_msec ?? Number.POSITIVE_INFINITY) - (b.in_msec ?? Number.POSITIVE_INFINITY) || a.cue_id.localeCompare(b.cue_id))
    .map<DJCue>((row, order) => ({
      id: row.cue_id,
      trackId: row.track_id,
      type: cueTypeFromKind(row.kind),
      positionSeconds: row.in_msec != null ? row.in_msec / 1000 : 0,
      name: row.comment ?? null,
      color: row.color != null ? String(row.color) : null,
      comment: row.comment ?? null,
      order,
    }));
}

function cueTypeFromKind(kind: number | null): DJCue['type'] {
  if (kind == null) return 'cue';
  switch (kind) {
    case 0:
      return 'cue';
    case 1:
      return 'memory';
    case 2:
      return 'hot';
    default:
      return 'cue';
  }
}

export function toDJSessionRow(session: DJSessionInput, now?: string): DJSessionRow {
  const ts = isoNow(now);
  return {
    session_id: session.sessionId,
    started_at: session.startedAt,
    ended_at: session.endedAt ?? null,
    source: session.source,
    context_tag: session.contextTag ?? null,
    created_at: ts,
    updated_at: ts,
  };
}

export function toDJSessionTrackRow(
  track: DJSessionTrackInput,
  now?: string,
): DJSessionTrackRow {
  const ts = isoNow(now);
  const flags: DJSessionTrackFlags = { ...(track.flags ?? {}) };
  return {
    session_id: track.sessionId,
    position: track.position,
    track_id: track.trackId,
    played_at: track.playedAt,
    source: track.source ?? null,
    duration_played_ms: track.durationPlayedMs ?? null,
    flags_json: JSON.stringify(flags),
    created_at: ts,
  };
}

export function unpackDJSessionTrackFlags(row: DJSessionTrackRow): DJSessionTrackFlags {
  try {
    return JSON.parse(row.flags_json) as DJSessionTrackFlags;
  } catch {
    return {};
  }
}

export function toDJTransitionRowInitial(args: {
  trackAId: string;
  trackBId: string;
  durationPlayedAMs?: number | null;
  durationPlayedBMs?: number | null;
  successScore?: number;
  occurredAt?: string;
  now?: string;
}): DJTransitionRow {
  const ts = isoNow(args.now);
  const occurred = args.occurredAt ?? ts;
  return {
    track_a_id: args.trackAId,
    track_b_id: args.trackBId,
    frequency: 1,
    avg_duration_played_a_ms: typeof args.durationPlayedAMs === 'number' ? args.durationPlayedAMs : null,
    avg_duration_played_b_ms: typeof args.durationPlayedBMs === 'number' ? args.durationPlayedBMs : null,
    first_seen_at: occurred,
    last_seen_at: occurred,
    success_score: typeof args.successScore === 'number' ? args.successScore : 0,
    created_at: ts,
    updated_at: ts,
  };
}

export function mergeDJTransitionRow(
  existing: DJTransitionRow,
  update: {
    durationPlayedAMs?: number | null;
    durationPlayedBMs?: number | null;
    successScore?: number;
    occurredAt?: string;
    now?: string;
  },
): DJTransitionRow {
  const ts = isoNow(update.now);
  const occurred = update.occurredAt ?? ts;
  const newFrequency = existing.frequency + 1;
  const avgA = mergeAvg(existing.avg_duration_played_a_ms, existing.frequency, update.durationPlayedAMs);
  const avgB = mergeAvg(existing.avg_duration_played_b_ms, existing.frequency, update.durationPlayedBMs);
  const baseScore = typeof update.successScore === 'number' ? update.successScore : existing.success_score;
  const successScore = roundScore((existing.success_score * existing.frequency + baseScore) / newFrequency);
  return {
    ...existing,
    frequency: newFrequency,
    avg_duration_played_a_ms: avgA,
    avg_duration_played_b_ms: avgB,
    last_seen_at: occurred,
    success_score: successScore,
    updated_at: ts,
  };
}

function mergeAvg(current: number | null, count: number, next: number | null | undefined): number | null {
  if (typeof next !== 'number') return current;
  if (current == null) return next;
  return Math.round((current * count + next) / (count + 1));
}

function roundScore(score: number): number {
  return Math.max(0, Math.min(1, Math.round(score * 10000) / 10000));
}

export function toRecommendationFeedbackRow(args: {
  feedbackId: string;
  sessionId?: string | null;
  trackId: string;
  accepted: boolean;
  rankPosition?: number | null;
  clickedPreview?: boolean;
  addedToSet?: boolean;
  occurredAt?: string;
  contextTag?: string | null;
  now?: string;
}): RecommendationFeedbackRow {
  const ts = isoNow(args.now);
  return {
    rec_feedback_id: args.feedbackId,
    session_id: args.sessionId ?? null,
    track_id: args.trackId,
    accepted: args.accepted ? 1 : 0,
    rank_position: typeof args.rankPosition === 'number' ? args.rankPosition : null,
    clicked_preview: args.clickedPreview ? 1 : 0,
    added_to_set: args.addedToSet ? 1 : 0,
    occurred_at: args.occurredAt ?? ts,
    context_tag: args.contextTag ?? null,
    created_at: ts,
  };
}

export function toDJPreferenceRowExplicit(input: ExplicitPreferenceInput, now?: string): Omit<DJPreferenceRow, 'preference_id' | 'created_at'> {
  const ts = isoNow(now);
  return {
    device_id: input.deviceId.trim(),
    dimension: input.dimension,
    value: normalizePreferenceValue(input.value, input.dimension),
    kind: input.kind,
    weight: typeof input.weight === 'number' ? input.weight : 1,
    source: input.source ?? 'explicit',
    occurred_at: input.occurredAt ?? ts,
  };
}

export function toDJPreferenceRowImplicit(evidence: ImplicitPreferenceEvidence, now?: string): Omit<DJPreferenceRow, 'preference_id' | 'created_at'> {
  const ts = isoNow(now);
  const baseWeight = typeof evidence.weight === 'number' ? evidence.weight : 1;
  const kind: DJPreferenceKind = evidence.positive ? 'preferred' : 'avoided';
  return {
    device_id: evidence.deviceId.trim(),
    dimension: evidence.dimension,
    value: normalizePreferenceValue(evidence.value, evidence.dimension),
    kind,
    weight: evidence.positive ? baseWeight : -baseWeight,
    source: 'implicit',
    occurred_at: evidence.occurredAt ?? ts,
  };
}

export function normalizePreferenceValue(value: string, dimension: DJPreferenceDimension): string {
  const trimmed = value.trim();
  if (dimension === 'genre' || dimension === 'artist' || dimension === 'label' || dimension === 'key' || dimension === 'track_exclusion') {
    return trimmed.normalize('NFC').toLocaleLowerCase();
  }
  return trimmed;
}

export function toDJBehaviorProfileRow(args: {
  deviceId: string;
  profileVersion: number;
  schemaVersion: number;
  engineVersion: string;
  profile: PersonalizedTrackProfile;
  computedAt?: string;
  now?: string;
}): DJBehaviorProfileRow {
  const ts = isoNow(args.now);
  return {
    device_id: args.deviceId.trim(),
    profile_version: args.profileVersion,
    schema_version: args.schemaVersion,
    engine_version: args.engineVersion,
    computed_at: args.computedAt ?? ts,
    profile_json: JSON.stringify(args.profile),
    created_at: ts,
    updated_at: ts,
  };
}

export function unpackDJBehaviorProfile(row: DJBehaviorProfileRow): PersonalizedTrackProfile {
  return JSON.parse(row.profile_json) as PersonalizedTrackProfile;
}
