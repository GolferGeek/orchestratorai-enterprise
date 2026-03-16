/**
 * Notebook API Service
 *
 * Fetch wrapper for RAG endpoints on the Compose API.
 * Requests go to /compose-api/* which Vite proxies to localhost:6300.
 * Auth token is read from localStorage (same key used by flow-api.service.ts).
 */

const BASE_URL = '/compose-api/api/rag';

function getAuthToken(): string | null {
  const fromStorage = localStorage.getItem('authToken');
  if (fromStorage) return fromStorage;
  const match = document.cookie.match(/(?:^|; )orch_auth_token=([^;]*)/);
  if (match) {
    const token = decodeURIComponent(match[1]);
    localStorage.setItem('authToken', token);
    return token;
  }
  return null;
}

function headers(includeContentType = true): Record<string, string> {
  const token = getAuthToken();
  const h: Record<string, string> = {};
  if (token) h['Authorization'] = `Bearer ${token}`;
  if (includeContentType) h['Content-Type'] = 'application/json';
  return h;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, init);
  if (!res.ok) {
    let message = `RAG API error: ${res.status}`;
    try {
      const text = await res.text();
      if (text) {
        try {
          const err = JSON.parse(text);
          message = err.message || err.error || message;
        } catch {
          message = text;
        }
      }
    } catch { /* ignore */ }
    const err = new Error(message) as Error & { status: number };
    err.status = res.status;
    throw err;
  }
  if (res.status === 204) return null as T;
  const text = await res.text();
  if (!text) return null as T;
  return JSON.parse(text) as T;
}

// ============================================================================
// Types
// ============================================================================

export interface Collection {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  documentCount: number;
  totalChunks: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export interface RagDocument {
  id: string;
  collectionId: string;
  filename: string;
  fileType: string;
  fileSize: number;
  status: string;
  chunkCount: number;
  tokenCount: number;
  createdAt: string;
}

export interface QAResponse {
  answer: string;
  citations: Array<{
    documentId: string;
    documentFilename: string;
    content: string;
    score: number;
    pageNumber: number | null;
    chunkIndex: number;
  }>;
  query: string;
  model: string;
  searchDurationMs: number;
  totalDurationMs: number;
}

export interface UploadResult {
  id: string;
  filename: string;
  status: string;
  message: string;
}

// ============================================================================
// Collections
// ============================================================================

export async function getCollections(): Promise<Collection[]> {
  return request<Collection[]>('/collections', { headers: headers() });
}

export async function createCollection(name: string, description?: string): Promise<Collection> {
  return request<Collection>('/collections', {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ name, description }),
  });
}

export async function deleteCollection(id: string): Promise<void> {
  await request<void>(`/collections/${id}`, {
    method: 'DELETE',
    headers: headers(false),
  });
}

// ============================================================================
// Documents
// ============================================================================

export async function getDocuments(collectionId: string): Promise<RagDocument[]> {
  return request<RagDocument[]>(`/collections/${collectionId}/documents`, {
    headers: headers(false),
  });
}

export async function uploadDocument(collectionId: string, file: File): Promise<UploadResult> {
  const formData = new FormData();
  formData.append('file', file);
  const h = headers(false); // no Content-Type — browser sets it with boundary
  return request<UploadResult>(`/collections/${collectionId}/documents`, {
    method: 'POST',
    headers: h,
    body: formData,
  });
}

export async function deleteDocument(collectionId: string, docId: string): Promise<void> {
  await request<void>(`/collections/${collectionId}/documents/${docId}`, {
    method: 'DELETE',
    headers: headers(false),
  });
}

// ============================================================================
// Q&A
// ============================================================================

export async function askQuestion(
  collectionId: string,
  question: string,
  topK?: number,
): Promise<QAResponse> {
  return request<QAResponse>(`/collections/${collectionId}/qa`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ question, topK }),
  });
}
