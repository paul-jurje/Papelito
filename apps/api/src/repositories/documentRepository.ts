import { and, desc, eq } from 'drizzle-orm';
import type { Db } from '../db/index.js';
import { documents, type DbDocument } from '../db/schema.js';
import {
  DEFAULT_DOCUMENT_TITLE,
  EMPTY_PROSEMIRROR_DOC,
  type CreateDocumentInput,
  type Document,
  type UpdateDocumentInput,
} from '../types/index.js';

function toDocument(row: DbDocument): Document {
  return {
    id: row.id,
    userId: row.userId,
    title: row.title,
    content: row.content,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function createDocument(db: Db, input: CreateDocumentInput): Document {
  const row = db
    .insert(documents)
    .values({
      userId: input.userId,
      title: input.title ?? DEFAULT_DOCUMENT_TITLE,
      content: input.content ?? EMPTY_PROSEMIRROR_DOC,
    })
    .returning()
    .get();
  return toDocument(row);
}

export function getDocumentsByUserId(db: Db, userId: number): Document[] {
  const rows = db
    .select()
    .from(documents)
    .where(eq(documents.userId, userId))
    .orderBy(desc(documents.updatedAt))
    .all();
  return rows.map(toDocument);
}

export function getDocumentByIdAndUserId(
  db: Db,
  id: number,
  userId: number,
): Document | undefined {
  const row = db
    .select()
    .from(documents)
    .where(and(eq(documents.id, id), eq(documents.userId, userId)))
    .get();
  return row ? toDocument(row) : undefined;
}

export function updateDocument(
  db: Db,
  id: number,
  userId: number,
  input: UpdateDocumentInput,
): Document | undefined {
  const updates: Partial<{ title: string; content: string }> = {};
  if (input.title !== undefined) updates.title = input.title;
  if (input.content !== undefined) updates.content = input.content;

  if (Object.keys(updates).length === 0) {
    return getDocumentByIdAndUserId(db, id, userId);
  }

  const row = db
    .update(documents)
    .set(updates)
    .where(and(eq(documents.id, id), eq(documents.userId, userId)))
    .returning()
    .get();
  return row ? toDocument(row) : undefined;
}

export function deleteDocument(
  db: Db,
  id: number,
  userId: number,
): boolean {
  const row = db
    .delete(documents)
    .where(and(eq(documents.id, id), eq(documents.userId, userId)))
    .returning({ id: documents.id })
    .get();
  return row !== undefined;
}
