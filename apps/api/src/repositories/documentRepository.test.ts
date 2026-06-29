import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, type TestDbHandle } from '../test/createTestDb.js';
import { createUser } from './userRepository.js';
import {
  createDocument,
  deleteDocument,
  getDocumentByIdAndUserId,
  getDocumentsByUserId,
  updateDocument,
} from './documentRepository.js';
import { DEFAULT_DOCUMENT_TITLE, EMPTY_PROSEMIRROR_DOC } from '../types/index.js';

function makeUser(handle: TestDbHandle, email: string): number {
  return createUser(handle.db, { email, passwordHash: 'hash' }).id;
}

const SAMPLE_DOC = JSON.stringify({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hi' }] }],
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe('documentRepository', () => {
  let handle: TestDbHandle;

  beforeEach(() => {
    handle = createTestDb();
  });

  afterEach(() => {
    handle.sqlite.close();
  });

  describe('createDocument', () => {
    it('defaults title and content to ProseMirror empty doc', () => {
      const userId = makeUser(handle, 'u1@example.com');
      const doc = createDocument(handle.db, { userId });

      expect(doc.title).toBe(DEFAULT_DOCUMENT_TITLE);
      expect(doc.content).toBe(EMPTY_PROSEMIRROR_DOC);
      expect(doc.content).toBe('{"type":"doc","content":[]}');
      expect(doc.id).toBeTypeOf('string');
      expect(doc.id).toMatch(UUID_RE);
      JSON.parse(doc.content); // throws if invalid JSON
    });

    it('accepts explicit title and content', () => {
      const userId = makeUser(handle, 'u2@example.com');
      const doc = createDocument(handle.db, {
        userId,
        title: 'My Doc',
        content: SAMPLE_DOC,
      });
      expect(doc.title).toBe('My Doc');
      expect(doc.content).toBe(SAMPLE_DOC);
      expect(doc.id).toBeTypeOf('string');
      expect(doc.id).toMatch(UUID_RE);
    });
  });

  describe('getDocumentsByUserId', () => {
    it("returns only the requesting user's documents, newest updated first", async () => {
      const a = makeUser(handle, 'a@example.com');
      const b = makeUser(handle, 'b@example.com');
      const older = createDocument(handle.db, {
        userId: a,
        title: 'older',
        content: EMPTY_PROSEMIRROR_DOC,
      });
      // Make sure updatedAt differs.
      await new Promise((r) => setTimeout(r, 1100));
      const newer = createDocument(handle.db, {
        userId: a,
        title: 'newer',
        content: EMPTY_PROSEMIRROR_DOC,
      });
      createDocument(handle.db, {
        userId: b,
        title: 'other-user',
        content: EMPTY_PROSEMIRROR_DOC,
      });

      const list = getDocumentsByUserId(handle.db, a);
      expect(list).toHaveLength(2);
      expect(list[0]?.id).toBe(newer.id);
      expect(list[1]?.id).toBe(older.id);
      expect(list.every((d) => d.userId === a)).toBe(true);
    });

    it('returns an empty list when the user has no documents', () => {
      const a = makeUser(handle, 'a@example.com');
      expect(getDocumentsByUserId(handle.db, a)).toEqual([]);
    });
  });

  describe('getDocumentByIdAndUserId', () => {
    it('returns the document for the owning user', () => {
      const userId = makeUser(handle, 'u3@example.com');
      const doc = createDocument(handle.db, {
        userId,
        title: 'mine',
        content: EMPTY_PROSEMIRROR_DOC,
      });
      expect(getDocumentByIdAndUserId(handle.db, doc.id, userId)).toEqual(doc);
    });

    it('returns undefined when the document belongs to another user', () => {
      const a = makeUser(handle, 'a@example.com');
      const b = makeUser(handle, 'b@example.com');
      const doc = createDocument(handle.db, {
        userId: a,
        title: 'a-only',
        content: EMPTY_PROSEMIRROR_DOC,
      });
      expect(getDocumentByIdAndUserId(handle.db, doc.id, b)).toBeUndefined();
    });

    it('returns undefined when the id does not exist', () => {
      const a = makeUser(handle, 'a@example.com');
      expect(
        getDocumentByIdAndUserId(handle.db, '00000000-0000-0000-0000-000000000000', a),
      ).toBeUndefined();
    });
  });

  describe('updateDocument', () => {
    it('updates title and content for the owning user', () => {
      const userId = makeUser(handle, 'u4@example.com');
      const doc = createDocument(handle.db, { userId });

      const updated = updateDocument(handle.db, doc.id, userId, {
        title: 'Renamed',
        content: SAMPLE_DOC,
      });

      expect(updated?.title).toBe('Renamed');
      expect(updated?.content).toBe(SAMPLE_DOC);
      expect(updated?.id).toBe(doc.id);
    });

    it('updates only title when content is omitted', () => {
      const userId = makeUser(handle, 'u5@example.com');
      const doc = createDocument(handle.db, { userId });
      const updated = updateDocument(handle.db, doc.id, userId, {
        title: 'New title',
      });
      expect(updated?.title).toBe('New title');
      expect(updated?.content).toBe(doc.content);
    });

    it('returns undefined when the user does not own the document', () => {
      const a = makeUser(handle, 'a@example.com');
      const b = makeUser(handle, 'b@example.com');
      const doc = createDocument(handle.db, { userId: a });
      expect(updateDocument(handle.db, doc.id, b, { title: 'Hacked' })).toBeUndefined();
      // Confirm no change.
      expect(getDocumentByIdAndUserId(handle.db, doc.id, a)?.title).toBe(doc.title);
    });
  });

  describe('deleteDocument', () => {
    it('removes the document and returns true for the owner', () => {
      const userId = makeUser(handle, 'u6@example.com');
      const doc = createDocument(handle.db, { userId });
      expect(deleteDocument(handle.db, doc.id, userId)).toBe(true);
      expect(getDocumentByIdAndUserId(handle.db, doc.id, userId)).toBeUndefined();
    });

    it('returns false and does nothing for non-owner', () => {
      const a = makeUser(handle, 'a@example.com');
      const b = makeUser(handle, 'b@example.com');
      const doc = createDocument(handle.db, { userId: a });
      expect(deleteDocument(handle.db, doc.id, b)).toBe(false);
      expect(getDocumentByIdAndUserId(handle.db, doc.id, a)).toBeDefined();
    });
  });
});
