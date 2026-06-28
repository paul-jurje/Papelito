import '../config/env.js';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from './schema.js';

export type Db = BetterSQLite3Database<typeof schema>;

export interface DbHandle {
  db: Db;
  sqlite: Database.Database;
}

const here = dirname(fileURLToPath(import.meta.url));
export const migrationsFolder = resolve(here, '../../drizzle');

export function createDb(url?: string): DbHandle {
  const target = url ?? process.env.DATABASE_URL ?? 'papelito.db';
  const sqlite = new Database(target);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  const db = drizzle(sqlite, { schema });
  return { db, sqlite };
}

export function runMigrations(handle: DbHandle): void {
  migrate(handle.db, { migrationsFolder });
}

// Lazy default singleton — opens `papelito.db` (or DATABASE_URL) on first use.
let defaultHandle: DbHandle | undefined;

function getDefaultHandle(): DbHandle {
  if (!defaultHandle) defaultHandle = createDb();
  return defaultHandle;
}

export interface SetDbUrlOptions {
  /** Run migrations against the newly-created DB. Defaults to true. */
  migrate?: boolean;
}

/**
 * Replace the singleton DB with a freshly-created handle at `url`.
 * The previous handle (if any) is closed before being replaced, so callers
 * do not need to track it for cleanup. Used by tests to swap in an isolated
 * in-memory database between cases.
 */
export function setDbUrl(url: string, opts: SetDbUrlOptions = {}): DbHandle {
  const handle = createDb(url);
  if (opts.migrate !== false) {
    runMigrations(handle);
  }
  if (defaultHandle) {
    try {
      defaultHandle.sqlite.close();
    } catch {
      // ignore: previous handle may already be closed
    }
  }
  defaultHandle = handle;
  return handle;
}

/** Close the current singleton handle (if any) and reset it to undefined. */
export function resetDb(): void {
  if (defaultHandle) {
    try {
      defaultHandle.sqlite.close();
    } catch {
      // ignore
    }
    defaultHandle = undefined;
  }
}

export const db: Db = new Proxy({} as Db, {
  get(_target, prop) {
    const real = getDefaultHandle().db as unknown as Record<PropertyKey, unknown>;
    const value = real[prop];
    return typeof value === 'function' ? value.bind(real) : value;
  },
});
