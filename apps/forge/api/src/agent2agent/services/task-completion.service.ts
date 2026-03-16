import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { TasksService } from '../tasks/tasks.service';
import { DeliverablesService } from '../deliverables/deliverables.service';
import {
  DeliverableFormat,
  DeliverableVersionCreationType,
} from '../deliverables/dto';

export interface TaskCompletionParams {
  orgSlug: string;
  agentSlug: string;
  taskId: string;
  userId: string;
  conversationId: string;
  status: 'success' | 'failed';
  results?: unknown;
  error?: string;
}

@Injectable()
export class TaskCompletionService {
  private readonly logger = new Logger(TaskCompletionService.name);

  constructor(
    private readonly taskUpdateService: TasksService,
    private readonly deliverablesService: DeliverablesService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async handleCompletion(params: TaskCompletionParams): Promise<{
    success: boolean;
    message: string;
  }> {
    const {
      orgSlug,
      agentSlug,
      taskId,
      userId,
      conversationId,
      status,
      results,
      error,
    } = params;

    // Update task status
    if (status === 'failed') {
      await this.taskUpdateService.updateTask(taskId, userId, {
        status: 'failed',
        progress: 0,
        progressMessage: error || 'Task failed',
      });

      // Emit failure event for async agents waiting for completion
      this.eventEmitter.emit(`task.completion.${taskId}`, {
        error: error || 'Task failed',
      });

      return {
        success: true,
        message: 'Task marked as failed',
      };
    }

    // Success case - update task and create deliverable
    // Extract deliverable type from results if available
    const resultsObj = results as
      | { type?: string; payload?: { type?: string } }
      | undefined;
    const deliverableType =
      resultsObj?.type || resultsObj?.payload?.type || null;

    await this.taskUpdateService.updateTask(taskId, userId, {
      status: 'completed',
      progress: 100,
      progressMessage: 'Task completed successfully',
      response: results ? JSON.stringify(results) : undefined,
      ...(deliverableType && { deliverableType }),
    });

    // Create deliverable with results
    if (results && conversationId) {
      // Format results based on agent type
      const formattedContent = this.formatCompletionResults(agentSlug, results);

      await this.deliverablesService.create(
        {
          title: `Results from ${agentSlug}`,
          conversationId,
          agentName: agentSlug,
          initialContent: formattedContent,
          initialFormat: DeliverableFormat.MARKDOWN,
          initialCreationType: DeliverableVersionCreationType.CONVERSATION_TASK,
          initialTaskId: taskId,
          initialMetadata: {
            completedAt: new Date().toISOString(),
            agentSlug,
            organizationSlug: orgSlug,
          },
        },
        userId,
      );

      // Emit event for async agents waiting for completion
      this.eventEmitter.emit(`task.completion.${taskId}`, {
        deliverable: formattedContent,
      });
    }

    return {
      success: true,
      message: 'Task completed and deliverable created',
    };
  }

  /**
   * Format completion results from async agents into markdown
   */
  formatCompletionResults(agentSlug: string, results: unknown): string {
    // Handle marketing swarm specific format
    if (agentSlug.includes('marketing')) {
      const resultsObj = results as Record<string, unknown>;
      const sections: string[] = ['# Marketing Content Package\n'];

      if (resultsObj.webPost) {
        sections.push('## Web Post\n');
        sections.push(
          typeof resultsObj.webPost === 'string'
            ? resultsObj.webPost
            : JSON.stringify(resultsObj.webPost, null, 2),
        );
        sections.push('\n');
      }

      if (resultsObj.seoContent) {
        sections.push('## SEO Content\n');
        sections.push(
          typeof resultsObj.seoContent === 'string'
            ? resultsObj.seoContent
            : JSON.stringify(resultsObj.seoContent, null, 2),
        );
        sections.push('\n');
      }

      if (resultsObj.socialMedia) {
        sections.push('## Social Media\n');
        sections.push(
          typeof resultsObj.socialMedia === 'string'
            ? resultsObj.socialMedia
            : JSON.stringify(resultsObj.socialMedia, null, 2),
        );
        sections.push('\n');
      }

      return sections.join('\n');
    }

    // Default format - JSON
    return '```json\n' + JSON.stringify(results, null, 2) + '\n```';
  }
}
