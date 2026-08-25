import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type {
  AudioAnalysis,
  AudioAnalysisPersistence,
  AudioAnalysisPersistenceResult,
} from './audio-analysis.js';

const execFileAsync = promisify(execFile);

function sqlLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

async function runSql(sql: string): Promise<string> {
  const { stdout, stderr } = await execFileAsync(
    'pnpm',
    ['supabase', 'db', 'query', '--linked', sql],
    { maxBuffer: 8 * 1024 * 1024 },
  );

  if (stderr.trim()) {
    console.error(stderr.trim());
  }

  return stdout;
}

function parseFirstJsonObject(
  output: string,
): Record<string, unknown> | null {
  const lines = output.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) {
      continue;
    }

    try {
      return JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      // Continue looking for a JSON object.
    }
  }

  return null;
}

function parseAnalysisRunId(output: string): number | null {
  const json = parseFirstJsonObject(output);

  if (json) {
    const candidates = [
      json.analysisRunId,
      json.analysis_run_id,
      json.id,
      json.source_run_id,
    ];

    for (const candidate of candidates) {
      const value =
        typeof candidate === 'number'
          ? candidate
          : typeof candidate === 'string'
            ? Number(candidate)
            : NaN;

      if (Number.isInteger(value)) {
        return value;
      }
    }
  }

  const match = output.match(
    /\|\s*(\d+)\s*\|\s*([^|]+?)\s*\|\s*([a-fA-F0-9-]{20,})\s*\|\s*(\d+)\s*\|/,
  );

  if (!match) {
    return null;
  }

  const value = Number(match[4]);

  return Number.isInteger(value) ? value : null;
}

function numericSqlValue(value: number): string {
  if (!Number.isFinite(value)) {
    throw new Error('Audio analysis contains a non-finite numeric value.');
  }

  return String(value);
}

export class SupabaseAudioAnalysisPersistence
  implements AudioAnalysisPersistence
{
  public constructor(
    private readonly deviceId: string,
  ) {
    const normalizedDeviceId = deviceId.trim();

    if (!normalizedDeviceId) {
      throw new Error('SYNC_AGENT_ID is required.');
    }
  }

  public async persist(
    trackId: string,
    analysis: AudioAnalysis,
  ): Promise<AudioAnalysisPersistenceResult> {
    const normalizedTrackId = trackId.trim();

    if (!normalizedTrackId) {
      throw new Error('Track ID is required.');
    }

    const analysisRunId = await this.findLatestAnalysisRunId(
      normalizedTrackId,
    );

    const rows = this.buildFeatureRows(
      analysisRunId,
      analysis,
    );

    if (rows.length === 0) {
      throw new Error(
        'Audio analysis produced no persistable features.',
      );
    }

    const persistSql = `
insert into public.dj_track_features (
  analysis_run_id,
  feature_group,
  feature_key,
  numeric_value,
  text_value,
  boolean_value,
  json_value,
  unit,
  source,
  confidence,
  created_at
)
values
  ${rows.join(',\n  ')}
on conflict (analysis_run_id, feature_group, feature_key)
do update set
  numeric_value = excluded.numeric_value,
  text_value = excluded.text_value,
  boolean_value = excluded.boolean_value,
  json_value = excluded.json_value,
  unit = excluded.unit,
  source = excluded.source,
  confidence = excluded.confidence;
`;

    await runSql(persistSql);

    return {
      analysisRunId,
      persistedFeatures: rows.length,
    };
  }

  private async findLatestAnalysisRunId(
    trackId: string,
  ): Promise<number> {
    const trackQuery = `
select
  device_id,
  track_id,
  track_hash,
  id as source_run_id
from public.dj_track_analysis_runs
where device_id = ${sqlLiteral(this.deviceId)}
  and track_id = ${sqlLiteral(trackId)}
order by created_at desc, id desc
limit 1;
`;

    const output = await runSql(trackQuery);
    const analysisRunId = parseAnalysisRunId(output);

    if (analysisRunId === null) {
      throw new Error(`No analysis run found for ${trackId}.`);
    }

    return analysisRunId;
  }

  private buildFeatureRows(
    analysisRunId: number,
    analysis: AudioAnalysis,
  ): string[] {
    const rows: string[] = [];

    if (analysis.durationSeconds !== null) {
      rows.push(
        `(${analysisRunId}, 'audio', 'duration_seconds', ${numericSqlValue(analysis.durationSeconds)}, null, null, null, 'seconds', 'audio', 1.0, now())`,
      );
    }

    if (analysis.sampleRate !== null) {
      rows.push(
        `(${analysisRunId}, 'audio', 'sample_rate', ${numericSqlValue(analysis.sampleRate)}, null, null, null, 'Hz', 'audio', 1.0, now())`,
      );
    }

    if (analysis.channels !== null) {
      rows.push(
        `(${analysisRunId}, 'audio', 'channels', ${numericSqlValue(analysis.channels)}, null, null, null, 'count', 'audio', 1.0, now())`,
      );
    }

    if (analysis.bitrate !== null) {
      rows.push(
        `(${analysisRunId}, 'audio', 'bitrate', ${numericSqlValue(analysis.bitrate)}, null, null, null, 'bps', 'audio', 1.0, now())`,
      );
    }

    if (analysis.codec !== null) {
      rows.push(
        `(${analysisRunId}, 'audio', 'codec', null, ${sqlLiteral(analysis.codec)}, null, null, null, 'audio', 1.0, now())`,
      );
    }

    return rows;
  }
}