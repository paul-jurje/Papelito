import { Router, type Request, type Response, type NextFunction } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireSubscription } from '../middleware/requireSubscription.js';
import {
  createDocument,
  deleteDocument,
  getDocument,
  listDocuments,
  NotFoundError,
  updateDocument,
} from '../services/documentService.js';
import type { Document } from '../types/index.js';
import type {
  CreateDocumentRequest,
  DocumentResponse,
  UpdateDocumentRequest,
} from '../types/document.js';

export const documentsRouter = Router();

const MAX_TITLE_LENGTH = 200;

function toDocumentResponse(doc: Document): DocumentResponse {
  return {
    id: doc.id,
    userId: doc.userId,
    title: doc.title,
    content: doc.content,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

function parseDocumentId(req: Request): number | null {
  const raw = req.params.id;
  if (typeof raw !== 'string' || !/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

interface ValidationResult {
  ok: boolean;
  message?: string;
  data?: { title?: string; content?: string };
}

/**
 * Validates a write-request body and returns a serialized ProseMirror JSON
 * string for `content`. The same shape is used for create and update — both
 * treat every field as optional.
 */
function validateWriteBody(body: unknown): ValidationResult {
  if (body === undefined || body === null) return { ok: true, data: {} };
  if (typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, message: 'Request body must be a JSON object' };
  }
  const { title, content } = body as CreateDocumentRequest;

  const data: { title?: string; content?: string } = {};

  if (title !== undefined) {
    if (typeof title !== 'string') {
      return { ok: false, message: 'title must be a string' };
    }
    const trimmed = title.trim();
    if (trimmed.length === 0) {
      return { ok: false, message: 'title must not be empty' };
    }
    if (trimmed.length > MAX_TITLE_LENGTH) {
      return {
        ok: false,
        message: `title must be ${MAX_TITLE_LENGTH} characters or fewer`,
      };
    }
    data.title = trimmed;
  }

  if (content !== undefined) {
    if (content === null || typeof content !== 'object' || Array.isArray(content)) {
      return { ok: false, message: 'content must be a JSON object' };
    }
    const obj = content as Record<string, unknown>;
    if (obj.type !== 'doc') {
      return { ok: false, message: "content must be a ProseMirror doc (top-level type 'doc')" };
    }
    if (obj.content !== undefined && !Array.isArray(obj.content)) {
      return { ok: false, message: "content.content must be an array when present" };
    }
    try {
      data.content = JSON.stringify(obj);
    } catch {
      return { ok: false, message: 'content is not JSON-serializable' };
    }
  }

  return { ok: true, data };
}

documentsRouter.use(requireAuth, requireSubscription);

// GET /api/documents — list the caller's documents, newest updated first.
documentsRouter.get('/', (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      // requireAuth already responded; defensive guard for the type system.
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }
    const docs = listDocuments(req.user.id);
    res.json({ documents: docs.map(toDocumentResponse) });
  } catch (err) {
    next(err);
  }
});

// POST /api/documents — create a new document for the caller.
documentsRouter.post('/', (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }
    const validation = validateWriteBody(req.body);
    if (!validation.ok || !validation.data) {
      res.status(400).json({ message: validation.message ?? 'Invalid request body' });
      return;
    }
    const doc = createDocument(req.user.id, validation.data);
    res.status(201).json({ document: toDocumentResponse(doc) });
  } catch (err) {
    next(err);
  }
});

// GET /api/documents/:id — fetch a single document owned by the caller.
documentsRouter.get('/:id', (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }
    const id = parseDocumentId(req);
    if (id === null) {
      res.status(400).json({ message: 'Invalid document id' });
      return;
    }
    try {
      const doc = getDocument(req.user.id, id);
      res.json({ document: toDocumentResponse(doc) });
    } catch (err) {
      if (err instanceof NotFoundError) {
        res.status(404).json({ message: 'Document not found' });
        return;
      }
      throw err;
    }
  } catch (err) {
    next(err);
  }
});

// PATCH /api/documents/:id — update title and/or content of a document.
documentsRouter.patch('/:id', (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }
    const id = parseDocumentId(req);
    if (id === null) {
      res.status(400).json({ message: 'Invalid document id' });
      return;
    }
    const validation = validateWriteBody(req.body);
    if (!validation.ok || !validation.data) {
      res.status(400).json({ message: validation.message ?? 'Invalid request body' });
      return;
    }
    if (
      validation.data.title === undefined &&
      validation.data.content === undefined
    ) {
      res.status(400).json({ message: 'At least one of title or content must be provided' });
      return;
    }
    try {
      const doc = updateDocument(req.user.id, id, validation.data);
      res.json({ document: toDocumentResponse(doc) });
    } catch (err) {
      if (err instanceof NotFoundError) {
        res.status(404).json({ message: 'Document not found' });
        return;
      }
      throw err;
    }
  } catch (err) {
    next(err);
  }
});

// DELETE /api/documents/:id — delete a document owned by the caller.
documentsRouter.delete('/:id', (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }
    const id = parseDocumentId(req);
    if (id === null) {
      res.status(400).json({ message: 'Invalid document id' });
      return;
    }
    try {
      deleteDocument(req.user.id, id);
      res.status(204).end();
    } catch (err) {
      if (err instanceof NotFoundError) {
        res.status(404).json({ message: 'Document not found' });
        return;
      }
      throw err;
    }
  } catch (err) {
    next(err);
  }
});
