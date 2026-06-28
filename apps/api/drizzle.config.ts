import './src/config/env.js';
import type { Config } from 'drizzle-kit';

export default {
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'papelito.db',
  },
  strict: true,
  verbose: true,
} satisfies Config;
