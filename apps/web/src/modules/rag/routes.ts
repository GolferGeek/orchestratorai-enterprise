import { documentTextOutline, libraryOutline } from 'ionicons/icons';

export interface RagModuleRoute {
  label: string;
  path: string;
  apiPrefix: string;
  permission: string;
  description: string;
  icon: string;
}

// Copied from the legacy AdminShell RAG Management entry and adapted to
// unified in-app routes.
export const ragModuleRoutes: RagModuleRoute[] = [
  {
    label: 'Collections',
    path: '/app/rag/collections',
    apiPrefix: '/rag/collections',
    permission: 'rag:read',
    description: 'Manage retrieval collections, documents, chunks, and embeddings.',
    icon: libraryOutline,
  },
  {
    label: 'Documents',
    path: '/app/rag/documents',
    apiPrefix: '/rag/documents',
    permission: 'rag:read',
    description: 'Inspect ingested documents and document processing state.',
    icon: documentTextOutline,
  },
];
