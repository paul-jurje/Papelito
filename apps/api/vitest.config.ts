import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    setupFiles: ['./src/test/setup.ts'],
    // Test files share a global SQLite DB singleton (`src/db/index.ts`), so
    // run them serially to keep each test file's isolated in-memory database
    // from being swapped out by another file mid-test.
    fileParallelism: false,
  },
});
