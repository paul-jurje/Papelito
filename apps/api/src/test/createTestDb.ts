import { setDbUrl, type Db, type DbHandle } from '../db/index.js';

export interface TestDbHandle extends DbHandle {
  db: Db;
}

/**
 * Creates an isolated in-memory database with migrations applied and
 * installs it as the process-wide DB singleton (`db` from `../db/index`).
 * The returned handle exposes the underlying `db` for tests that want to
 * pass it explicitly to repository functions; the caller is responsible
 * for closing `handle.sqlite` in `afterEach`.
 */
export function createTestDb(): TestDbHandle {
  return setDbUrl(':memory:', { migrate: true });
}
