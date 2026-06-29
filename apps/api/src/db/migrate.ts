import '../config/env.js';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const migrationsFolder = resolve(here, '../../drizzle');
let url = process.env.DATABASE_URL ?? 'papelito.db';
if (url !== ':memory:' && !url.startsWith('file:') && !url.startsWith('/')) {
  url = resolve(here, '../../', url);
}

const sqlite = new Database(url);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');
const db = drizzle(sqlite);

console.log(`Running migrations from ${migrationsFolder} against ${url}`);
migrate(db, { migrationsFolder });
sqlite.close();
console.log('Migrations complete.');
