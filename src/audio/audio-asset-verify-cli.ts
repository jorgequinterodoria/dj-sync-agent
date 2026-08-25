import { openEncryptedReadOnlyDatabase, close } from '../rekordbox/sqlcipher.js';
import { readTracksByIds } from '../sync/track-batch-reader.js';
import { normalizeTrack } from '../rekordbox/normalized-track.js';
import { verifyAudioAsset } from '../audio/audio-verifier.js';

function usage(): never {
  console.error('Usage: pnpm exec tsx src/sync/audio-asset-verify-cli.ts <trackId>');
  process.exit(2);
}

async function main(): Promise<void> {
  const trackId = process.argv[2]?.trim();
  if (!trackId) usage();

  const dbPath =
    process.env.REKORDBOX_DB_PATH?.trim() ||
    `${process.env.HOME}/Library/Pioneer/rekordbox/master.db`;

  const dbKey = process.env.REKORDBOX_DB_KEY?.trim() || undefined;

  const compatibility = Number.parseInt(
    process.env.REKORDBOX_CIPHER_COMPATIBILITY?.trim() || '4',
    10,
  );

  if (!Number.isInteger(compatibility) || compatibility < 1) {
    throw new Error('REKORDBOX_CIPHER_COMPATIBILITY must be a positive integer.');
  }

  const db = await openEncryptedReadOnlyDatabase(dbPath, dbKey, compatibility);

  try {
    const samples = await readTracksByIds(db, '?', [trackId]);

    if (samples.length !== 1) {
      throw new Error(`Track not found or ambiguous: ${trackId}`);
    }

   const sample = samples[0];

if (!sample) {
  throw new Error(`Track not found or ambiguous: ${trackId}`);
}

const track = normalizeTrack(sample);
    const localPath = track.primaryFile.localPath ?? track.primaryFile.path;

    if (!localPath) {
      throw new Error(`Track ${trackId} has no local audio path.`);
    }

    if (track.primaryFile.kind !== 'media') {
      throw new Error(`Track ${trackId} primaryFile is not media.`);
    }

    const verified = await verifyAudioAsset(localPath);

    const sql = `update public.dj_track_audio_assets
set
  audio_checksum = '${verified.checksum}',
  audio_checksum_source = 'local_byte_hash',
  audio_verified_at = now(),
  asset_status = 'verified',
  updated_at = now()
where device_id = '${(process.env.SYNC_AGENT_ID ?? '').replaceAll("'", "''")}'
  and track_id = '${trackId.replaceAll("'", "''")}';`;

    console.log(
      JSON.stringify(
        {
          trackId,
          path: verified.path,
          size: verified.size,
          checksum: verified.checksum,
          algorithm: verified.algorithm,
          bytesRead: verified.bytesRead,
          sql,
        },
        null,
        2,
      ),
    );
  } finally {
    await close(db);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});