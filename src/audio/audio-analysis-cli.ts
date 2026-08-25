import { analyzeAudioFile } from './audio-analyzer.js';

const filePath = process.argv[2]?.trim();
if (!filePath) {
  console.error('Usage: pnpm exec tsx src/audio/audio-analysis-cli.ts <audio-file>');
  process.exit(2);
}

try {
  const result = await analyzeAudioFile(filePath);
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}