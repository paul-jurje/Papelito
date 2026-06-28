import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useDocuments } from './useDocuments';

interface FetchCall {
  url: string;
  init: RequestInit;
}

const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function emptyResponse(status: number): Response {
  return new Response(null, { status });
}

interface Route {
  match: (url: string, init?: RequestInit) => boolean;
  status: number;
  body: unknown;
  /** When true, respond with 204-style empty body (no JSON). */
  empty?: boolean;
  /** Capture the call (last match wins). */
  capture?: FetchCall;
}

const routes: Route[] = [];

function route(
  match: (url: string, init?: RequestInit) => boolean,
): Route {
  const r: Route = { match, status: 200, body: {} };
  routes.push(r);
  return r;
}

function reset(): void {
  routes.length = 0;
  fetchMock.mockReset();
}

beforeEach(() => {
  reset();
  fetchMock.mockImplementation(async (input, init) => {
    const url = typeof input === 'string' ? input : input.toString();
    const initCopy = init ?? {};
    for (const r of routes) {
      if (r.match(url, initCopy)) {
        if (r.capture) {
          r.capture.url = url;
          r.capture.init = initCopy;
        }
        if (r.empty) return emptyResponse(r.status);
        return jsonResponse(r.status, r.body);
      }
    }
    throw new Error(`Unmocked fetch: ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const sampleList = {
  documents: [
    {
      id: 1,
      title: 'First draft',
      content: '{"type":"doc","content":[]}',
      updatedAt: '2024-01-02T00:00:00.000Z',
      createdAt: '2024-01-01T00:00:00.000Z',
    },
    {
      id: 2,
      title: 'Second draft',
      content: '{"type":"doc","content":[{"type":"paragraph"}]}',
      updatedAt: '2024-01-03T00:00:00.000Z',
      createdAt: '2024-01-02T00:00:00.000Z',
    },
  ],
};

const newDocResponse = {
  document: {
    id: 99,
    title: 'Untitled document',
    content: '{"type":"doc","content":[]}',
    updatedAt: '2024-02-01T00:00:00.000Z',
    createdAt: '2024-02-01T00:00:00.000Z',
  },
};

const renameDocResponse = {
  document: {
    id: 1,
    title: 'Renamed draft',
    content: '{"type":"doc","content":[]}',
    updatedAt: '2024-02-02T00:00:00.000Z',
    createdAt: '2024-01-01T00:00:00.000Z',
  },
};

describe('useDocuments', () => {
  it('loads the document list on mount', async () => {
    route((url, init) => url.endsWith('/api/documents') && (init?.method ?? 'GET') === 'GET')
      .body = sampleList;

    const { result } = renderHook(() => useDocuments());

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.documents).toHaveLength(2);
    expect(result.current.documents[0]?.id).toBe(1);
    expect(result.current.error).toBeNull();
  });

  it('surfaces a server error message when the list fails to load', async () => {
    route((url, init) => url.endsWith('/api/documents') && (init?.method ?? 'GET') === 'GET')
      .status = 500;
    (routes[routes.length - 1] as Route).body = { message: 'boom' };

    const { result } = renderHook(() => useDocuments());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.documents).toHaveLength(0);
    expect(result.current.error).toBe('boom');
  });

  it('creates a document, adds it to the list, and selects it', async () => {
    route((url, init) => url.endsWith('/api/documents') && (init?.method ?? 'GET') === 'GET')
      .body = sampleList;
    const createCapture: Route['capture'] = { url: '', init: {} };
    route(
      (url, init) =>
        url.endsWith('/api/documents') && (init?.method ?? 'GET') === 'POST',
    ).body = newDocResponse;
    (routes[routes.length - 1] as Route).capture = createCapture;

    const { result } = renderHook(() => useDocuments());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    let created: Awaited<ReturnType<typeof result.current.createDocument>> | undefined;
    await act(async () => {
      created = await result.current.createDocument();
    });

    expect(created?.id).toBe(99);
    expect(result.current.documents).toHaveLength(3);
    expect(result.current.documents.find((d) => d.id === 99)?.title).toBe(
      'Untitled document',
    );
    expect(result.current.selectedId).toBe(99);
    expect(result.current.selectedDocument?.id).toBe(99);

    expect(createCapture?.url).toBe('/api/documents');
    expect(createCapture?.init.method).toBe('POST');
    expect(createCapture?.init.credentials).toBe('include');
    expect(createCapture?.init.body).toBe(JSON.stringify({}));
  });

  it('renames a document and updates the list', async () => {
    route((url, init) => url.endsWith('/api/documents') && (init?.method ?? 'GET') === 'GET')
      .body = sampleList;
    const renameCapture: Route['capture'] = { url: '', init: {} };
    const renameRoute = route(
      (url, init) =>
        url.endsWith('/api/documents/1') && (init?.method ?? 'GET') === 'PATCH',
    );
    renameRoute.body = renameDocResponse;
    renameRoute.capture = renameCapture;

    const { result } = renderHook(() => useDocuments());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    let renamed: Awaited<ReturnType<typeof result.current.renameDocument>> | undefined;
    await act(async () => {
      renamed = await result.current.renameDocument(1, 'Renamed draft');
    });

    expect(renamed?.title).toBe('Renamed draft');
    const updated = result.current.documents.find((d) => d.id === 1);
    expect(updated?.title).toBe('Renamed draft');
    expect(updated?.updatedAt).toBe('2024-02-02T00:00:00.000Z');

    expect(renameCapture?.url).toBe('/api/documents/1');
    expect(renameCapture?.init.method).toBe('PATCH');
    expect(renameCapture?.init.body).toBe(
      JSON.stringify({ title: 'Renamed draft' }),
    );
  });

  it('deletes a document and removes it from the list', async () => {
    route((url, init) => url.endsWith('/api/documents') && (init?.method ?? 'GET') === 'GET')
      .body = sampleList;
    const deleteCapture: Route['capture'] = { url: '', init: {} };
    const deleteRoute = route(
      (url, init) =>
        url.endsWith('/api/documents/2') && (init?.method ?? 'GET') === 'DELETE',
    );
    deleteRoute.status = 204;
    deleteRoute.empty = true;
    deleteRoute.capture = deleteCapture;

    const { result } = renderHook(() => useDocuments());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    let ok: boolean;
    await act(async () => {
      ok = await result.current.deleteDocument(2);
    });

    expect(ok!).toBe(true);
    expect(result.current.documents.map((d) => d.id)).toEqual([1]);

    expect(deleteCapture?.url).toBe('/api/documents/2');
    expect(deleteCapture?.init.method).toBe('DELETE');
  });

  it('saves document content via PATCH', async () => {
    route((url, init) => url.endsWith('/api/documents') && (init?.method ?? 'GET') === 'GET')
      .body = sampleList;
    const saveCapture: Route['capture'] = { url: '', init: {} };
    const saveRoute = route(
      (url, init) =>
        url.endsWith('/api/documents/1') && (init?.method ?? 'GET') === 'PATCH',
    );
    saveRoute.body = {
      document: {
        id: 1,
        title: 'First draft',
        content:
          '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"hi"}]}]}',
        updatedAt: '2024-02-03T00:00:00.000Z',
        createdAt: '2024-01-01T00:00:00.000Z',
      },
    };
    saveRoute.capture = saveCapture;

    const { result } = renderHook(() => useDocuments());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    let saved: Awaited<ReturnType<typeof result.current.saveDocument>> | undefined;
    await act(async () => {
      saved = await result.current.saveDocument(1, {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'hi' }],
          },
        ],
      });
    });

    expect(saved?.content).toEqual({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'hi' }],
        },
      ],
    });

    expect(saveCapture?.url).toBe('/api/documents/1');
    expect(saveCapture?.init.method).toBe('PATCH');
    const parsedBody = JSON.parse(String(saveCapture?.init.body ?? '{}'));
    expect(parsedBody.content).toEqual({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'hi' }],
        },
      ],
    });
  });

  it('loads a single document by id', async () => {
    route((url, init) => url.endsWith('/api/documents') && (init?.method ?? 'GET') === 'GET')
      .body = sampleList;
    route((url, init) => {
      if (url.endsWith('/api/documents/2') && (init?.method ?? 'GET') === 'GET') {
        return true;
      }
      return false;
    }).body = {
      document: {
        id: 2,
        title: 'Second draft',
        content: '{"type":"doc","content":[{"type":"paragraph"}]}',
        updatedAt: '2024-01-03T00:00:00.000Z',
        createdAt: '2024-01-02T00:00:00.000Z',
      },
    };

    const { result } = renderHook(() => useDocuments());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    let detail: Awaited<ReturnType<typeof result.current.loadDocument>> | undefined;
    await act(async () => {
      detail = await result.current.loadDocument(2);
    });

    expect(detail?.id).toBe(2);
    expect(detail?.content).toEqual({
      type: 'doc',
      content: [{ type: 'paragraph' }],
    });
  });
});
