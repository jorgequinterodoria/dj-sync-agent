import sqlite3 from '@journeyapps/sqlcipher';

export type SqliteDatabase = InstanceType<typeof sqlite3.Database>;

type Row = Record<string, unknown>;

function escapePragmaString(value: string): string {
  return value.replaceAll("'", "''");
}

export function openEncryptedReadOnlyDatabase(
  path: string,
  key: string | undefined,
  cipherCompatibility: number,
): Promise<SqliteDatabase> {
  return new Promise((resolve, reject) => {
    const mode = sqlite3.OPEN_READONLY;
    const db = new sqlite3.Database(path, mode, (openError) => {
      if (openError) {
        reject(openError);
        return;
      }

      db.serialize(() => {
        db.run(`PRAGMA cipher_compatibility = ${cipherCompatibility}`);

        if (key && key.length > 0) {
          db.run(`PRAGMA key = '${escapePragmaString(key)}'`);
        }

        db.get('SELECT count(*) AS ok FROM sqlite_master', (error, row: Row | undefined) => {
          if (error) {
            db.close(() => reject(error));
            return;
          }

          if (row === undefined) {
            db.close(() => reject(new Error('SQLite returned no validation row.')));
            return;
          }

          resolve(db);
        });
      });
    });

    db.configure('busyTimeout', 5000);
  });
}

export function all<T = Row>(db: SqliteDatabase, sql: string, params: unknown[] = []): Promise<T[]> {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (error, rows) => {
      if (error) reject(error);
      else resolve((rows ?? []) as T[]);
    });
  });
}

export function close(db: SqliteDatabase): Promise<void> {
  return new Promise((resolve, reject) => {
    db.close((error) => (error ? reject(error) : resolve()));
  });
}
