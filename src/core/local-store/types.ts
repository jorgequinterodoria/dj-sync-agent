import type { PersonalizedTrackProfile } from '../../personalization/personalization-types.js';
import type { ConversationSnapshot } from '../../ai/memory/conversation-memory-types.js';

export interface NormalizedTrackRow {
  track_id: string;
  schema_version: number;
  identity_uuid: string | null;

  title: string | null;
  artist: string | null;
  album: string | null;
  genre: string | null;
  label: string | null;
  musical_key: string | null;
  remixer: string | null;
  composer: string | null;
  isrc: string | null;

  bpm_raw: number | null;
  bpm: number | null;
  length_seconds: number | null;
  bitrate: number | null;
  bit_depth: number | null;
  sample_rate: number | null;
  rating: number | null;
  play_count: number | null;
  file_type: number | null;
  analyzed: number | null;

  primary_file_id: string | null;
  primary_file_path: string | null;
  primary_file_local_path: string | null;
  primary_file_hash: string | null;
  primary_file_size: number | null;
  primary_file_kind: string | null;

  rb_local_deleted: number | null;
  rb_local_usn: number | null;
  sync_updated_at: string | null;

  normalized_track_json: string;
  created_at: string;
  updated_at: string;
}

export interface PlaylistRow {
  playlist_id: string;
  name: string;
  parent_id: string | null;
  source: 'rekordbox' | 'local';
  track_count: number;
  updated_at: string | null;
  created_at: string;
}

export interface PlaylistEntryRow {
  playlist_id: string;
  track_id: string;
  track_no: number;
  created_at: string;
}

export interface CueRow {
  cue_id: string;
  track_id: string;
  kind: number | null;
  in_msec: number | null;
  out_msec: number | null;
  color: number | null;
  active_loop: number | null;
  comment: string | null;
  beat_loop_size: number | null;
  content_uuid: string | null;
  uuid: string | null;
  created_at: string;
}

export interface AudioAnalysisResultRow {
  analysis_run_id: number;
  track_id: string;
  asset_checksum: string;
  asset_path: string | null;
  duration_seconds: number | null;
  sample_rate: number | null;
  channels: number | null;
  bitrate: number | null;
  codec: string | null;
  created_at: string;
}

export interface AudioFeaturesRow {
  track_id: string;
  schema_version: number;
  analyzer_version: string;
  generated_at: string;
  feature_json: string;
  updated_at: string;
}

export interface DJTrackProfileRow {
  track_id: string;
  engine_version: string;
  profile_version: number;
  schema_version: number;
  audio_features_version: number;
  features_version: number;
  computed_at: string;
  profile_json: string;
  created_at: string;
  updated_at: string;
}

export interface SyncRunRow {
  sync_run_id: number;
  started_at: string;
  finished_at: string | null;
  status: 'running' | 'success' | 'error';
  rows_added: number;
  rows_updated: number;
  rows_deleted: number;
  error_message: string | null;
}

export interface DJSessionRow {
  session_id: string;
  started_at: string;
  ended_at: string | null;
  source: string;
  context_tag: string | null;
  created_at: string;
  updated_at: string;
}

export type DJSessionTrackFlags = {
  skipped?: boolean;
  cutShort?: boolean;
  playedFull?: boolean;
  [key: string]: unknown;
};

export interface DJSessionTrackRow {
  session_id: string;
  position: number;
  track_id: string;
  played_at: string;
  source: string | null;
  duration_played_ms: number | null;
  flags_json: string;
  created_at: string;
}

export interface DJTransitionRow {
  track_a_id: string;
  track_b_id: string;
  frequency: number;
  avg_duration_played_a_ms: number | null;
  avg_duration_played_b_ms: number | null;
  first_seen_at: string;
  last_seen_at: string;
  success_score: number;
  created_at: string;
  updated_at: string;
}

export interface RecommendationFeedbackRow {
  rec_feedback_id: string;
  session_id: string | null;
  track_id: string;
  accepted: number;
  rank_position: number | null;
  clicked_preview: number;
  added_to_set: number;
  occurred_at: string;
  context_tag: string | null;
  created_at: string;
}

export type DJPreferenceDimension =
  | 'genre'
  | 'artist'
  | 'label'
  | 'key'
  | 'bpm_range'
  | 'energy_range'
  | 'track_exclusion'
  | 'context_affinity';

export type DJPreferenceKind =
  | 'preferred'
  | 'avoided'
  | 'excluded'
  | 'derived'
  | 'min'
  | 'max';

export interface DJPreferenceRow {
  preference_id: number;
  device_id: string;
  dimension: DJPreferenceDimension;
  value: string;
  kind: DJPreferenceKind;
  weight: number;
  source: 'explicit' | 'implicit' | 'system' | 'derived';
  occurred_at: string;
  created_at: string;
}

export interface DJBehaviorProfileRow {
  device_id: string;
  profile_version: number;
  schema_version: number;
  engine_version: string;
  computed_at: string;
  profile_json: string;
  created_at: string;
  updated_at: string;
}

export interface CopilotConversationRow {
  conversation_id: string;
  schema_version: number;
  created_at: string;
  updated_at: string;
  snapshot_json: string;
}

export type DJBehaviorProfileV1 = PersonalizedTrackProfile;

export type CopilotDbRow =
  | NormalizedTrackRow
  | PlaylistRow
  | PlaylistEntryRow
  | CueRow
  | AudioAnalysisResultRow
  | AudioFeaturesRow
  | DJTrackProfileRow
  | SyncRunRow
  | DJSessionRow
  | DJSessionTrackRow
  | DJTransitionRow
  | RecommendationFeedbackRow
  | DJPreferenceRow
  | DJBehaviorProfileRow
  | CopilotConversationRow;

export function unpackConversationSnapshot(row: CopilotConversationRow): ConversationSnapshot {
  return JSON.parse(row.snapshot_json) as ConversationSnapshot;
}

export function packConversationSnapshot(snapshot: ConversationSnapshot): Omit<CopilotConversationRow, 'created_at' | 'updated_at'> {
  return {
    conversation_id: snapshot.conversationId,
    schema_version: snapshot.schemaVersion,
    snapshot_json: JSON.stringify(snapshot),
  };
}
