// HTTP-layer request shapes for the document API.
//
// The repository / service layer stores `content` as a serialized ProseMirror
// JSON string. Over the wire we accept a JSON object (e.g. `{ type: 'doc', ... }`)
// and serialize it in the route handler before persisting.

export interface CreateDocumentRequest {
  title?: unknown;
  content?: unknown;
}

export interface UpdateDocumentRequest {
  title?: unknown;
  content?: unknown;
}

export interface DocumentResponse {
  id: number;
  userId: number;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}
