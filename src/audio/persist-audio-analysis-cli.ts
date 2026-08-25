import { analyzeAudioFile } from './audio-analyzer.js';
import { AudioAnalysisService } from './audio-analysis-service.js';
import { SupabaseAudioAnalysisPersistence } from './supabase-audio-analysis.js';

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

  const service = new AudioAnalysisService({
    analyzer: analyzeAudioFile,
    persistence: new SupabaseAudioAnalysisPersistence(
      deviceId,
    ),
  });

  const result = await service.analyzeAndPersist(
    trackId,
    filePath,
  );

  console.log(
    JSON.stringify(
      {
        trackId,
        analysisRunId: result.persistence.analysisRunId,
        analysis: result.analysis,
        persistedFeatures:
          result.persistence.persistedFeatures,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : String(error),
  );
  process.exit(1);
});