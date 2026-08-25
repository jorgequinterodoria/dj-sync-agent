import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { analyzeAudioFile } from './audio-analyzer.js';

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

function parseFirstJsonObject(output: string): Record<string, unknown> | null {
  const lines = output.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        return JSON.parse(trimmed) as Record<string, unknown>;
      } catch {
        // continue
      }
    }
  }
  return null;
}

async function main(): Promise<void> {
  const trackId = process.argv[2]?.trim();
  const filePath = process.argv[3]?.trim();

  if (!trackId || !filePath) {
    console.error(
      'Usage: pnpm exec tsx src/audio/persist-audio-analysis-cli.ts <trackId> <audio-file>',
    );
    process.exit(2);
  }

  const deviceId = process.env.SYNC_AGENT_ID?.trim();
  if (!deviceId) {
    throw new Error('SYNC_AGENT_ID is required.');
  }

  const analysis = await analyzeAudioFile(filePath);

  const trackQuery = `
select
  device_id,
  track_id,
  track_hash,
  id as source_run_id
from public.dj_track_analysis_runs
where device_id = ${sqlLiteral(deviceId)}
  and track_id = ${sqlLiteral(trackId)}
order by created_at desc, id desc
limit 1;
`;

  const trackOutput = await runSql(trackQuery);
  const match = trackOutput.match(
    /\|\s*(\d+)\s*\|\s*([^|]+?)\s*\|\s*([a-fA-F0-9-]{20,})\s*\|\s*(\d+)\s*\|/,
  );

  if (!match) {
    throw new Error(`No analysis run found for ${trackId}.`);
  }

  const analysisRunId = Number(match[4]);
  if (!Number.isInteger(analysisRunId)) {
    throw new Error(`Invalid analysis run id for ${trackId}.`);
  }

  const rows: string[] = [];

  if (analysis.durationSeconds !== null) {
    rows.push(
      `(${analysisRunId}, 'audio', 'duration_seconds', ${analysis.durationSeconds}, null, null, null, 'seconds', 'audio', 1.0, now())`,
    );
  }

  if (analysis.sampleRate !== null) {
    rows.push(
      `(${analysisRunId}, 'audio', 'sample_rate', ${analysis.sampleRate}, null, null, null, 'Hz', 'audio', 1.0, now())`,
    );
  }

  if (analysis.channels !== null) {
    rows.push(
      `(${analysisRunId}, 'audio', 'channels', ${analysis.channels}, null, null, null, 'count', 'audio', 1.0, now())`,
    );
  }

  if (analysis.bitrate !== null) {
    rows.push(
      `(${analysisRunId}, 'audio', 'bitrate', ${analysis.bitrate}, null, null, null, 'bps', 'audio', 1.0, now())`,
    );
  }

  if (analysis.codec !== null) {
    rows.push(
      `(${analysisRunId}, 'audio', 'codec', null, ${sqlLiteral(analysis.codec)}, null, null, null, 'audio', 1.0, now())`,
    );
  }

  if (rows.length === 0) {
    throw new Error('Audio analysis produced no persistable features.');
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

  console.log(
    JSON.stringify(
      {
        trackId,
        analysisRunId,
        analysis,
        persistedFeatures: rows.length,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});