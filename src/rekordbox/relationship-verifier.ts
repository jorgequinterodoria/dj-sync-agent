import type { SqliteDatabase } from './sqlcipher.js';
import { all } from './sqlcipher.js';

export interface RelationshipMetric {
  relationship: string;
  sourceTable: string;
  sourceColumn: string;
  targetTable: string;
  targetColumn: string;
  sourceRows: number;
  populatedRows: number;
  matchedRows: number;
  orphanRows: number;
  matchRate: number;
  elapsedMs: number;
}

export interface RelationshipReport {
  schemaVersion: 5;
  generatedAt: string;
  elapsedMs: number;
  rowCounts: Record<string, number>;
  relationships: RelationshipMetric[];
  contentFileCardinality: {
    distinctContentIds: number;
    contentIdsWithMultipleFiles: number;
    distribution: Array<{ bucket: string; contentCount: number }>;
  };
}

type CountRow = { count: number | string };
type RelationshipAggregate = {
  sourceRows: number | string;
  populatedRows: number | string;
  matchedRows: number | string;
};
type DistributionRow = { bucket: string; contentCount: number | string };

const TARGET_TABLES = [
  'djmdContent',
  'contentFile',
  'djmdArtist',
  'djmdAlbum',
  'djmdGenre',
  'djmdKey',
  'djmdLabel',
  'djmdPlaylist',
  'djmdSongPlaylist',
  'djmdCue',
] as const;

const CANDIDATE_RELATIONSHIPS: readonly (readonly [string, string, string, string])[] = [
  ['djmdContent', 'ArtistID', 'djmdArtist', 'ID'],
  ['djmdContent', 'AlbumID', 'djmdAlbum', 'ID'],
  ['djmdContent', 'GenreID', 'djmdGenre', 'ID'],
  ['djmdContent', 'KeyID', 'djmdKey', 'ID'],
  ['djmdContent', 'LabelID', 'djmdLabel', 'ID'],
  ['djmdContent', 'RemixerID', 'djmdArtist', 'ID'],
  ['djmdContent', 'OrgArtistID', 'djmdArtist', 'ID'],
  ['djmdContent', 'ComposerID', 'djmdArtist', 'ID'],
  ['contentFile', 'ContentID', 'djmdContent', 'ID'],
  ['djmdSongPlaylist', 'ContentID', 'djmdContent', 'ID'],
  ['djmdSongPlaylist', 'PlaylistID', 'djmdPlaylist', 'ID'],
  ['djmdCue', 'ContentID', 'djmdContent', 'ID'],
] as const;

function toNumber(value: number | string | null | undefined): number {
  return Number(value ?? 0);
}

async function scalar(db: SqliteDatabase, sql: string): Promise<number> {
  const rows = await all<CountRow>(db, sql);
  return toNumber(rows[0]?.count);
}

export async function verifyRelationships(
  db: SqliteDatabase,
): Promise<RelationshipReport> {
  const startedAt = Date.now();
  const rowCounts: Record<string, number> = {};

  console.log('Relationship verification: collecting row counts...');
  for (const table of TARGET_TABLES) {
    rowCounts[table] = await scalar(
      db,
      `SELECT COUNT(*) AS count FROM "${table}"`,
    );
  }

  const relationships: RelationshipMetric[] = [];

  for (let i = 0; i < CANDIDATE_RELATIONSHIPS.length; i += 1) {
    const relationshipDefinition = CANDIDATE_RELATIONSHIPS[i];
    if (!relationshipDefinition) {
      throw new Error(`Relationship definition missing at index ${i}.`);
    }

    const [sourceTable, sourceColumn, targetTable, targetColumn] =
      relationshipDefinition;

    const label =
      `${sourceTable}.${sourceColumn} -> ${targetTable}.${targetColumn}`;

    console.log(
      `[${i + 1}/${CANDIDATE_RELATIONSHIPS.length}] Checking ${label}`,
    );

    const checkStartedAt = Date.now();

    // Avoid CAST() so SQLite can use the existing indexes on the ID columns.
    // All candidate IDs in the current Rekordbox schema are stored as text-like
    // values, so direct equality is sufficient here.
    const aggregateRows = await all<RelationshipAggregate>(
      db,
      `SELECT
         COUNT(*) AS sourceRows,
         SUM(
           CASE
             WHEN s."${sourceColumn}" IS NOT NULL
               AND s."${sourceColumn}" <> ''
             THEN 1 ELSE 0
           END
         ) AS populatedRows,
         SUM(
           CASE
             WHEN s."${sourceColumn}" IS NOT NULL
               AND s."${sourceColumn}" <> ''
               AND EXISTS (
                 SELECT 1
                 FROM "${targetTable}" t
                 WHERE t."${targetColumn}" = s."${sourceColumn}"
               )
             THEN 1 ELSE 0
           END
         ) AS matchedRows
       FROM "${sourceTable}" s`,
    );

    const aggregate = aggregateRows[0] ?? {
      sourceRows: 0,
      populatedRows: 0,
      matchedRows: 0,
    };

    const sourceRows = toNumber(aggregate.sourceRows);
    const populatedRows = toNumber(aggregate.populatedRows);
    const matchedRows = toNumber(aggregate.matchedRows);
    const orphanRows = Math.max(populatedRows - matchedRows, 0);
    const matchRate =
      populatedRows === 0
        ? 1
        : Number((matchedRows / populatedRows).toFixed(6));
    const elapsedMs = Date.now() - checkStartedAt;

    relationships.push({
      relationship: label,
      sourceTable,
      sourceColumn,
      targetTable,
      targetColumn,
      sourceRows,
      populatedRows,
      matchedRows,
      orphanRows,
      matchRate,
      elapsedMs,
    });

    console.log(
      `       rows=${sourceRows} populated=${populatedRows} ` +
        `matched=${matchedRows} orphan=${orphanRows} ` +
        `rate=${(matchRate * 100).toFixed(3)}% elapsed=${elapsedMs}ms`,
    );
  }

  console.log('Checking contentFile cardinality...');
  const distinctContentIds = await scalar(
    db,
    `SELECT COUNT(DISTINCT "ContentID") AS count
     FROM "contentFile"
     WHERE "ContentID" IS NOT NULL AND "ContentID" <> ''`,
  );

  const contentIdsWithMultipleFiles = await scalar(
    db,
    `SELECT COUNT(*) AS count
     FROM (
       SELECT "ContentID"
       FROM "contentFile"
       WHERE "ContentID" IS NOT NULL AND "ContentID" <> ''
       GROUP BY "ContentID"
       HAVING COUNT(*) > 1
     )`,
  );

  const distribution = (await all<DistributionRow>(
    db,
    `SELECT
       CASE
         WHEN cnt = 1 THEN '1'
         WHEN cnt BETWEEN 2 AND 5 THEN '2-5'
         WHEN cnt BETWEEN 6 AND 20 THEN '6-20'
         ELSE '21+'
       END AS bucket,
       COUNT(*) AS contentCount
     FROM (
       SELECT "ContentID", COUNT(*) AS cnt
       FROM "contentFile"
       WHERE "ContentID" IS NOT NULL AND "ContentID" <> ''
       GROUP BY "ContentID"
     )
     GROUP BY bucket
     ORDER BY
       CASE bucket
         WHEN '1' THEN 1
         WHEN '2-5' THEN 2
         WHEN '6-20' THEN 3
         ELSE 4
       END`,
  )).map((row) => ({
    bucket: row.bucket,
    contentCount: toNumber(row.contentCount),
  }));

  const elapsedMs = Date.now() - startedAt;

  console.log(
    `Relationship verification finished in ${elapsedMs}ms`,
  );

  return {
    schemaVersion: 5,
    generatedAt: new Date().toISOString(),
    elapsedMs,
    rowCounts,
    relationships,
    contentFileCardinality: {
      distinctContentIds,
      contentIdsWithMultipleFiles,
      distribution,
    },
  };
}
