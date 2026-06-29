import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { db } from '../db/index.js';
import { createOrUpdateSubscription } from '../repositories/subscriptionRepository.js';
import { createTestDb, type TestDbHandle } from '../test/createTestDb.js';

const agent = () => request.agent(app);

const SAMPLE_CONTENT = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hello' }] }],
};

const NON_EXISTENT_DOC_ID = '550e8400-e29b-41d4-a716-446655440000';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Registers a user via the auth endpoint (so a session cookie is set on the
 * agent) and grants them an active subscription so the requireSubscription
 * middleware lets the subsequent document requests through.
 */
async function registerAndSubscribe(
  email: string,
  password = 'password123',
): Promise<{ id: number; authed: ReturnType<typeof agent> }> {
  const authed = agent();
  const res = await authed.post('/api/auth/register').send({ email, password });
  expect(res.status).toBe(201);
  const userId = res.body.user.id as number;
  createOrUpdateSubscription(db, { userId, status: 'active' });
  return { id: userId, authed };
}

describe('documents routes', () => {
  let handle: TestDbHandle;

  beforeEach(() => {
    handle = createTestDb();
  });

  afterEach(() => {
    handle.sqlite.close();
  });

  // -----------------------------------------------------------------------
  // GET /api/documents
  // -----------------------------------------------------------------------
  describe('GET /api/documents', () => {
    it('returns 401 when not authenticated', async () => {
      const res = await request(app).get('/api/documents');
      expect(res.status).toBe(401);
    });

    it('returns 403 when authenticated but not subscribed', async () => {
      const anon = agent();
      await anon
        .post('/api/auth/register')
        .send({ email: 'nosub@example.com', password: 'password123' });
      const res = await anon.get('/api/documents');
      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(/subscription/i);
    });

    it('returns an empty list for a freshly-subscribed user', async () => {
      const { authed } = await registerAndSubscribe('fresh@example.com');
      const res = await authed.get('/api/documents');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ documents: [] });
    });

    it("returns the user's documents sorted by updatedAt desc", async () => {
      const { authed } = await registerAndSubscribe('list@example.com');
      const a = await authed.post('/api/documents').send({});
      expect(a.status).toBe(201);
      // Force a gap so updatedAt advances on the next insert.
      await new Promise((r) => setTimeout(r, 1100));
      const b = await authed.post('/api/documents').send({});
      expect(b.status).toBe(201);

      const res = await authed.get('/api/documents');
      expect(res.status).toBe(200);
      const docs = res.body.documents as Array<{ id: string; title: string }>;
      expect(docs).toHaveLength(2);
      expect(docs[0]?.id).toBe(b.body.document.id);
      expect(docs[1]?.id).toBe(a.body.document.id);
    });

    it('does not leak documents from another user', async () => {
      const a = await registerAndSubscribe('alice@example.com');
      const b = await registerAndSubscribe('bob@example.com');
      const created = await a.authed.post('/api/documents').send({});
      expect(created.status).toBe(201);

      const listRes = await b.authed.get('/api/documents');
      expect(listRes.status).toBe(200);
      expect(listRes.body.documents).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // POST /api/documents
  // -----------------------------------------------------------------------
  describe('POST /api/documents', () => {
    it('returns 401 when not authenticated', async () => {
      const res = await request(app).post('/api/documents').send({});
      expect(res.status).toBe(401);
    });

    it('returns 403 when authenticated but not subscribed', async () => {
      const anon = agent();
      await anon
        .post('/api/auth/register')
        .send({ email: 'nosub-create@example.com', password: 'password123' });
      const res = await anon.post('/api/documents').send({});
      expect(res.status).toBe(403);
    });

    it('creates a document with default title and empty ProseMirror content', async () => {
      const { authed, id } = await registerAndSubscribe('default@example.com');
      const res = await authed.post('/api/documents').send({});
      expect(res.status).toBe(201);
      expect(res.body.document).toMatchObject({
        title: 'Untitled document',
        content: '{"type":"doc","content":[]}',
        userId: id,
      });
      expect(res.body.document.id).toMatch(UUID_RE);
      expect(res.body.document.createdAt).toBeTypeOf('string');
      expect(res.body.document.updatedAt).toBeTypeOf('string');
    });

    it('creates a document with custom title and content', async () => {
      const { authed } = await registerAndSubscribe('custom@example.com');
      const res = await authed
        .post('/api/documents')
        .send({ title: 'My Doc', content: SAMPLE_CONTENT });
      expect(res.status).toBe(201);
      expect(res.body.document.title).toBe('My Doc');
      expect(JSON.parse(res.body.document.content)).toEqual(SAMPLE_CONTENT);
    });

    it('trims whitespace from the title', async () => {
      const { authed } = await registerAndSubscribe('trim@example.com');
      const res = await authed.post('/api/documents').send({ title: '   Padded   ' });
      expect(res.status).toBe(201);
      expect(res.body.document.title).toBe('Padded');
    });

    it('returns 400 when body is not a JSON object', async () => {
      const { authed } = await registerAndSubscribe('bad-body@example.com');
      // Send a JSON value that parses to a string — a non-object payload should
      // be rejected by the route validator (the existing array test covers the
      // JSON-object path; this one confirms non-object payloads are rejected
      // before a document is created).
      const res = await authed
        .post('/api/documents')
        .set('Content-Type', 'application/json')
        .send('"just a string"');
      expect(res.status).toBe(400);
    });

    it('returns 400 when body is an array', async () => {
      const { authed } = await registerAndSubscribe('array@example.com');
      const res = await authed.post('/api/documents').send([]);
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/object/i);
    });

    it('returns 400 when title is not a string', async () => {
      const { authed } = await registerAndSubscribe('badtitle@example.com');
      const res = await authed.post('/api/documents').send({ title: 123 });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/title/i);
    });

    it('returns 400 when title is an empty string after trimming', async () => {
      const { authed } = await registerAndSubscribe('blank@example.com');
      const res = await authed.post('/api/documents').send({ title: '   ' });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/title/i);
    });

    it('returns 400 when content is not an object', async () => {
      const { authed } = await registerAndSubscribe('badcontent@example.com');
      const res = await authed.post('/api/documents').send({ content: 'not an object' });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/content/i);
    });

    it('returns 400 when content is missing the top-level type field', async () => {
      const { authed } = await registerAndSubscribe('badshape@example.com');
      const res = await authed.post('/api/documents').send({ content: { content: [] } });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/doc/i);
    });
  });

  // -----------------------------------------------------------------------
  // GET /api/documents/:id
  // -----------------------------------------------------------------------
  describe('GET /api/documents/:id', () => {
    it('returns 401 when not authenticated', async () => {
      const res = await request(app).get('/api/documents/1');
      expect(res.status).toBe(401);
    });

    it('returns 403 when authenticated but not subscribed', async () => {
      const anon = agent();
      await anon
        .post('/api/auth/register')
        .send({ email: 'nosub-get@example.com', password: 'password123' });
      const res = await anon.get('/api/documents/1');
      expect(res.status).toBe(403);
    });

    it('returns 400 for a non-UUID id', async () => {
      const { authed } = await registerAndSubscribe('bad-id@example.com');
      const res = await authed.get('/api/documents/not-a-uuid');
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/invalid/i);
    });

    it('returns 404 for a non-existent document', async () => {
      const { authed } = await registerAndSubscribe('missing@example.com');
      const res = await authed.get(`/api/documents/${NON_EXISTENT_DOC_ID}`);
      expect(res.status).toBe(404);
    });

    it('returns 404 when the document belongs to another user', async () => {
      const a = await registerAndSubscribe('owner@example.com');
      const b = await registerAndSubscribe('thief@example.com');
      const created = await a.authed.post('/api/documents').send({});
      const docId = created.body.document.id as string;

      const res = await b.authed.get(`/api/documents/${docId}`);
      expect(res.status).toBe(404);
    });

    it('returns the document for the owner', async () => {
      const { authed } = await registerAndSubscribe('getter@example.com');
      const created = await authed.post('/api/documents').send({});
      const docId = created.body.document.id as string;

      const res = await authed.get(`/api/documents/${docId}`);
      expect(res.status).toBe(200);
      expect(res.body.document.id).toBe(docId);
      expect(res.body.document.title).toBe('Untitled document');
    });
  });

  // -----------------------------------------------------------------------
  // PATCH /api/documents/:id
  // -----------------------------------------------------------------------
  describe('PATCH /api/documents/:id', () => {
    it('returns 401 when not authenticated', async () => {
      const res = await request(app).patch('/api/documents/1').send({});
      expect(res.status).toBe(401);
    });

    it('returns 403 when authenticated but not subscribed', async () => {
      const anon = agent();
      await anon
        .post('/api/auth/register')
        .send({ email: 'nosub-patch@example.com', password: 'password123' });
      const res = await anon.patch('/api/documents/1').send({});
      expect(res.status).toBe(403);
    });

    it('returns 400 for a non-UUID id', async () => {
      const { authed } = await registerAndSubscribe('patch-bad-id@example.com');
      const res = await authed.patch('/api/documents/not-a-uuid').send({ title: 'x' });
      expect(res.status).toBe(400);
    });

    it('returns 400 when neither title nor content is provided', async () => {
      const { authed } = await registerAndSubscribe('patch-empty@example.com');
      const created = await authed.post('/api/documents').send({});
      const docId = created.body.document.id as string;
      const res = await authed.patch(`/api/documents/${docId}`).send({});
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/at least one/i);
    });

    it('returns 400 when title is not a string', async () => {
      const { authed } = await registerAndSubscribe('patch-badtitle@example.com');
      const created = await authed.post('/api/documents').send({});
      const docId = created.body.document.id as string;
      const res = await authed.patch(`/api/documents/${docId}`).send({ title: 42 });
      expect(res.status).toBe(400);
    });

    it('returns 400 when content is malformed', async () => {
      const { authed } = await registerAndSubscribe('patch-badcontent@example.com');
      const created = await authed.post('/api/documents').send({});
      const docId = created.body.document.id as string;
      const res = await authed.patch(`/api/documents/${docId}`).send({ content: 'just a string' });
      expect(res.status).toBe(400);
    });

    it('returns 404 for a non-existent document', async () => {
      const { authed } = await registerAndSubscribe('patch-missing@example.com');
      const res = await authed.patch(`/api/documents/${NON_EXISTENT_DOC_ID}`).send({ title: 'x' });
      expect(res.status).toBe(404);
    });

    it("returns 404 when patching another user's document and leaves it intact", async () => {
      const a = await registerAndSubscribe('patch-owner@example.com');
      const b = await registerAndSubscribe('patch-intruder@example.com');
      const created = await a.authed.post('/api/documents').send({});
      const docId = created.body.document.id as string;

      const res = await b.authed.patch(`/api/documents/${docId}`).send({ title: 'pwned' });
      expect(res.status).toBe(404);

      // Verify the original document was not modified.
      const ownerGet = await a.authed.get(`/api/documents/${docId}`);
      expect(ownerGet.body.document.title).toBe('Untitled document');
    });

    it('updates only the title when content is omitted', async () => {
      const { authed } = await registerAndSubscribe('patch-title@example.com');
      const created = await authed.post('/api/documents').send({});
      const docId = created.body.document.id as string;
      const res = await authed.patch(`/api/documents/${docId}`).send({ title: 'Renamed' });
      expect(res.status).toBe(200);
      expect(res.body.document.title).toBe('Renamed');
      expect(res.body.document.content).toBe(created.body.document.content);
    });

    it('updates only the content when title is omitted', async () => {
      const { authed } = await registerAndSubscribe('patch-content@example.com');
      const created = await authed.post('/api/documents').send({});
      const docId = created.body.document.id as string;
      const res = await authed.patch(`/api/documents/${docId}`).send({ content: SAMPLE_CONTENT });
      expect(res.status).toBe(200);
      expect(res.body.document.title).toBe('Untitled document');
      expect(JSON.parse(res.body.document.content)).toEqual(SAMPLE_CONTENT);
    });

    it('updates both title and content together', async () => {
      const { authed } = await registerAndSubscribe('patch-both@example.com');
      const created = await authed.post('/api/documents').send({});
      const docId = created.body.document.id as string;
      const res = await authed
        .patch(`/api/documents/${docId}`)
        .send({ title: 'Renamed', content: SAMPLE_CONTENT });
      expect(res.status).toBe(200);
      expect(res.body.document.title).toBe('Renamed');
      expect(JSON.parse(res.body.document.content)).toEqual(SAMPLE_CONTENT);
    });
  });

  // -----------------------------------------------------------------------
  // DELETE /api/documents/:id
  // -----------------------------------------------------------------------
  describe('DELETE /api/documents/:id', () => {
    it('returns 401 when not authenticated', async () => {
      const res = await request(app).delete('/api/documents/1');
      expect(res.status).toBe(401);
    });

    it('returns 403 when authenticated but not subscribed', async () => {
      const anon = agent();
      await anon
        .post('/api/auth/register')
        .send({ email: 'nosub-delete@example.com', password: 'password123' });
      const res = await anon.delete('/api/documents/1');
      expect(res.status).toBe(403);
    });

    it('returns 400 for a non-UUID id', async () => {
      const { authed } = await registerAndSubscribe('delete-bad-id@example.com');
      const res = await authed.delete('/api/documents/not-a-uuid');
      expect(res.status).toBe(400);
    });

    it('returns 404 for a non-existent document', async () => {
      const { authed } = await registerAndSubscribe('delete-missing@example.com');
      const res = await authed.delete(`/api/documents/${NON_EXISTENT_DOC_ID}`);
      expect(res.status).toBe(404);
    });

    it("returns 404 when deleting another user's document and leaves it intact", async () => {
      const a = await registerAndSubscribe('delete-owner@example.com');
      const b = await registerAndSubscribe('delete-intruder@example.com');
      const created = await a.authed.post('/api/documents').send({});
      const docId = created.body.document.id as string;

      const res = await b.authed.delete(`/api/documents/${docId}`);
      expect(res.status).toBe(404);

      const ownerGet = await a.authed.get(`/api/documents/${docId}`);
      expect(ownerGet.status).toBe(200);
    });

    it('deletes the document for the owner and returns 204', async () => {
      const { authed } = await registerAndSubscribe('delete-owner2@example.com');
      const created = await authed.post('/api/documents').send({});
      const docId = created.body.document.id as string;

      const res = await authed.delete(`/api/documents/${docId}`);
      expect(res.status).toBe(204);

      const after = await authed.get(`/api/documents/${docId}`);
      expect(after.status).toBe(404);

      const list = await authed.get('/api/documents');
      expect(list.body.documents).toEqual([]);
    });
  });
});
