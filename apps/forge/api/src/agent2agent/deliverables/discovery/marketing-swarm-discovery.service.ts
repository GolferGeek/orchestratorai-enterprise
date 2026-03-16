import { Injectable, Logger, Inject } from '@nestjs/common';
import {
  DATABASE_SERVICE,
  type DatabaseService,
  type QueryResult,
} from '../../../database';
import type {
  IDeliverableDiscovery,
  DiscoveredDeliverable,
} from '../deliverable-discovery.interface';

/**
 * Discovery service for Marketing Swarm deliverables
 *
 * Marketing Swarm stores deliverables in:
 * 1. LangGraph state (via API)
 * 2. marketing.swarm_tasks table (task metadata)
 *
 * This service queries these sources to find deliverables that aren't in the standard deliverables table.
 */
@Injectable()
export class MarketingSwarmDiscoveryService implements IDeliverableDiscovery {
  private readonly logger = new Logger(MarketingSwarmDiscoveryService.name);
  readonly agentSlug = 'marketing-swarm';
  readonly agentTypes = ['api'];

  constructor(@Inject(DATABASE_SERVICE) private readonly db: DatabaseService) {}

  async discoverDeliverables(
    conversationId: string,
    userId: string,
  ): Promise<DiscoveredDeliverable[]> {
    try {
      const deliverables: DiscoveredDeliverable[] = [];

      // Method 1: Query marketing.swarm_tasks table for completed tasks
      const marketingDeliverables = await this.discoverFromSwarmTasks(
        conversationId,
        userId,
      );
      deliverables.push(...marketingDeliverables);

      // Method 2: Query LangGraph state API for completed swarms
      // Note: This requires LangGraph to be running and accessible
      // We'll try this but don't fail if LangGraph is unavailable
      try {
        const langGraphDeliverables = await this.discoverFromLangGraphState(
          conversationId,
          userId,
        );
        deliverables.push(...langGraphDeliverables);
      } catch (langGraphError) {
        this.logger.debug(
          `LangGraph discovery failed for conversation ${conversationId}: ${langGraphError instanceof Error ? langGraphError.message : String(langGraphError)}`,
        );
        // Continue without LangGraph results
      }

      // Deduplicate by ID (in case both methods found the same deliverable)
      const uniqueDeliverables = Array.from(
        new Map(deliverables.map((d) => [d.id, d])).values(),
      );

      this.logger.log(
        `[MarketingSwarmDiscovery] Found ${uniqueDeliverables.length} deliverables for conversation ${conversationId}`,
      );

      return uniqueDeliverables;
    } catch (error) {
      this.logger.error(
        `Failed to discover Marketing Swarm deliverables: ${error instanceof Error ? error.message : String(error)}`,
      );
      return [];
    }
  }

  /**
   * Discover deliverables from marketing.swarm_tasks table
   */
  private async discoverFromSwarmTasks(
    conversationId: string,
    userId: string,
  ): Promise<DiscoveredDeliverable[]> {
    try {
      // Query swarm_tasks for this conversation
      interface SwarmTaskRecord {
        task_id: string;
        status: string;
        created_at: string;
        updated_at: string | null;
        config: Record<string, unknown> | null;
        prompt_data: Record<string, unknown> | null;
      }

      const { data: swarmTasks, error } = (await this.db
        .from('marketing', 'swarm_tasks')
        .select('task_id, status, created_at, updated_at, config, prompt_data')
        .eq('conversation_id', conversationId)
        .eq('user_id', userId)
        .eq('status', 'completed')
        .order('created_at', { ascending: false })) as QueryResult<unknown>;

      if (error) {
        this.logger.error(`Error querying swarm_tasks: ${error.message}`);
        return [];
      }

      const typedSwarmTasks = (swarmTasks || []) as SwarmTaskRecord[];

      if (typedSwarmTasks.length === 0) {
        return [];
      }

      // Convert swarm tasks to discovered deliverables
      return typedSwarmTasks.map((task) => {
        const taskId = task.task_id;
        const promptData = task.prompt_data || {};
        const contentTypeSlug =
          typeof promptData === 'object' &&
          promptData !== null &&
          'contentTypeSlug' in promptData
            ? String(promptData.contentTypeSlug)
            : 'unknown';

        return {
          id: `marketing-swarm-${taskId}`, // Generate ID from task_id
          title: `Marketing Swarm: ${contentTypeSlug}`,
          type: 'document',
          contentPreview: `Marketing Swarm deliverable (${contentTypeSlug})`,
          format: 'markdown',
          createdAt: new Date(task.created_at),
          updatedAt: new Date(task.updated_at || task.created_at),
          metadata: {
            source: 'marketing-swarm',
            taskId,
            contentTypeSlug,
            config: task.config,
            promptData,
          },
          conversationId,
          taskId,
          agentName: 'marketing-swarm',
          isExternal: true,
          // Load full content from LangGraph state on-demand
          loadFullContent: async () => {
            return await this.loadContentFromLangGraph(taskId);
          },
        };
      });
    } catch (error) {
      this.logger.error(
        `Error discovering from swarm_tasks: ${error instanceof Error ? error.message : String(error)}`,
      );
      return [];
    }
  }

  /**
   * Discover deliverables from LangGraph state API
   */
  private async discoverFromLangGraphState(
    _conversationId: string,
    _userId: string,
  ): Promise<DiscoveredDeliverable[]> {
    // This would require querying LangGraph API
    // For now, we'll rely on swarm_tasks table discovery
    // TODO: Implement LangGraph API query if needed
    return Promise.resolve([]);
  }

  /**
   * Load full content from LangGraph state API
   */
  private async loadContentFromLangGraph(taskId: string): Promise<string> {
    // TODO: Query LangGraph API to get full swarm state
    // For now, return a placeholder
    return Promise.resolve(
      `Marketing Swarm deliverable content for task ${taskId}`,
    );
  }
}
