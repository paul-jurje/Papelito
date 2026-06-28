/**
 * Tiny fetch helper used by the web app to talk to the Express API.
 *
 * Responsibilities:
 * - Always sends cookies (`credentials: 'include'`) so the server-validated
 *   express-session cookie is included on every request.
 * - Encodes JSON request bodies and parses JSON responses.
 * - Throws `ApiError` (with status + server-supplied message) on non-2xx
 *   responses so callers can surface user-friendly errors.
 */

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export interface ApiRequestOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function extractErrorMessage(payload: unknown, fallback: string): string {
  if (isPlainObject(payload) && typeof payload['message'] === 'string') {
    return payload['message'];
  }
  return fallback;
}

export async function api<T = unknown>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  const { method = 'GET', body, headers = {}, signal } = options;

  const init: RequestInit = {
    method,
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
  };

  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }

  if (signal) {
    init.signal = signal;
  }

  const response = await fetch(path, init);

  // Read the body once as text; only attempt JSON parsing if there's content.
  const rawText = await response.text();
  let parsed: unknown = null;
  if (rawText.length > 0) {
    try {
      parsed = JSON.parse(rawText);
    } catch {
      parsed = rawText;
    }
  }

  if (!response.ok) {
    const message = extractErrorMessage(
      parsed,
      `Request failed with status ${response.status}`,
    );
    throw new ApiError(message, response.status);
  }

  return parsed as T;
}
