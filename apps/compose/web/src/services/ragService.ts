/**
 * RAG Service — types and API client for RAG source display and document viewing.
 */

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

// Base URL for Compose API
const API_BASE = import.meta.env.VITE_COMPOSE_API_BASE_URL || '';

function getAuthHeaders(): Record<string, string> {
  const token =
    localStorage.getItem('authToken') ||
    localStorage.getItem('auth_token') ||
    '';
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

export const ragService = {
  async getCollections(orgSlug: string): Promise<RagCollection[]> {
    const res = await fetch(`${API_BASE}/api/rag/collections`, {
      headers: {
        ...getAuthHeaders(),
        'x-organization-slug': orgSlug,
      },
    });
    if (!res.ok) return [];
    const data = await res.json();
    // API returns { collections: [...] } or just [...]
    return data.collections ?? data ?? [];
  },

  async getDocumentContent(
    collectionId: string,
    documentId: string,
    orgSlug: string,
  ): Promise<RagDocumentContent | null> {
    // documentId here is the document filename or slug, not UUID
    // We need to find the document by searching the collection's documents
    const docsRes = await fetch(
      `${API_BASE}/api/rag/collections/${collectionId}/documents`,
      {
        headers: {
          ...getAuthHeaders(),
          'x-organization-slug': orgSlug,
        },
      },
    );
    if (!docsRes.ok) return null;
    const docs = await docsRes.json();
    const docList = Array.isArray(docs) ? docs : docs.documents ?? [];

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

    if (!doc) return null;

    // Fetch the actual content
    const contentRes = await fetch(
      `${API_BASE}/api/rag/collections/${collectionId}/documents/${doc.id}/content`,
      {
        headers: {
          ...getAuthHeaders(),
          'x-organization-slug': orgSlug,
        },
      },
    );
    if (!contentRes.ok) return null;
    return contentRes.json();
  },
};
