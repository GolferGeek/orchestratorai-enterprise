/**
 * Notebook API Client
 *
 * Calls RAG endpoints on the API for collection management, document upload, and Q&A.
 */
import { getMainApiUrl } from '@/config/api-config';
import { useAuthStore } from '@/stores/auth-store';

function getHeaders(): Record<string, string> {
  const token = useAuthStore.getState().accessToken;
  const orgSlug = useAuthStore.getState().orgSlug || 'default';
  return {
    Authorization: `Bearer ${token}`,
    'x-organization-slug': orgSlug,
  };
}

function apiUrl(path: string): string {
  return `${getMainApiUrl()}/api/rag${path}`;
}

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

export interface Document {
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

export interface Chunk {
  id: string;
  documentId: string;
  content: string;
  chunkIndex: number;
  pageNumber: number | null;
  tokenCount: number;
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

export async function listCollections(): Promise<Collection[]> {
  const res = await fetch(apiUrl('/collections'), {
    headers: getHeaders(),
  });
  if (!res.ok) throw new Error(`Failed to list collections: ${res.statusText}`);
  return res.json();
}

export async function createCollection(
  name: string,
  description?: string,
): Promise<Collection> {
  const res = await fetch(apiUrl('/collections'), {
    method: 'POST',
    headers: { ...getHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, description }),
  });
  if (!res.ok) throw new Error(`Failed to create collection: ${res.statusText}`);
  return res.json();
}

export async function deleteCollection(id: string): Promise<void> {
  const res = await fetch(apiUrl(`/collections/${id}`), {
    method: 'DELETE',
    headers: getHeaders(),
  });
  if (!res.ok) throw new Error(`Failed to delete collection: ${res.statusText}`);
}

export async function listDocuments(collectionId: string): Promise<Document[]> {
  const res = await fetch(apiUrl(`/collections/${collectionId}/documents`), {
    headers: getHeaders(),
  });
  if (!res.ok) throw new Error(`Failed to list documents: ${res.statusText}`);
  return res.json();
}

export async function uploadDocument(
  collectionId: string,
  file: File,
): Promise<{ id: string; filename: string; status: string; message: string }> {
  const formData = new FormData();
  formData.append('file', file);

  const headers = getHeaders();
  // Don't set Content-Type for FormData — browser sets it with boundary
  delete (headers as Record<string, string | undefined>)['Content-Type'];

  const res = await fetch(apiUrl(`/collections/${collectionId}/documents`), {
    method: 'POST',
    headers,
    body: formData,
  });
  if (!res.ok) throw new Error(`Failed to upload document: ${res.statusText}`);
  return res.json();
}

export async function deleteDocument(
  collectionId: string,
  docId: string,
): Promise<void> {
  const res = await fetch(
    apiUrl(`/collections/${collectionId}/documents/${docId}`),
    {
      method: 'DELETE',
      headers: getHeaders(),
    },
  );
  if (!res.ok) throw new Error(`Failed to delete document: ${res.statusText}`);
}

export async function getDocumentChunks(
  collectionId: string,
  docId: string,
): Promise<Chunk[]> {
  const res = await fetch(
    apiUrl(`/collections/${collectionId}/documents/${docId}/chunks`),
    {
      headers: getHeaders(),
    },
  );
  if (!res.ok) throw new Error(`Failed to get chunks: ${res.statusText}`);
  return res.json();
}

export async function askQuestion(
  collectionId: string,
  question: string,
  topK?: number,
): Promise<QAResponse> {
  const res = await fetch(apiUrl(`/collections/${collectionId}/qa`), {
    method: 'POST',
    headers: { ...getHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, topK }),
  });
  if (!res.ok) throw new Error(`Failed to ask question: ${res.statusText}`);
  return res.json();
}
