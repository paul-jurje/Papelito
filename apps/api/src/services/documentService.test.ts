import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, type TestDbHandle } from '../test/createTestDb.js';
import { createUser } from '../repositories/userRepository.js';
import {
  createDocument,
  deleteDocument,
  getDocument,
  listDocuments,
  updateDocument,
  NotFoundError,
} from './documentService.js';
import { getDocumentByIdAndUserId } from '../repositories/documentRepository.js';
import { DEFAULT_DOCUMENT_TITLE, EMPTY_PROSEMIRROR_DOC } from '../types/index.js';

const SAMPLE_CONTENT = JSON.stringify({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hi' }] }],
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function makeUser(handle: TestDbHandle, email: string): number {
  return createUser(handle.db, { email, passwordHash: 'hash' }).id;
}

describe('documentService', () => {
  let handle: TestDbHandle;

  beforeEach(() => {
    handle = createTestDb();
  });

  afterEach(() => {
    handle.sqlite.close();
  });

  describe('createDocument', () => {
    it('defaults title and content to the empty ProseMirror doc', () => {
      const userId = makeUser(handle, 'u1@example.com');
      const doc = createDocument(userId);

      expect(doc.title).toBe(DEFAULT_DOCUMENT_TITLE);
      expect(doc.content).toBe(EMPTY_PROSEMIRROR_DOC);
      expect(doc.userId).toBe(userId);
      expect(doc.id).toBeTypeOf('string');
      expect(doc.id).toMatch(UUID_RE);
      expect(doc.createdAt).toBeInstanceOf(Date);
      expect(doc.updatedAt).toBeInstanceOf(Date);
    });

    it('honours caller-provided title and content', () => {
      const userId = makeUser(handle, 'u2@example.com');
      const doc = createDocument(userId, {
        title: 'My Doc',
        content: SAMPLE_CONTENT,
      });
      expect(doc.title).toBe('My Doc');
      expect(doc.content).toBe(SAMPLE_CONTENT);
    });
  });

  describe('listDocuments', () => {
    it('returns an empty array for a user with no documents', () => {
      const userId = makeUser(handle, 'lonely@example.com');
      expect(listDocuments(userId)).toEqual([]);
    });

    it("returns only the requesting user's documents, newest updated first", async () => {
      const a = makeUser(handle, 'a@example.com');
      const b = makeUser(handle, 'b@example.com');
      const older = createDocument(a, { title: 'older', content: EMPTY_PROSEMIRROR_DOC });
      // updatedAt defaults to creation time; wait long enough that the next
      // document has a strictly greater timestamp.
      await new Promise((r) => setTimeout(r, 1100));
      const newer = createDocument(a, { title: 'newer', content: EMPTY_PROSEMIRROR_DOC });
      createDocument(b, { title: 'other-user', content: EMPTY_PROSEMIRROR_DOC });

      const list = listDocuments(a);
      expect(list).toHaveLength(2);
      expect(list.map((d) => d.id)).toEqual([newer.id, older.id]);
      expect(list.every((d) => d.userId === a)).toBe(true);
    });

    it('orders by updatedAt after edits, not creation', async () => {
      const userId = makeUser(handle, 'edit@example.com');
      const first = createDocument(userId, { title: 'first' });
      await new Promise((r) => setTimeout(r, 1100));
      const second = createDocument(userId, { title: 'second' });
      await new Promise((r) => setTimeout(r, 1100));
      // Touch `first` so its updatedAt becomes the most recent.
      updateDocument(userId, first.id, { title: 'first-edited' });

      const list = listDocuments(userId);
      expect(list.map((d) => d.id)).toEqual([first.id, second.id]);
    });
  });

  describe('getDocument', () => {
    it('returns the document for the owning user', () => {
      const userId = makeUser(handle, 'owner@example.com');
      const doc = createDocument(userId);
      expect(getDocument(userId, doc.id)).toEqual(doc);
    });

    it('throws NotFoundError when the id does not exist', () => {
      const userId = makeUser(handle, 'noexist@example.com');
      expect(() => getDocument(userId, '00000000-0000-0000-0000-000000000000')).toThrow(
        NotFoundError,
      );
    });

    it('throws NotFoundError when the document belongs to another user', () => {
      const a = makeUser(handle, 'a@example.com');
      const b = makeUser(handle, 'b@example.com');
      const doc = createDocument(a);
      // Confirm the document really exists for user A — the NotFoundError must
      // come from the ownership check, not from a phantom row.
      expect(getDocumentByIdAndUserId(handle.db, doc.id, a)).toBeDefined();
      expect(() => getDocument(b, doc.id)).toThrow(NotFoundError);
    });
  });

  describe('updateDocument', () => {
    it('updates both title and content together', () => {
      const userId = makeUser(handle, 'both@example.com');
      const doc = createDocument(userId);
      const updated = updateDocument(userId, doc.id, {
        title: 'New',
        content: SAMPLE_CONTENT,
      });
      expect(updated.title).toBe('New');
      expect(updated.content).toBe(SAMPLE_CONTENT);
      expect(updated.id).toBe(doc.id);
    });

    it('updates only the title when content is omitted', () => {
      const userId = makeUser(handle, 'titleonly@example.com');
      const doc = createDocument(userId);
      const updated = updateDocument(userId, doc.id, { title: 'Just Title' });
      expect(updated.title).toBe('Just Title');
      expect(updated.content).toBe(doc.content);
    });

    it('updates only the content when title is omitted', () => {
      const userId = makeUser(handle, 'contentonly@example.com');
      const doc = createDocument(userId);
      const updated = updateDocument(userId, doc.id, { content: SAMPLE_CONTENT });
      expect(updated.title).toBe(doc.title);
      expect(updated.content).toBe(SAMPLE_CONTENT);
    });

    it("throws NotFoundError for another user's document", () => {
      const a = makeUser(handle, 'a@example.com');
      const b = makeUser(handle, 'b@example.com');
      const doc = createDocument(a);
      expect(() => updateDocument(b, doc.id, { title: 'hacked' })).toThrow(NotFoundError);
      // Verify the original doc was untouched.
      expect(getDocument(a, doc.id).title).toBe(doc.title);
    });

    it('throws NotFoundError for a non-existent id', () => {
      const userId = makeUser(handle, 'nope@example.com');
      expect(() =>
        updateDocument(userId, '00000000-0000-0000-0000-000000000000', { title: 'x' }),
      ).toThrow(NotFoundError);
    });
  });

  describe('deleteDocument', () => {
    it('removes the document for the owner', () => {
      const userId = makeUser(handle, 'rm@example.com');
      const doc = createDocument(userId);
      deleteDocument(userId, doc.id);
      expect(getDocumentByIdAndUserId(handle.db, doc.id, userId)).toBeUndefined();
    });

    it("throws NotFoundError for another user's document and leaves it intact", () => {
      const a = makeUser(handle, 'a@example.com');
      const b = makeUser(handle, 'b@example.com');
      const doc = createDocument(a);
      expect(() => deleteDocument(b, doc.id)).toThrow(NotFoundError);
      expect(getDocument(a, doc.id)).toBeDefined();
    });

    it('throws NotFoundError for a non-existent id', () => {
      const userId = makeUser(handle, 'phantom@example.com');
      expect(() => deleteDocument(userId, '00000000-0000-0000-0000-000000000000')).toThrow(
        NotFoundError,
      );
    });
  });
});
