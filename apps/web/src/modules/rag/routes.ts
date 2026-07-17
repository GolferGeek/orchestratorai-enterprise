import { libraryOutline } from 'ionicons/icons';

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
];
