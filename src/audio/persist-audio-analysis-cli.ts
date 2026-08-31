import { analyzeAudioFile } from './audio-analyzer.js';
import { AudioAnalysisService } from './audio-analysis-service.js';
import { verifyAudioAsset } from './audio-verifier.js';
import { SupabaseAudioAnalysisPersistence } from './supabase-audio-analysis.js';

async function main(): Promise<void> {
  const trackId = process.argv[2]?.trim();
  const filePath = process.argv[3]?.trim();
  const deviceId = process.env.SYNC_AGENT_ID?.trim();

  if (!trackId || !filePath) {
    console.error(
      'Usage: pnpm exec tsx src/audio/persist-audio-analysis-cli.ts <trackId> <audio-file>',
    );
    process.exit(2);
  }

  if (!deviceId) {
    console.error('SYNC_AGENT_ID is required.');
    process.exit(2);
  }

  const service = new AudioAnalysisService({
    analyzer: analyzeAudioFile,
    verifier: verifyAudioAsset,
    persistence: new SupabaseAudioAnalysisPersistence(
      deviceId,
    ),
  });

  try {
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
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : String(error);

    console.error(message);
    process.exit(1);
  }
}

void main();