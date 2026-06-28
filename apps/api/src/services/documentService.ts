// Document service layer.
//
// Translates repository operations into domain-level outcomes and enforces
// ownership-based authorization. Routes call into here; this layer is the
// single place that decides whether a document operation is permitted for the
// calling user and whether the document exists.

import { db } from '../db/index.js';
import {
  createDocument as repoCreateDocument,
  deleteDocument as repoDeleteDocument,
  getDocumentByIdAndUserId,
  getDocumentsByUserId,
  updateDocument as repoUpdateDocument,
} from '../repositories/documentRepository.js';
import {
  DEFAULT_DOCUMENT_TITLE,
  EMPTY_PROSEMIRROR_DOC,
  type Document,
  type UpdateDocumentInput,
} from '../types/index.js';

/**
 * Thrown when a document operation targets an id that does not exist OR is not
 * owned by the calling user. We collapse the two cases into one error to avoid
 * leaking the existence of documents the caller cannot access.
 */
export class NotFoundError extends Error {
  constructor(documentId: number) {
    super(`Document not found: ${documentId}`);
    this.name = 'NotFoundError';
  }
}

export interface CreateDocumentData {
  title?: string;
  content?: string;
}

/**
 * Creates a new document for the given user with sensible defaults (empty
 * ProseMirror doc + "Untitled document" title) when fields are omitted.
 *
 * The caller is responsible for validating the inputs before invoking this
 * function; this layer trusts that any provided `content` is already a
 * well-formed ProseMirror JSON string.
 */
export function createDocument(
  userId: number,
  data: CreateDocumentData = {},
): Document {
  return repoCreateDocument(db, {
    userId,
    title: data.title ?? DEFAULT_DOCUMENT_TITLE,
    content: data.content ?? EMPTY_PROSEMIRROR_DOC,
  });
}

/**
 * Returns the user's documents sorted by `updatedAt` descending.
 */
export function listDocuments(userId: number): Document[] {
  return getDocumentsByUserId(db, userId);
}

/**
 * Returns a single document if and only if it is owned by the user. Throws
 * `NotFoundError` otherwise (covers both "doesn't exist" and "owned by someone
 * else" — callers don't need to distinguish).
 */
export function getDocument(userId: number, documentId: number): Document {
  const doc = getDocumentByIdAndUserId(db, documentId, userId);
  if (!doc) throw new NotFoundError(documentId);
  return doc;
}

/**
 * Updates the document's title and/or content. Throws `NotFoundError` if the
 * document does not exist or is not owned by the user.
 */
export function updateDocument(
  userId: number,
  documentId: number,
  data: UpdateDocumentInput,
): Document {
  const updated = repoUpdateDocument(db, documentId, userId, data);
  if (!updated) throw new NotFoundError(documentId);
  return updated;
}

/**
 * Deletes the document. Throws `NotFoundError` if the document does not exist
 * or is not owned by the user — we intentionally do not silently 404 here so
 * that "you tried to delete something you don't have" and "the id is bogus"
 * are reported the same way (idempotency aside, we never want to silently
 * succeed a no-op for an unauthorized actor).
 */
export function deleteDocument(userId: number, documentId: number): void {
  const removed = repoDeleteDocument(db, documentId, userId);
  if (!removed) throw new NotFoundError(documentId);
}
