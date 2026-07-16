import type { ExecutionContext } from '@orchestrator-ai/transport-types';

export interface ClassificationResult {
  documentClass:
    | 'contract'
    | 'deposition'
    | 'court_filing'
    | 'correspondence'
    | 'evidence'
    | 'other';
  documentDate: string | null;
  summary: string;
}

export interface MetadataResult {
  parties: string[];
  keyTerms: string[];
  additionalMetadata: Record<string, unknown>;
}

export interface DocumentsAgentInput {
  context: ExecutionContext;
  matterId: string;
  documentId: string;
  storagePath: string;
}

export interface DocumentsAgentResult {
  status: 'completed' | 'failed';
  error?: string;
  duration: number;
}
