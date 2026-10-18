import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

/**
 * The catalogue lives in a single SQLite file that the harvest script builds on the
 * dev box. It is mounted read-only into the container (Coolify volume at /app/data),
 * so nothing here ever writes to it.
 *
 * Resolution order:
 *   1. FOOTBALL_DATA_DIR (explicit override, used by dev and by the QA runs)
 *   2. /app/data            (the container volume)
 *   3. <cwd>/data           (running from the repo root)
 *   4. <cwd>/../data        (running from app/ during development)
 */
const CANDIDATES = [
  process.env.FOOTBALL_DATA_DIR ? path.join(process.env.FOOTBALL_DATA_DIR, "catalogue.sqlite") : null,
  "/app/data/catalogue.sqlite",
  path.join(process.cwd(), "data", "catalogue.sqlite"),
  path.join(process.cwd(), "..", "data", "catalogue.sqlite"),
].filter((p): p is string => Boolean(p));

let resolved: string | null | undefined;
let db: DatabaseSync | null = null;
let fts: boolean | null = null;

export function dbPath(): string | null {
  if (resolved === undefined) {
    resolved = CANDIDATES.find((p) => {
      try {
        return fs.statSync(p).isFile();
      } catch {
        return false;
      }
    }) ?? null;
  }
  return resolved;
}

export function dbMissing(): boolean {
  return dbPath() === null;
}

export function getDb(): DatabaseSync | null {
  const p = dbPath();
  if (!p) return null;
  if (!db) {
    db = new DatabaseSync(p, { readOnly: true });
    try {
      db.exec("PRAGMA cache_size = -32000");
    } catch {
      /* pragma is a nicety, never fatal */
    }
  }
  return db;
}

/** FTS5 is bundled with Node's SQLite, but probe once instead of assuming. */
export function ftsReady(): boolean {
  if (fts !== null) return fts;
  const d = getDb();
  if (!d) return (fts = false);
  try {
    d.prepare("SELECT rowid FROM player_fts WHERE player_fts MATCH ? LIMIT 1").get("probe*");
    fts = true;
  } catch {
    fts = false;
  }
  return fts;
}

/** Run a read-only query and return rows as plain objects. */
export function all<T = Record<string, unknown>>(sql: string, params: unknown[] = []): T[] {
  const d = getDb();
  if (!d) return [];
  return d.prepare(sql).all(...(params as never[])) as T[];
}

export function one<T = Record<string, unknown>>(sql: string, params: unknown[] = []): T | null {
  const rows = all<T>(sql, params);
  return rows.length ? rows[0] : null;
}
