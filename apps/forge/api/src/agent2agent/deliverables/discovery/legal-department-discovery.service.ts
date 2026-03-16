import { Injectable, Logger, Inject } from '@nestjs/common';
import { DATABASE_SERVICE, DatabaseService, QueryResult } from '@/database';
import type {
  IDeliverableDiscovery,
  DiscoveredDeliverable,
} from '../deliverable-discovery.interface';

/**
 * Discovery service for Legal Department AI deliverables
 *
 * Legal Department stores deliverables in:
 * 1. Standard deliverables table (analysis results as JSON in content)
 * 2. law.document_extractions table (document metadata and extracted text)
 * 3. legal-documents storage bucket (original document files)
 *
 * This service queries these sources to find deliverables that might not be
 * properly linked to conversations or might be stored in custom tables.
 */
@Injectable()
export class LegalDepartmentDiscoveryService implements IDeliverableDiscovery {
  private readonly logger = new Logger(LegalDepartmentDiscoveryService.name);
  readonly agentSlug = 'legal-department';
  readonly agentTypes = ['api'];

  constructor(@Inject(DATABASE_SERVICE) private readonly db: DatabaseService) {}

  async discoverDeliverables(
    conversationId: string,
    userId: string,
  ): Promise<DiscoveredDeliverable[]> {
    this.logger.log(
      `[LegalDepartmentDiscovery] Discovering deliverables for conversation ${conversationId}`,
    );

    const discovered: DiscoveredDeliverable[] = [];

    try {
      // 1. Check for analysis deliverables in standard table that might not be linked properly
      // (This is a fallback - they should already be found by standard query, but check anyway)
      const { data: analysisDeliverables, error: analysisError } =
        (await this.db
          .from(null, 'deliverables')
          .select('id, title, type, created_at, updated_at, metadata')
          .eq('conversation_id', conversationId)
          .eq('user_id', userId)
          .eq('agent_name', 'legal-department')
          .eq('type', 'analysis')
          .order('created_at', { ascending: false })) as QueryResult<unknown>;

      if (analysisError) {
        this.logger.warn(
          `[LegalDepartmentDiscovery] Error querying analysis deliverables: ${analysisError.message}`,
        );
      } else if (
        analysisDeliverables &&
        Array.isArray(analysisDeliverables) &&
        analysisDeliverables.length > 0
      ) {
        this.logger.log(
          `[LegalDepartmentDiscovery] Found ${analysisDeliverables.length} analysis deliverables`,
        );
        // These should already be found by standard query, but include them for completeness
        interface AnalysisDeliverableRecord {
          id: string;
          title: string | null;
          created_at: string;
          updated_at: string;
          metadata: Record<string, unknown> | null;
        }

        const typedAnalysisDeliverables = (analysisDeliverables ||
          []) as AnalysisDeliverableRecord[];

        for (const deliverable of typedAnalysisDeliverables) {
          discovered.push({
            id: deliverable.id,
            title: deliverable.title || 'Legal Analysis',
            type: 'analysis',
            agentName: 'legal-department',
            isExternal: false,
            conversationId,
            createdAt: new Date(deliverable.created_at),
            updatedAt: new Date(deliverable.updated_at),
            metadata: {
              ...(deliverable.metadata || {}),
              source: 'standard_deliverables_table',
            },
          });
        }
      }

      // 2. Discover document extractions from law.document_extractions table
      // These represent processed documents that could be considered deliverables
      // We need to find tasks for this conversation first, then match document extractions
      const { data: tasks, error: tasksError } = (await this.db
        .from(null, 'tasks')
        .select('id, created_at')
        .eq('conversation_id', conversationId)
        .eq('user_id', userId)
        .order('created_at', { ascending: false })) as QueryResult<unknown>;

      if (tasksError) {
        this.logger.warn(
          `[LegalDepartmentDiscovery] Error querying tasks: ${tasksError.message}`,
        );
      } else if (tasks && Array.isArray(tasks) && tasks.length > 0) {
        interface TaskRecord {
          id: string;
          created_at: string;
        }

        const typedTasks = tasks as TaskRecord[];
        const taskIds = typedTasks.map((t) => t.id);

        // Query document extractions for these tasks
        // Note: law.document_extractions uses analysis_task_id which maps to tasks.id
        const { data: documentExtractions, error: extractionsError } =
          (await this.db
            .from('law', 'document_extractions')
            .select(
              'id, analysis_task_id, original_filename, storage_path, file_type, extracted_text, document_type, created_at',
            )
            .in('analysis_task_id', taskIds)
            .order('created_at', { ascending: false })) as QueryResult<unknown>;

        if (extractionsError) {
          this.logger.warn(
            `[LegalDepartmentDiscovery] Error querying document extractions: ${extractionsError.message}`,
          );
        } else if (
          documentExtractions &&
          Array.isArray(documentExtractions) &&
          documentExtractions.length > 0
        ) {
          interface DocumentExtractionRecord {
            id: string;
            analysis_task_id: string;
            original_filename: string | null;
            storage_path: string | null;
            file_type: string | null;
            extracted_text: string | null;
            document_type: string | null;
            created_at: string;
          }

          const typedExtractions =
            documentExtractions as DocumentExtractionRecord[];
          this.logger.log(
            `[LegalDepartmentDiscovery] Found ${typedExtractions.length} document extractions`,
          );

          for (const extraction of typedExtractions) {
            // Find the matching task to get its creation date
            const matchingTask = typedTasks.find(
              (t) => t.id === extraction.analysis_task_id,
            );

            // Create a deliverable representation for this document extraction
            const createdAtValue =
              extraction.created_at || matchingTask?.created_at;
            const updatedAtValue =
              extraction.created_at || matchingTask?.created_at;

            discovered.push({
              id: `legal-doc-${extraction.id}`, // Synthetic ID since it's not a real deliverable
              title: `Document: ${extraction.original_filename || 'Untitled Document'}`,
              type: 'document',
              agentName: 'legal-department',
              isExternal: true,
              conversationId,
              createdAt: createdAtValue ? new Date(createdAtValue) : new Date(),
              updatedAt: updatedAtValue ? new Date(updatedAtValue) : new Date(),
              metadata: {
                documentId: extraction.id,
                taskId: extraction.analysis_task_id,
                filename: extraction.original_filename,
                storagePath: extraction.storage_path,
                fileType: extraction.file_type,
                documentType: extraction.document_type,
                hasExtractedText: Boolean(extraction.extracted_text),
                extractedTextLength: extraction.extracted_text?.length || 0,
                source: 'law.document_extractions',
              },
            });
          }
        }
      }

      this.logger.log(
        `[LegalDepartmentDiscovery] Discovered ${discovered.length} total deliverables for conversation ${conversationId}`,
      );

      return discovered;
    } catch (error) {
      this.logger.error(
        `[LegalDepartmentDiscovery] Error discovering deliverables: ${error instanceof Error ? error.message : String(error)}`,
      );
      return discovered; // Return what we found so far
    }
  }

  /**
   * Check if this discovery service should handle a specific agent
   */
  canHandle(agentSlug: string, agentType?: string): boolean {
    return (
      agentSlug === this.agentSlug &&
      (!agentType || this.agentTypes.includes(agentType))
    );
  }
}
