/**
 * RAG Service — types and API client for RAG source display and document viewing.
 */

import { tokenStorage } from '@/services/tokenStorageService';

export interface RagSource {
  document: string;
  documentId: string | null;
  sectionPath: string | null;
  matchType: 'keyword' | 'semantic' | 'both' | null;
  version: string | null;
  score: number;
  excerpt: string;
  chunkMetadata: Record<string, unknown> | null;
}

export interface RagRelatedDocument {
  documentId: string;
  documentIdRef?: string;
  title: string;
  relationship: string;
}

export interface RagCollection {
  id: string;
  name: string;
  slug: string;
}

export interface RagDocumentContent {
  id: string;
  filename: string;
  fileType: string;
  content: string | null;
  chunkCount: number;
}

/**
 * Extract RAG sources from invoke response metadata.
 */
export function extractRagSources(metadata: Record<string, unknown>): RagSource[] {
  const sources = metadata?.sources;
  if (!Array.isArray(sources)) return [];
  return sources as RagSource[];
}

/**
 * Extract related documents from invoke response metadata.
 */
export function extractRelatedDocuments(metadata: Record<string, unknown>): RagRelatedDocument[] {
  const related = metadata?.relatedDocuments;
  if (!Array.isArray(related)) return [];
  return related as RagRelatedDocument[];
}

const API_BASE = import.meta.env.VITE_API_BASE_URL;

async function getAuthHeaders(): Promise<Record<string, string>> {
  const token = await tokenStorage.getAccessToken();
  if (!token) {
    throw new Error('Authentication is required for RAG documents');
  }
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

export const ragService = {
  async getCollections(orgSlug: string): Promise<RagCollection[]> {
    const res = await fetch(`${API_BASE}/rag/collections`, {
      headers: {
        ...(await getAuthHeaders()),
        'x-organization-slug': orgSlug,
      },
    });
    if (!res.ok) {
      throw new Error(`Failed to load RAG collections: ${res.status}`);
    }
    const data = await res.json();
    return data.collections;
  },

  async getDocumentContent(
    collectionId: string,
    documentId: string,
    orgSlug: string,
  ): Promise<RagDocumentContent | null> {
    // documentId here is the document filename or slug, not UUID
    // We need to find the document by searching the collection's documents
    const docsRes = await fetch(
      `${API_BASE}/rag/collections/${collectionId}/documents`,
      {
        headers: {
          ...(await getAuthHeaders()),
          'x-organization-slug': orgSlug,
        },
      },
    );
    if (!docsRes.ok) {
      throw new Error(`Failed to load RAG documents: ${docsRes.status}`);
    }
    const docs = await docsRes.json();
    const docList = docs.documents;

    // Match by UUID, exact filename, or normalized filename
    const normalizeForMatch = (s: string) =>
      s.replace(/\.md$|\.pdf$|\.txt$|\.docx$/i, '').replace(/[-_]/g, '-').toLowerCase();
    const needle = normalizeForMatch(documentId);

    const doc = docList.find(
      (d: Record<string, unknown>) =>
        d.id === documentId ||
        d.filename === documentId ||
        normalizeForMatch(d.filename as string) === needle,
    );

    if (!doc) {
      throw new Error(`RAG document not found: ${documentId}`);
    }

    // Fetch the actual content
    const chunksRes = await fetch(
      `${API_BASE}/rag/collections/${collectionId}/documents/${doc.id}/chunks`,
      {
        headers: {
          ...(await getAuthHeaders()),
          'x-organization-slug': orgSlug,
        },
      },
    );
    if (!chunksRes.ok) {
      throw new Error(`Failed to load RAG document chunks: ${chunksRes.status}`);
    }
    const chunks = await chunksRes.json();
    const chunkList = chunks.chunks;
    return {
      id: doc.id as string,
      filename: doc.filename as string,
      fileType: doc.contentType as string,
      content: chunkList
        .map((chunk: { content: string }) => chunk.content)
        .join('\n\n'),
      chunkCount: chunkList.length,
    };
  },
};
