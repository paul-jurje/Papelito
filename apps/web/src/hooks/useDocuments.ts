import { useCallback, useEffect, useRef, useState } from 'react';
import type { JSONContent } from '@tiptap/core';
import { ApiError, api } from '../lib/api';

/**
 * Lightweight client-side representation of a document. Matches the
 * `DocumentResponse` shape from `apps/api/src/types/document.ts` but with
 * `content` parsed from a JSON string into a ProseMirror `JSONContent`
 * object so the editor can consume it directly.
 */
export interface DocumentSummary {
  id: string;
  title: string;
  /** ISO 8601 string. */
  updatedAt: string;
  /** ISO 8601 string. */
  createdAt: string;
}

export interface DocumentDetail extends DocumentSummary {
  content: JSONContent;
}

export type SaveStatus = 'idle' | 'unsaved' | 'saving' | 'saved' | 'error';

const EMPTY_DOC: JSONContent = { type: 'doc', content: [] };

function parseContent(raw: unknown): JSONContent {
  if (typeof raw !== 'string') return EMPTY_DOC;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      parsed !== null &&
      typeof parsed === 'object' &&
      (parsed as { type?: unknown }).type === 'doc'
    ) {
      return parsed as JSONContent;
    }
  } catch {
    // fall through
  }
  return EMPTY_DOC;
}

function toSummary(doc: {
  id: string;
  title: string;
  updatedAt: string;
  createdAt: string;
}): DocumentSummary {
  return {
    id: doc.id,
    title: doc.title,
    updatedAt: doc.updatedAt,
    createdAt: doc.createdAt,
  };
}

interface DocumentsListResponse {
  documents: Array<{
    id: string;
    title: string;
    content: string;
    updatedAt: string;
    createdAt: string;
  }>;
}

interface DocumentResponse {
  document: {
    id: string;
    title: string;
    content: string;
    updatedAt: string;
    createdAt: string;
  };
}

export interface UseDocumentsResult {
  documents: DocumentSummary[];
  isLoading: boolean;
  error: string | null;

  createDocument: () => Promise<DocumentDetail | null>;
  renameDocument: (id: string, title: string) => Promise<DocumentDetail | null>;
  deleteDocument: (id: string) => Promise<boolean>;
  saveDocument: (id: string, content: JSONContent) => Promise<DocumentDetail | null>;

  loadDocument: (id: string) => Promise<DocumentDetail | null>;
  selectedDocument: DocumentDetail | null;
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;

  refresh: () => Promise<void>;
}

/**
 * React hook that owns the document list + the currently-selected document
 * for the workspace. Handles loading/error states for the list and exposes
 * imperative functions for create/rename/delete/save.
 *
 * The selected document is loaded lazily by id; saveDocument can be called
 * without first loading (it just PATCHes the content).
 */
export function useDocuments(): UseDocumentsResult {
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedDocument, setSelectedDocument] = useState<DocumentDetail | null>(null);

  // Track in-flight requests so concurrent calls don't trample each other.
  const inflightRef = useRef<Set<string>>(new Set());

  const fetchList = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await api<DocumentsListResponse>('/api/documents');
      setDocuments(data.documents.map(toSummary));
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : 'Failed to load documents. Please try again.';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchList();
  }, [fetchList]);

  const createDocument = useCallback(async (): Promise<DocumentDetail | null> => {
    if (inflightRef.current.has('create')) return null;
    inflightRef.current.add('create');
    try {
      const data = await api<DocumentResponse>('/api/documents', {
        method: 'POST',
        body: {},
      });
      const detail: DocumentDetail = {
        id: data.document.id,
        title: data.document.title,
        updatedAt: data.document.updatedAt,
        createdAt: data.document.createdAt,
        content: parseContent(data.document.content),
      };
      setDocuments((prev) => [toSummary(data.document), ...prev]);
      setSelectedId(detail.id);
      setSelectedDocument(detail);
      return detail;
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : 'Failed to create document. Please try again.';
      setError(message);
      return null;
    } finally {
      inflightRef.current.delete('create');
    }
  }, []);

  const renameDocument = useCallback(
    async (id: string, title: string): Promise<DocumentDetail | null> => {
      const key = `rename:${id}`;
      if (inflightRef.current.has(key)) return null;
      inflightRef.current.add(key);
      try {
        const data = await api<DocumentResponse>(`/api/documents/${id}`, {
          method: 'PATCH',
          body: { title },
        });
        setDocuments((prev) =>
          prev.map((d) =>
            d.id === id
              ? {
                  ...d,
                  title: data.document.title,
                  updatedAt: data.document.updatedAt,
                }
              : d,
          ),
        );
        setSelectedDocument((prev) =>
          prev && prev.id === id
            ? {
                ...prev,
                title: data.document.title,
                updatedAt: data.document.updatedAt,
              }
            : prev,
        );
        return {
          id: data.document.id,
          title: data.document.title,
          updatedAt: data.document.updatedAt,
          createdAt: data.document.createdAt,
          content: parseContent(data.document.content),
        };
      } catch (err) {
        const message = err instanceof ApiError ? err.message : 'Failed to rename document.';
        setError(message);
        return null;
      } finally {
        inflightRef.current.delete(key);
      }
    },
    [],
  );

  const deleteDocument = useCallback(
    async (id: string): Promise<boolean> => {
      const key = `delete:${id}`;
      if (inflightRef.current.has(key)) return false;
      inflightRef.current.add(key);
      try {
        await api(`/api/documents/${id}`, { method: 'DELETE' });
        setDocuments((prev) => prev.filter((d) => d.id !== id));
        if (selectedId === id) {
          setSelectedId(null);
          setSelectedDocument(null);
        }
        return true;
      } catch (err) {
        const message = err instanceof ApiError ? err.message : 'Failed to delete document.';
        setError(message);
        return false;
      } finally {
        inflightRef.current.delete(key);
      }
    },
    [selectedId],
  );

  const saveDocument = useCallback(
    async (id: string, content: JSONContent): Promise<DocumentDetail | null> => {
      const key = `save:${id}`;
      if (inflightRef.current.has(key)) return null;
      inflightRef.current.add(key);
      try {
        const data = await api<DocumentResponse>(`/api/documents/${id}`, {
          method: 'PATCH',
          body: { content },
        });
        setDocuments((prev) =>
          prev.map((d) =>
            d.id === id
              ? {
                  ...d,
                  title: data.document.title,
                  updatedAt: data.document.updatedAt,
                }
              : d,
          ),
        );
        setSelectedDocument((prev) =>
          prev && prev.id === id
            ? {
                ...prev,
                content: parseContent(data.document.content),
                updatedAt: data.document.updatedAt,
              }
            : prev,
        );
        return {
          id: data.document.id,
          title: data.document.title,
          updatedAt: data.document.updatedAt,
          createdAt: data.document.createdAt,
          content: parseContent(data.document.content),
        };
      } catch (err) {
        const message = err instanceof ApiError ? err.message : 'Failed to save document.';
        setError(message);
        return null;
      } finally {
        inflightRef.current.delete(key);
      }
    },
    [],
  );

  const loadDocument = useCallback(async (id: string): Promise<DocumentDetail | null> => {
    const key = `load:${id}`;
    if (inflightRef.current.has(key)) return null;
    inflightRef.current.add(key);
    try {
      const data = await api<DocumentResponse>(`/api/documents/${id}`);
      const detail: DocumentDetail = {
        id: data.document.id,
        title: data.document.title,
        updatedAt: data.document.updatedAt,
        createdAt: data.document.createdAt,
        content: parseContent(data.document.content),
      };
      setSelectedDocument(detail);
      return detail;
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Failed to load document.';
      setError(message);
      return null;
    } finally {
      inflightRef.current.delete(key);
    }
  }, []);

  return {
    documents,
    isLoading,
    error,
    createDocument,
    renameDocument,
    deleteDocument,
    saveDocument,
    loadDocument,
    selectedDocument,
    selectedId,
    setSelectedId,
    refresh: fetchList,
  };
}

export default useDocuments;
