import { eq } from 'drizzle-orm';
import type { Db } from '../db/index.js';
import { users, type DbUser } from '../db/schema.js';
import type { CreateUserInput, User } from '../types/index.js';

function toUser(row: DbUser): User {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.passwordHash,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function createUser(db: Db, input: CreateUserInput): User {
  const row = db.insert(users).values(input).returning().get();
  return toUser(row);
}

export function getUserByEmail(db: Db, email: string): User | undefined {
  const row = db.select().from(users).where(eq(users.email, email)).get();
  return row ? toUser(row) : undefined;
}

export function getUserById(db: Db, id: number): User | undefined {
  const row = db.select().from(users).where(eq(users.id, id)).get();
  return row ? toUser(row) : undefined;
}
