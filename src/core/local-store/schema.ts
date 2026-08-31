export const COPILOT_DB_SCHEMA_VERSION = 2;

export interface DbIndexDef {
  name: string;
  table: string;
  unique: boolean;
  expressions: string[];
}

export interface DbTableDef {
  name: string;
  columns: string[];
  primaryKey?: string[];
  foreignKeys?: string[];
  indices?: DbIndexDef[];
}

export const COPILOT_DB_TABLES: DbTableDef[] = [
  {
    name: 'normalized_tracks',
    columns: [
      'track_id TEXT NOT NULL',
      'schema_version INTEGER NOT NULL',
      'identity_uuid TEXT',
      'title TEXT',
      'artist TEXT',
      'album TEXT',
      'genre TEXT',
      'label TEXT',
      'musical_key TEXT',
      'remixer TEXT',
      'composer TEXT',
      'isrc TEXT',
      'bpm_raw REAL',
      'bpm REAL',
      'length_seconds REAL',
      'bitrate INTEGER',
      'bit_depth INTEGER',
      'sample_rate INTEGER',
      'rating INTEGER',
      'play_count INTEGER',
      'file_type INTEGER',
      'analyzed INTEGER',
      'primary_file_id TEXT',
      'primary_file_path TEXT',
      'primary_file_local_path TEXT',
      'primary_file_hash TEXT',
      'primary_file_size INTEGER',
      'primary_file_kind TEXT',
      'rb_local_deleted INTEGER',
      'rb_local_usn INTEGER',
      'sync_updated_at TEXT',
      'normalized_track_json TEXT NOT NULL',
      'created_at TEXT NOT NULL',
      'updated_at TEXT NOT NULL',
    ],
    primaryKey: ['track_id'],
    indices: [
      { name: 'idx_tracks_bpm', table: 'normalized_tracks', unique: false, expressions: ['bpm'] },
      { name: 'idx_tracks_key', table: 'normalized_tracks', unique: false, expressions: ['musical_key'] },
      { name: 'idx_tracks_genre', table: 'normalized_tracks', unique: false, expressions: ['genre'] },
      { name: 'idx_tracks_artist', table: 'normalized_tracks', unique: false, expressions: ['artist'] },
      {
        name: 'idx_tracks_composite_dj_query',
        table: 'normalized_tracks',
        unique: false,
        expressions: ['bpm', 'musical_key', 'genre', 'artist'],
      },
      { name: 'idx_tracks_primary_local_path', table: 'normalized_tracks', unique: false, expressions: ['primary_file_local_path'] },
    ],
  },
  {
    name: 'playlists',
    columns: [
      'playlist_id TEXT NOT NULL',
      'name TEXT NOT NULL',
      'parent_id TEXT',
      'source TEXT NOT NULL',
      'track_count INTEGER NOT NULL DEFAULT 0',
      'updated_at TEXT',
      'created_at TEXT NOT NULL',
    ],
    primaryKey: ['playlist_id'],
    indices: [
      { name: 'idx_playlists_parent', table: 'playlists', unique: false, expressions: ['parent_id'] },
      { name: 'idx_playlists_source', table: 'playlists', unique: false, expressions: ['source'] },
    ],
  },
  {
    name: 'playlist_entries',
    columns: [
      'playlist_id TEXT NOT NULL',
      'track_id TEXT NOT NULL',
      'track_no INTEGER NOT NULL',
      'created_at TEXT NOT NULL',
    ],
    primaryKey: ['playlist_id', 'track_id', 'track_no'],
    foreignKeys: [
      'FOREIGN KEY (playlist_id) REFERENCES playlists(playlist_id) ON DELETE CASCADE',
      'FOREIGN KEY (track_id) REFERENCES normalized_tracks(track_id) ON DELETE CASCADE',
    ],
    indices: [
      { name: 'idx_entries_track', table: 'playlist_entries', unique: false, expressions: ['track_id'] },
      { name: 'idx_entries_order', table: 'playlist_entries', unique: false, expressions: ['playlist_id', 'track_no'] },
    ],
  },
  {
    name: 'cues',
    columns: [
      'cue_id TEXT NOT NULL',
      'track_id TEXT NOT NULL',
      'kind INTEGER',
      'in_msec INTEGER',
      'out_msec INTEGER',
      'color INTEGER',
      'active_loop INTEGER',
      'comment TEXT',
      'beat_loop_size INTEGER',
      'content_uuid TEXT',
      'uuid TEXT',
      'created_at TEXT NOT NULL',
    ],
    primaryKey: ['cue_id'],
    foreignKeys: [
      'FOREIGN KEY (track_id) REFERENCES normalized_tracks(track_id) ON DELETE CASCADE',
    ],
    indices: [
      { name: 'idx_cues_track', table: 'cues', unique: false, expressions: ['track_id'] },
      { name: 'idx_cues_track_in', table: 'cues', unique: false, expressions: ['track_id', 'in_msec'] },
    ],
  },
  {
    name: 'audio_analysis_results',
    columns: [
      'analysis_run_id INTEGER NOT NULL',
      'track_id TEXT NOT NULL',
      'asset_checksum TEXT NOT NULL',
      'asset_path TEXT',
      'duration_seconds REAL',
      'sample_rate INTEGER',
      'channels INTEGER',
      'bitrate INTEGER',
      'codec TEXT',
      'created_at TEXT NOT NULL',
    ],
    primaryKey: ['analysis_run_id', 'track_id'],
    foreignKeys: [
      'FOREIGN KEY (track_id) REFERENCES normalized_tracks(track_id) ON DELETE CASCADE',
    ],
    indices: [
      { name: 'idx_audio_analysis_track', table: 'audio_analysis_results', unique: false, expressions: ['track_id'] },
      { name: 'idx_audio_analysis_checksum', table: 'audio_analysis_results', unique: false, expressions: ['asset_checksum'] },
    ],
  },
  {
    name: 'audio_features',
    columns: [
      'track_id TEXT NOT NULL',
      'schema_version INTEGER NOT NULL',
      'analyzer_version TEXT NOT NULL',
      'generated_at TEXT NOT NULL',
      'feature_json TEXT NOT NULL',
      'updated_at TEXT NOT NULL',
    ],
    primaryKey: ['track_id', 'schema_version', 'analyzer_version'],
    foreignKeys: [
      'FOREIGN KEY (track_id) REFERENCES normalized_tracks(track_id) ON DELETE CASCADE',
    ],
  },
  {
    name: 'dj_track_profiles',
    columns: [
      'track_id TEXT NOT NULL',
      'engine_version TEXT NOT NULL',
      'profile_version INTEGER NOT NULL',
      'schema_version INTEGER NOT NULL',
      'audio_features_version INTEGER NOT NULL',
      'features_version INTEGER NOT NULL',
      'computed_at TEXT NOT NULL',
      'profile_json TEXT NOT NULL',
      'created_at TEXT NOT NULL',
      'updated_at TEXT NOT NULL',
    ],
    primaryKey: ['track_id', 'engine_version', 'profile_version', 'schema_version', 'audio_features_version', 'features_version'],
    foreignKeys: [
      'FOREIGN KEY (track_id) REFERENCES normalized_tracks(track_id) ON DELETE CASCADE',
    ],
    indices: [
      { name: 'idx_profiles_lookup', table: 'dj_track_profiles', unique: false, expressions: ['track_id', 'engine_version', 'profile_version'] },
    ],
  },
  {
    name: 'sync_runs',
    columns: [
      'sync_run_id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT',
      'started_at TEXT NOT NULL',
      'finished_at TEXT',
      'status TEXT NOT NULL',
      'rows_added INTEGER NOT NULL DEFAULT 0',
      'rows_updated INTEGER NOT NULL DEFAULT 0',
      'rows_deleted INTEGER NOT NULL DEFAULT 0',
      'error_message TEXT',
    ],
    indices: [
      { name: 'idx_sync_runs_status', table: 'sync_runs', unique: false, expressions: ['status'] },
      { name: 'idx_sync_runs_started', table: 'sync_runs', unique: false, expressions: ['started_at'] },
    ],
  },
  {
    name: 'dj_sessions',
    columns: [
      'session_id TEXT NOT NULL',
      'started_at TEXT NOT NULL',
      'ended_at TEXT',
      'source TEXT NOT NULL',
      'context_tag TEXT',
      'created_at TEXT NOT NULL',
      'updated_at TEXT NOT NULL',
    ],
    primaryKey: ['session_id'],
    indices: [
      { name: 'idx_sessions_started', table: 'dj_sessions', unique: false, expressions: ['started_at'] },
      { name: 'idx_sessions_context', table: 'dj_sessions', unique: false, expressions: ['context_tag'] },
      { name: 'idx_sessions_source', table: 'dj_sessions', unique: false, expressions: ['source'] },
    ],
  },
  {
    name: 'dj_session_tracks',
    columns: [
      'session_id TEXT NOT NULL',
      'position INTEGER NOT NULL',
      'track_id TEXT NOT NULL',
      'played_at TEXT NOT NULL',
      'source TEXT',
      'duration_played_ms INTEGER',
      'flags_json TEXT NOT NULL',
      'created_at TEXT NOT NULL',
    ],
    primaryKey: ['session_id', 'position'],
    foreignKeys: [
      'FOREIGN KEY (session_id) REFERENCES dj_sessions(session_id) ON DELETE CASCADE',
      'FOREIGN KEY (track_id) REFERENCES normalized_tracks(track_id) ON DELETE CASCADE',
    ],
    indices: [
      { name: 'idx_session_tracks_session', table: 'dj_session_tracks', unique: false, expressions: ['session_id', 'position'] },
      { name: 'idx_session_tracks_track', table: 'dj_session_tracks', unique: false, expressions: ['track_id'] },
      { name: 'idx_session_tracks_played', table: 'dj_session_tracks', unique: false, expressions: ['played_at'] },
    ],
  },
  {
    name: 'dj_transitions',
    columns: [
      'track_a_id TEXT NOT NULL',
      'track_b_id TEXT NOT NULL',
      'frequency INTEGER NOT NULL DEFAULT 1',
      'avg_duration_played_a_ms INTEGER',
      'avg_duration_played_b_ms INTEGER',
      'first_seen_at TEXT NOT NULL',
      'last_seen_at TEXT NOT NULL',
      'success_score REAL NOT NULL DEFAULT 0',
      'created_at TEXT NOT NULL',
      'updated_at TEXT NOT NULL',
    ],
    primaryKey: ['track_a_id', 'track_b_id'],
    foreignKeys: [
      'FOREIGN KEY (track_a_id) REFERENCES normalized_tracks(track_id) ON DELETE CASCADE',
      'FOREIGN KEY (track_b_id) REFERENCES normalized_tracks(track_id) ON DELETE CASCADE',
    ],
    indices: [
      { name: 'idx_transitions_a', table: 'dj_transitions', unique: false, expressions: ['track_a_id', 'success_score'] },
      { name: 'idx_transitions_b', table: 'dj_transitions', unique: false, expressions: ['track_b_id'] },
      { name: 'idx_transitions_frequency', table: 'dj_transitions', unique: false, expressions: ['frequency'] },
    ],
  },
  {
    name: 'recommendation_feedback',
    columns: [
      'rec_feedback_id TEXT NOT NULL',
      'session_id TEXT',
      'track_id TEXT NOT NULL',
      'accepted INTEGER NOT NULL',
      'rank_position INTEGER',
      'clicked_preview INTEGER NOT NULL DEFAULT 0',
      'added_to_set INTEGER NOT NULL DEFAULT 0',
      'occurred_at TEXT NOT NULL',
      'context_tag TEXT',
      'created_at TEXT NOT NULL',
    ],
    primaryKey: ['rec_feedback_id'],
    foreignKeys: [
      'FOREIGN KEY (session_id) REFERENCES dj_sessions(session_id) ON DELETE SET NULL',
      'FOREIGN KEY (track_id) REFERENCES normalized_tracks(track_id) ON DELETE CASCADE',
    ],
    indices: [
      { name: 'idx_feedback_session', table: 'recommendation_feedback', unique: false, expressions: ['session_id'] },
      { name: 'idx_feedback_track', table: 'recommendation_feedback', unique: false, expressions: ['track_id'] },
      { name: 'idx_feedback_accepted', table: 'recommendation_feedback', unique: false, expressions: ['accepted', 'occurred_at'] },
    ],
  },
  {
    name: 'dj_preferences',
    columns: [
      'preference_id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT',
      'device_id TEXT NOT NULL',
      'dimension TEXT NOT NULL',
      'value TEXT NOT NULL',
      'kind TEXT NOT NULL',
      'weight REAL NOT NULL DEFAULT 1',
      'source TEXT NOT NULL',
      'occurred_at TEXT NOT NULL',
      'created_at TEXT NOT NULL',
    ],
    indices: [
      { name: 'idx_prefs_device_dim', table: 'dj_preferences', unique: false, expressions: ['device_id', 'dimension', 'value'] },
      { name: 'idx_prefs_kind', table: 'dj_preferences', unique: false, expressions: ['kind'] },
      { name: 'idx_prefs_occurred', table: 'dj_preferences', unique: false, expressions: ['occurred_at'] },
    ],
  },
  {
    name: 'dj_behavior_profiles',
    columns: [
      'device_id TEXT NOT NULL',
      'profile_version INTEGER NOT NULL',
      'schema_version INTEGER NOT NULL',
      'engine_version TEXT NOT NULL',
      'computed_at TEXT NOT NULL',
      'profile_json TEXT NOT NULL',
      'created_at TEXT NOT NULL',
      'updated_at TEXT NOT NULL',
    ],
    primaryKey: ['device_id', 'profile_version', 'schema_version', 'engine_version'],
    indices: [
      { name: 'idx_behavior_lookup', table: 'dj_behavior_profiles', unique: false, expressions: ['device_id', 'profile_version'] },
    ],
  },
  {
    name: 'copilot_conversations',
    columns: [
      'conversation_id TEXT NOT NULL',
      'schema_version INTEGER NOT NULL',
      'created_at TEXT NOT NULL',
      'updated_at TEXT NOT NULL',
      'snapshot_json TEXT NOT NULL',
    ],
    primaryKey: ['conversation_id'],
    indices: [
      { name: 'idx_conversations_updated', table: 'copilot_conversations', unique: false, expressions: ['updated_at'] },
    ],
  },
];

export function renderCreateTableSql(def: DbTableDef): string {
  const cols = [...def.columns];
  if (def.primaryKey && def.primaryKey.length > 0) {
    cols.push(`PRIMARY KEY (${def.primaryKey.join(', ')})`);
  }
  if (def.foreignKeys) {
    cols.push(...def.foreignKeys);
  }
  return `CREATE TABLE IF NOT EXISTS ${def.name} (\n  ${cols.join(',\n  ')}\n) STRICT;`;
}

export function renderCreateIndexSql(index: DbIndexDef): string {
  const unique = index.unique ? 'UNIQUE ' : '';
  return `CREATE ${unique}INDEX IF NOT EXISTS ${index.name} ON ${index.table} (${index.expressions.join(', ')});`;
}

export function renderAllSchemaSql(): string[] {
  const statements: string[] = [];
  for (const table of COPILOT_DB_TABLES) {
    statements.push(renderCreateTableSql(table));
    for (const index of table.indices ?? []) {
      statements.push(renderCreateIndexSql(index));
    }
  }
  return statements;
}

export function renderBlockBSchemaSql(): string[] {
  const statements: string[] = [];
  for (const table of COPILOT_DB_TABLES_BLOQUE_B) {
    statements.push(renderCreateTableSql(table));
    for (const index of table.indices ?? []) {
      statements.push(renderCreateIndexSql(index));
    }
  }
  return statements;
}

export function renderBlockCSchemaSql(): string[] {
  const statements: string[] = [];
  for (const table of COPILOT_DB_TABLES_BLOQUE_C) {
    statements.push(renderCreateTableSql(table));
    for (const index of table.indices ?? []) {
      statements.push(renderCreateIndexSql(index));
    }
  }
  return statements;
}


export const BLOQUE_B_TABLE_NAMES: ReadonlyArray<string> = [
  'normalized_tracks',
  'playlists',
  'playlist_entries',
  'cues',
  'audio_analysis_results',
  'audio_features',
  'dj_track_profiles',
  'sync_runs',
];

export const BLOQUE_C_TABLE_NAMES: ReadonlyArray<string> = [
  'dj_sessions',
  'dj_session_tracks',
  'dj_transitions',
  'recommendation_feedback',
  'dj_preferences',
  'dj_behavior_profiles',
  'copilot_conversations',
];

export const COPILOT_DB_TABLES_BLOQUE_B = COPILOT_DB_TABLES.filter((t) => BLOQUE_B_TABLE_NAMES.includes(t.name));
export const COPILOT_DB_TABLES_BLOQUE_C = COPILOT_DB_TABLES.filter((t) => BLOQUE_C_TABLE_NAMES.includes(t.name));
