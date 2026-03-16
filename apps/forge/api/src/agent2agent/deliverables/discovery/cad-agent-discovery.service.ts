import { Injectable, Logger, Inject } from '@nestjs/common';
import { DATABASE_SERVICE, DatabaseService, QueryResult } from '@/database';
import type {
  IDeliverableDiscovery,
  DiscoveredDeliverable,
} from '../deliverable-discovery.interface';

/**
 * Discovery service for CAD Agent deliverables
 *
 * CAD Agent stores deliverables in:
 * 1. tasks.response field (JSON with CAD data: outputs, meshStats, generatedCode)
 *
 * This service queries completed tasks to find CAD deliverables.
 */
@Injectable()
export class CadAgentDiscoveryService implements IDeliverableDiscovery {
  private readonly logger = new Logger(CadAgentDiscoveryService.name);
  readonly agentSlug = 'cad-agent';
  readonly agentTypes = ['api'];

  constructor(@Inject(DATABASE_SERVICE) private readonly db: DatabaseService) {}

  async discoverDeliverables(
    conversationId: string,
    userId: string,
  ): Promise<DiscoveredDeliverable[]> {
    try {
      // Query tasks for this conversation with CAD agent
      // Note: tasks table uses 'conversation_id' column (not 'agent_conversation_id')
      const { data: tasks, error } = (await this.db
        .from(null, 'tasks')
        .select('id, status, response, created_at, updated_at, completed_at')
        .eq('conversation_id', conversationId)
        .eq('user_id', userId)
        .eq('status', 'completed')
        .order('created_at', { ascending: false })) as QueryResult<unknown>;

      if (error) {
        this.logger.error(
          `Error querying tasks for CAD discovery: ${error.message}`,
        );
        return [];
      }

      const taskRows = (tasks ?? []) as Array<{
        id: string;
        status: string;
        response: unknown;
        created_at: string;
        updated_at: string;
        completed_at: string;
      }>;

      if (taskRows.length === 0) {
        return [];
      }

      const deliverables: DiscoveredDeliverable[] = [];

      for (const task of taskRows) {
        if (!task.response) {
          continue;
        }

        try {
          // Parse task response to extract CAD data
          const responseData: unknown =
            typeof task.response === 'string'
              ? JSON.parse(task.response)
              : task.response;

          // Extract CAD data from nested response structure
          // Structure: response.payload.content.deliverable.currentVersion.content
          const cadData = this.extractCadDataFromResponse(responseData);

          if (
            cadData &&
            Array.isArray(cadData.outputs) &&
            cadData.outputs.length > 0
          ) {
            const taskId = task.id;
            const createdAt = new Date(task.created_at);
            const updatedAt = new Date(
              task.updated_at || task.completed_at || task.created_at,
            );

            deliverables.push({
              id: `cad-agent-${taskId}`,
              title: `CAD Drawing: ${(cadData.outputs[0] as { name?: string })?.name || 'Generated Drawing'}`,
              type: 'cad-drawing',
              contentPreview: `CAD drawing with ${cadData.outputs.length} output(s)`,
              format: 'json',
              createdAt,
              updatedAt,
              metadata: {
                source: 'cad-agent',
                taskId,
                outputsCount: cadData.outputs.length,
                hasMeshStats: !!cadData.meshStats,
                hasGeneratedCode: !!cadData.generatedCode,
              },
              conversationId,
              taskId,
              agentName: 'cad-agent',
              isExternal: true,
              // Load full content from task response
              loadFullContent: async () => {
                return Promise.resolve(JSON.stringify(cadData, null, 2));
              },
            });
          }
        } catch (parseError) {
          this.logger.debug(
            `Failed to parse CAD data from task ${task.id}: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
          );
          // Continue to next task
        }
      }

      this.logger.log(
        `[CadAgentDiscovery] Found ${deliverables.length} deliverables for conversation ${conversationId}`,
      );

      return deliverables;
    } catch (error) {
      this.logger.error(
        `Failed to discover CAD Agent deliverables: ${error instanceof Error ? error.message : String(error)}`,
      );
      return [];
    }
  }

  /**
   * Extract CAD-specific data from the deeply nested A2A task response
   * Handles structure: response.payload.content.deliverable.currentVersion.content
   */
  private extractCadDataFromResponse(responseData: unknown): {
    outputs?: unknown[];
    meshStats?: unknown;
    generatedCode?: unknown;
    status?: string;
  } | null {
    if (!responseData || typeof responseData !== 'object') {
      return null;
    }

    const response = responseData as Record<string, unknown>;
    const payload = response.payload as Record<string, unknown> | undefined;
    if (!payload) {
      return null;
    }

    const content = payload.content as Record<string, unknown> | undefined;
    if (!content) {
      return null;
    }

    // Check for deliverable structure
    const deliverable = content.deliverable as
      | Record<string, unknown>
      | undefined;
    if (deliverable) {
      const currentVersion = deliverable.currentVersion as
        | Record<string, unknown>
        | undefined;
      if (currentVersion) {
        const versionContent = currentVersion.content;
        if (typeof versionContent === 'string') {
          try {
            const parsed = JSON.parse(versionContent) as Record<
              string,
              unknown
            >;
            // Check if it's CAD data structure
            const parsedData = parsed.data as
              | Record<string, unknown>
              | undefined;
            if (parsedData && parsedData.data) {
              const nestedData = parsedData.data as Record<string, unknown>;
              return {
                outputs: Array.isArray(nestedData.outputs)
                  ? nestedData.outputs
                  : undefined,
                meshStats: nestedData.meshStats,
                generatedCode: nestedData.generatedCode,
                status:
                  typeof nestedData.status === 'string'
                    ? nestedData.status
                    : undefined,
              };
            }
          } catch {
            // Not JSON, continue
          }
        }
      }
    }

    // Check direct structure (data.data.outputs)
    const data = content.data as Record<string, unknown> | undefined;
    if (data && data.data) {
      const nestedData = data.data as Record<string, unknown>;
      if (nestedData.outputs) {
        return nestedData as {
          outputs?: unknown[];
          meshStats?: unknown;
          generatedCode?: unknown;
          status?: string;
        };
      }
    }

    // Check for direct outputs
    if (content.outputs) {
      return content as {
        outputs?: unknown[];
        meshStats?: unknown;
        generatedCode?: unknown;
        status?: string;
      };
    }

    return null;
  }
}
