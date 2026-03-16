import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import { DATABASE_SERVICE, DatabaseService, QueryResult } from '@/database';
import {
  CreateVersionDto,
  DeliverableVersionCreationType,
  DeliverableFormat,
  RerunWithLLMDto,
} from './dto';
import { DeliverableVersion } from './entities/deliverable.entity';
import { LLM_SERVICE, LLMServiceProvider } from '@/planes/llm/llm.interface';
import { Task } from '@/agent2agent/types/agent-conversations.types';
import { snakeToCamel } from '@/utils/case-converter';
import { ExecutionContext } from '@orchestrator-ai/transport-types';

/**
 * Database record type for deliverable_versions table
 */
interface DeliverableVersionDbRecord {
  id: string;
  deliverable_id: string;
  version_number: number;
  content: string;
  format: string;
  is_current_version: boolean;
  created_by_type: string;
  task_id?: string | null;
  metadata?: Record<string, unknown>;
  file_attachments?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  [key: string]: unknown;
}

@Injectable()
export class DeliverableVersionsService {
  private readonly logger = new Logger(DeliverableVersionsService.name);

  constructor(
    @Inject(DATABASE_SERVICE) private readonly db: DatabaseService,
    @Inject(LLM_SERVICE)
    private readonly llmService: LLMServiceProvider,
  ) {}

  /**
   * Create a new version of an existing deliverable
   */
  async createVersion(
    createVersionDto: CreateVersionDto,
    executionContext: ExecutionContext,
  ): Promise<DeliverableVersion> {
    const deliverableId = executionContext.deliverableId;
    try {
      // Verify deliverable exists and belongs to user
      await this.verifyDeliverableOwnership(executionContext);

      // Get the next version number
      const nextVersionNumber = await this.getNextVersionNumber(deliverableId);

      this.logger.debug(
        `Creating deliverable version: deliverableId=${deliverableId}, nextVersion=${nextVersionNumber}, createdBy=${createVersionDto.createdByType}, taskId=${createVersionDto.taskId}`,
      );

      // Mark all previous versions as not current
      await this.markPreviousVersionsAsNotCurrent(deliverableId);

      // Create new version
      const { data: rawNewVersionData, error: insertError } = (await this.db
        .from(null, 'deliverable_versions')
        .insert([
          {
            deliverable_id: deliverableId,
            version_number: nextVersionNumber,
            content: createVersionDto.content,
            format: createVersionDto.format,
            is_current_version: true,
            created_by_type: createVersionDto.createdByType,
            task_id: createVersionDto.taskId || null,
            metadata: createVersionDto.metadata || {},
            file_attachments: createVersionDto.fileAttachments || {},
          },
        ])
        .select('*')
        .single()) as QueryResult<unknown>;

      const newVersionData = rawNewVersionData as Record<
        string,
        unknown
      > | null;

      if (insertError) {
        const errorMsg =
          insertError &&
          typeof insertError === 'object' &&
          'message' in insertError
            ? (insertError as Error).message
            : typeof insertError === 'string'
              ? insertError
              : JSON.stringify(insertError);
        throw new BadRequestException(`Failed to create version: ${errorMsg}`);
      }

      return this.mapToVersion(newVersionData);
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }

      throw new BadRequestException('Failed to create version');
    }
  }

  /**
   * Get version history for a deliverable
   */
  async getVersionHistory(
    executionContext: ExecutionContext,
  ): Promise<DeliverableVersion[]> {
    const deliverableId = executionContext.deliverableId;
    try {
      // Verify deliverable ownership
      await this.verifyDeliverableOwnership(executionContext);

      // Get all versions for this deliverable
      const { data: result, error } = (await this.db
        .from(null, 'deliverable_versions')
        .select('*')
        .eq('deliverable_id', deliverableId)
        .order('version_number', { ascending: true })) as QueryResult<unknown>;

      if (error) {
        throw new BadRequestException(
          `Failed to get version history: ${error.message}`,
        );
      }

      const data = result as DeliverableVersionDbRecord[] | null;
      const versions = (data || []).map((item) => this.mapToVersion(item));

      return versions;
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }

      throw new BadRequestException('Failed to get version history');
    }
  }

  /**
   * Get a specific version by ID
   */
  async getVersion(
    versionId: string,
    executionContext: ExecutionContext,
  ): Promise<DeliverableVersion> {
    try {
      const { data: rawData, error } = (await this.db
        .from(null, 'deliverable_versions')
        .select('*')
        .eq('id', versionId)
        .single()) as QueryResult<unknown>;

      const data = rawData as Record<string, unknown> | null;

      if (error) {
        if ((error as { code?: string }).code === 'PGRST116') {
          throw new NotFoundException(`Version not found: ${versionId}`);
        }

        const errorMsg =
          error && typeof error === 'object' && 'message' in error
            ? (error as Error).message
            : typeof error === 'string'
              ? error
              : JSON.stringify(error);
        throw new BadRequestException(`Failed to find version: ${errorMsg}`);
      }

      if (!data) {
        throw new NotFoundException(`Version not found: ${versionId}`);
      }

      // Verify the deliverable belongs to the user
      const deliverableExecutionContext: ExecutionContext = {
        ...executionContext,
        deliverableId: data.deliverable_id as string,
      };
      await this.verifyDeliverableOwnership(deliverableExecutionContext);

      return this.mapToVersion(data);
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }

      throw new BadRequestException('Failed to get version');
    }
  }

  /**
   * Get the current version of a deliverable
   */
  async getCurrentVersion(
    executionContext: ExecutionContext,
  ): Promise<DeliverableVersion | null> {
    const deliverableId = executionContext.deliverableId;
    try {
      // Verify deliverable ownership
      await this.verifyDeliverableOwnership(executionContext);

      const { data: rawCurrentData, error } = (await this.db
        .from(null, 'deliverable_versions')
        .select('*')
        .eq('deliverable_id', deliverableId)
        .eq('is_current_version', true)
        .maybeSingle()) as QueryResult<unknown>;

      const data = rawCurrentData as Record<string, unknown> | null;

      if (error) {
        throw new BadRequestException('Failed to find current version');
      }

      if (data) {
        return this.mapToVersion(data);
      } else {
        // Check if any versions exist at all
        const { data: result, error: allVersionsError } = (await this.db
          .from(null, 'deliverable_versions')
          .select('id, version_number, is_current_version')
          .eq('deliverable_id', deliverableId)) as QueryResult<unknown>;

        const allVersions = result as Array<{
          id: string;
          version_number: number;
          is_current_version: boolean;
        }> | null;

        if (allVersionsError) {
          this.logger.error(
            `Failed to list versions for deliverable ${deliverableId}`,
            allVersionsError,
          );
        } else if (!allVersions || allVersions.length === 0) {
          this.logger.debug(
            `No deliverable versions exist yet for ${deliverableId}`,
          );
        } else {
          this.logger.warn(
            `Deliverable ${deliverableId} has ${allVersions.length} versions but none marked as current`,
          );
        }

        return null;
      }
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }

      throw new BadRequestException('Failed to get current version');
    }
  }

  /**
   * Set a specific version as the current version
   */
  async setCurrentVersion(
    versionId: string,
    executionContext: ExecutionContext,
  ): Promise<DeliverableVersion> {
    try {
      // Get the version and verify ownership
      const version = await this.getVersion(versionId, executionContext);

      // Mark all versions for this deliverable as not current
      await this.markPreviousVersionsAsNotCurrent(version.deliverableId);

      // Set this version as current
      const { data: rawSetData, error } = (await this.db
        .from(null, 'deliverable_versions')
        .update({ is_current_version: true })
        .eq('id', versionId)
        .select('*')
        .single()) as QueryResult<unknown>;

      const data = rawSetData as Record<string, unknown> | null;

      if (error) {
        const errorMsg =
          error && typeof error === 'object' && 'message' in error
            ? (error as Error).message
            : typeof error === 'string'
              ? error
              : JSON.stringify(error);
        throw new BadRequestException(
          `Failed to set current version: ${errorMsg}`,
        );
      }

      return this.mapToVersion(data);
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }

      throw new BadRequestException('Failed to set current version');
    }
  }

  /**
   * Delete a specific version (cannot delete current version)
   */
  async deleteVersion(
    versionId: string,
    executionContext: ExecutionContext,
  ): Promise<{ success: boolean; message: string }> {
    try {
      // Get the version and verify ownership
      const version = await this.getVersion(versionId, executionContext);

      // Prevent deletion of current version (as per PRD requirement)
      if (version.isCurrentVersion) {
        const message =
          'Cannot delete the current version. Please set a different version as current first.';

        return { success: false, message };
      }

      // Delete the version
      const { error } = (await this.db
        .from(null, 'deliverable_versions')
        .delete()
        .eq('id', versionId)) as QueryResult<unknown>;

      if (error) {
        throw new BadRequestException(
          `Failed to delete version: ${error.message}`,
        );
      }

      const successMessage = `Version ${version.versionNumber} deleted successfully`;

      return { success: true, message: successMessage };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }

      throw new BadRequestException('Failed to delete version');
    }
  }

  /**
   * Copy an existing version to a new version (same content/format/metadata)
   */
  async copyVersion(
    versionId: string,
    executionContext: ExecutionContext,
  ): Promise<DeliverableVersion> {
    const source = await this.getVersion(versionId, executionContext);
    const createVersionDto: CreateVersionDto = {
      content: source.content || '',
      format: source.format,
      createdByType: DeliverableVersionCreationType.MANUAL_EDIT,
      metadata: {
        ...(source.metadata || {}),
        copiedFromVersionId: versionId,
        copiedAt: new Date().toISOString(),
      },
    };
    return this.createVersion(createVersionDto, executionContext);
  }

  /**
   * Enhance an existing version using LLM and create a new version
   */
  async enhanceVersion(
    versionId: string,
    dto: {
      instruction: string;
      temperature?: number;
      maxTokens?: number;
    },
    executionContext: ExecutionContext,
  ): Promise<DeliverableVersion> {
    const source = await this.getVersion(versionId, executionContext);

    // Build prompts
    const systemPrompt =
      'You are a concise, high-quality editor. Improve the given content according to the user instruction without changing factual meaning. Maintain original format.';
    const userMessage = `Instruction:\n${dto.instruction}\n\n---\n\nOriginal Content (${source.format}):\n\n${source.content}`;

    // Provider/model comes from ExecutionContext
    const response = await this.llmService.generateUnifiedResponse({
      provider: executionContext.provider,
      model: executionContext.model,
      systemPrompt,
      userMessage,
      options: {
        temperature: dto.temperature,
        maxTokens: dto.maxTokens,
        includeMetadata: true,
        callerType: 'service',
        callerName: 'deliverable-versions',
        executionContext,
      },
    });

    const content = typeof response === 'string' ? response : response.content;
    const responseObj =
      typeof response === 'string'
        ? undefined
        : (response as unknown as Record<string, unknown>);
    const metadata = responseObj?.metadata as
      | Record<string, unknown>
      | undefined;
    const piiMetadata = responseObj?.piiMetadata as
      | Record<string, unknown>
      | undefined;

    const createVersionDto: CreateVersionDto = {
      content,
      format: source.format,
      createdByType: DeliverableVersionCreationType.AI_ENHANCEMENT,
      taskId: source.taskId,
      metadata: {
        ...(source.metadata || {}),
        enhancedFromVersionId: versionId,
        enhancementAt: new Date().toISOString(),
        enhancementInstruction: dto.instruction,
        llmMetadata: metadata
          ? {
              provider: metadata.provider as string | undefined,
              model: metadata.model as string | undefined,
              inputTokens: (
                metadata.usage as Record<string, unknown> | undefined
              )?.inputTokens as number | undefined,
              outputTokens: (
                metadata.usage as Record<string, unknown> | undefined
              )?.outputTokens as number | undefined,
              cost: (metadata.usage as Record<string, unknown> | undefined)
                ?.cost as number | undefined,
              duration: (metadata.timing as Record<string, unknown> | undefined)
                ?.duration as number | undefined,
            }
          : undefined,
        piiMetadata,
      },
    };

    const enhanceExecutionContext: ExecutionContext = {
      ...executionContext,
      deliverableId: source.deliverableId,
    };
    return this.createVersion(createVersionDto, enhanceExecutionContext);
  }

  /**
   * Merge multiple versions into a new version using LLM
   */
  async mergeVersions(
    versionIds: string[],
    mergePrompt: string,
    executionContext: ExecutionContext,
  ): Promise<{ newVersion: DeliverableVersion; conflictSummary?: string }> {
    const deliverableId = executionContext.deliverableId;
    try {
      // Verify deliverable ownership
      await this.verifyDeliverableOwnership(executionContext);

      // Validate that we have at least 2 versions to merge
      if (versionIds.length < 2) {
        throw new BadRequestException(
          'At least 2 versions are required for merging',
        );
      }

      // Get all versions to merge and verify they exist and belong to the deliverable
      const versions = await Promise.all(
        versionIds.map(async (versionId) => {
          const version = await this.getVersion(versionId, executionContext);
          if (version.deliverableId !== deliverableId) {
            throw new BadRequestException(
              `Version ${versionId} does not belong to deliverable ${deliverableId}`,
            );
          }
          return version;
        }),
      );

      // Use LLM to intelligently merge the versions
      const mergedContent = await this.performLLMMerge(
        versions,
        mergePrompt,
        executionContext,
      );

      // Create new version with merged content
      const createVersionDto: CreateVersionDto = {
        content: mergedContent.content,
        format: versions[0]?.format || this.getMostCommonFormat(versions), // Use format from first version or most common
        createdByType: DeliverableVersionCreationType.CONVERSATION_MERGE,
        metadata: {
          mergedFromVersionIds: versionIds,
          mergePrompt: mergePrompt,
          mergedAt: new Date().toISOString(),
          llmMetadata: mergedContent.metadata
            ? (() => {
                const metadata = mergedContent.metadata;
                const usage = metadata.usage as Record<string, unknown>;
                const timing = metadata.timing as Record<string, unknown>;
                return {
                  provider: metadata.provider,
                  model: metadata.model,
                  inputTokens: usage?.inputTokens,
                  outputTokens: usage?.outputTokens,
                  cost: usage?.cost,
                  duration: timing?.duration,
                };
              })()
            : undefined,
        },
      };

      const newVersion = await this.createVersion(
        createVersionDto,
        executionContext,
      );

      return {
        newVersion,
        conflictSummary: mergedContent.conflictSummary,
      };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }

      throw new BadRequestException('Failed to merge versions');
    }
  }

  /**
   * Create a new version from a task-based prompt
   */
  async createVersionFromTask(
    taskPrompt: string,
    executionContext: ExecutionContext,
    baseVersionId?: string,
  ): Promise<DeliverableVersion> {
    try {
      // Verify deliverable ownership
      await this.verifyDeliverableOwnership(executionContext);

      // Get base version (current version if not specified)
      const baseVersion = baseVersionId
        ? await this.getVersion(baseVersionId, executionContext)
        : await this.getCurrentVersion(executionContext);

      if (!baseVersion) {
        throw new BadRequestException(
          'No base version found for task-based modification',
        );
      }

      // TODO: Integrate with LLM service for task-based content modification
      // For now, append the task prompt as a comment
      const modifiedContent = this.performTaskBasedModification(
        baseVersion.content || '',
        taskPrompt,
      );

      // Create new version with modified content
      const createVersionDto: CreateVersionDto = {
        content: modifiedContent,
        format:
          baseVersion.format || this.detectFormatFromContent(modifiedContent),
        createdByType: DeliverableVersionCreationType.CONVERSATION_TASK,
        metadata: {
          baseVersionId: baseVersion.id,
          taskPrompt: taskPrompt,
          modifiedAt: new Date().toISOString(),
        },
      };

      return await this.createVersion(createVersionDto, executionContext);
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }

      throw new BadRequestException('Failed to create version from task');
    }
  }

  /**
   * Get task by ID (internal method to avoid circular dependency)
   */
  private async getTaskById(
    taskId: string,
    executionContext: ExecutionContext,
  ): Promise<Task | null> {
    const userId = executionContext.userId;
    try {
      const { data: rawTaskData, error } = (await this.db
        .from(null, 'tasks')
        .select('*')
        .eq('id', taskId)
        .eq('user_id', userId)
        .single()) as QueryResult<unknown>;

      const data = rawTaskData as Record<string, unknown> | null;

      if (error) {
        this.logger.error(`Error fetching task ${taskId}:`, error);
        return null;
      }

      if (!data) {
        return null;
      }

      // Convert snake_case to camelCase
      return snakeToCamel(data) as Task;
    } catch (error) {
      this.logger.error(`Failed to fetch task ${taskId}:`, error);
      return null;
    }
  }

  /**
   * Re-run a deliverable version with a different LLM
   */
  async rerunWithDifferentLLM(
    versionId: string,
    rerunDto: RerunWithLLMDto,
    executionContext: ExecutionContext,
  ): Promise<DeliverableVersion> {
    try {
      // Get the source version
      const sourceVersion = await this.getVersion(versionId, executionContext);
      if (!sourceVersion) {
        throw new NotFoundException('Source version not found');
      }

      // Verify deliverable ownership
      const verifyExecutionContext: ExecutionContext = {
        ...executionContext,
        deliverableId: sourceVersion.deliverableId,
      };
      await this.verifyDeliverableOwnership(verifyExecutionContext);

      // Get the original task to retrieve the prompt
      if (!sourceVersion.taskId) {
        throw new BadRequestException(
          'Cannot rerun: source version has no associated task',
        );
      }

      const originalTask = await this.getTaskById(
        sourceVersion.taskId,
        executionContext,
      );
      if (!originalTask) {
        throw new BadRequestException('Cannot rerun: original task not found');
      }

      if (!originalTask.prompt) {
        throw new BadRequestException(
          'Cannot rerun: original task has no prompt',
        );
      }

      // Extract agent information from source version metadata
      const metadata = sourceVersion.metadata as Record<string, unknown>;
      const agentName = (metadata?.agentName as string) || 'unknown';
      const agentType = (metadata?.agentType as string) || 'context';

      // Create system prompt based on agent type and original context
      const systemPrompt = this.buildSystemPromptForRerun(
        agentName,
        agentType,
        sourceVersion,
      );

      this.logger.debug(
        `🔄 [RERUN] Calling LLM with provider=${rerunDto.provider}, model=${rerunDto.model}`,
      );

      // Call LLM service with new model
      const llmResponse = await this.llmService.generateUnifiedResponse({
        provider: rerunDto.provider,
        model: rerunDto.model,
        systemPrompt: systemPrompt,
        userMessage: originalTask.prompt,
        options: {
          temperature: rerunDto.temperature,
          maxTokens: rerunDto.maxTokens,
          callerType: 'deliverable_rerun',
          callerName: `${agentName}_rerun`,
          includeMetadata: true, // We need the full response object
          executionContext,
        },
      });

      this.logger.debug(`🔄 [RERUN] LLM response received successfully`);

      // Handle string | LLMResponse union type
      const responseContent =
        typeof llmResponse === 'string' ? llmResponse : llmResponse.content;
      const responseMetadata =
        typeof llmResponse === 'object' ? llmResponse.metadata : undefined;
      const responsePiiMetadata =
        typeof llmResponse === 'object' ? llmResponse.piiMetadata : undefined;

      // Create new version with LLM response
      const createVersionDto: CreateVersionDto = {
        content: responseContent,
        format: sourceVersion.format || DeliverableFormat.MARKDOWN,
        createdByType: DeliverableVersionCreationType.LLM_RERUN,
        taskId: sourceVersion.taskId,
        metadata: {
          ...sourceVersion.metadata,
          sourceVersionId: versionId,
          rerunAt: new Date().toISOString(),
          llmRerunInfo: {
            provider: rerunDto.provider,
            model: rerunDto.model,
            temperature: rerunDto.temperature,
            maxTokens: rerunDto.maxTokens,
          },
          llmMetadata: responseMetadata
            ? {
                runId: responseMetadata.requestId, // requestId is the correct property name
                provider: responseMetadata.provider,
                model: responseMetadata.model,
                inputTokens: responseMetadata.usage?.inputTokens,
                outputTokens: responseMetadata.usage?.outputTokens,
                cost: responseMetadata.usage?.cost,
                duration: responseMetadata.timing?.duration,
              }
            : undefined,
          // Note: routingDecision not available in new unified response interface
          piiMetadata: responsePiiMetadata,
        },
      };

      const rerunExecutionContext: ExecutionContext = {
        ...executionContext,
        deliverableId: sourceVersion.deliverableId,
      };
      const newVersion = await this.createVersion(
        createVersionDto,
        rerunExecutionContext,
      );

      this.logger.log(
        `🔄 Deliverable rerun completed: Version ${newVersion.versionNumber} created with ${rerunDto.provider}/${rerunDto.model} for deliverable ${sourceVersion.deliverableId}`,
      );

      return newVersion;
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }

      this.logger.error(
        'Failed to rerun deliverable with different LLM:',
        error,
      );
      this.logger.error('Error details:', {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        name: error instanceof Error ? error.name : 'Unknown',
      });

      // Include the actual error message in the BadRequestException
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';
      throw new BadRequestException(
        `Failed to rerun deliverable with different LLM: ${errorMessage}`,
      );
    }
  }

  // Private helper methods

  private async verifyDeliverableOwnership(
    executionContext: ExecutionContext,
  ): Promise<void> {
    const deliverableId = executionContext.deliverableId;
    const userId = executionContext.userId;
    try {
      // First, check if the deliverable exists at all (without user_id filter for debugging)
      const { data: result, error: checkError } = (await this.db
        .from(null, 'deliverables')
        .select('id, user_id')
        .eq('id', deliverableId)
        .single()) as QueryResult<unknown>;

      const deliverableCheck = result as { id: string; user_id: string } | null;

      if (checkError) {
        // If it's a schema or connection error, we'll see it here
        throw new NotFoundException(
          `Database error checking deliverable: ${checkError.message || checkError.code || 'unknown error'}`,
        );
      }

      if (!deliverableCheck) {
        throw new NotFoundException(`Deliverable not found: ${deliverableId}`);
      }

      if (deliverableCheck.user_id !== userId) {
        throw new NotFoundException(`Deliverable not found: ${deliverableId}`);
      }
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new NotFoundException(
        `Failed to verify deliverable ownership: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  private async getNextVersionNumber(deliverableId: string): Promise<number> {
    const { data: result, error } = (await this.db
      .from(null, 'deliverable_versions')
      .select('version_number')
      .eq('deliverable_id', deliverableId)
      .order('version_number', { ascending: false })
      .limit(1)
      .maybeSingle()) as QueryResult<unknown>;

    const lastVersion = result as { version_number: number } | null;

    if (error) {
      throw new BadRequestException('Failed to determine version number');
    }

    return lastVersion ? lastVersion.version_number + 1 : 1;
  }

  private async markPreviousVersionsAsNotCurrent(
    deliverableId: string,
  ): Promise<void> {
    const { error } = (await this.db
      .from(null, 'deliverable_versions')
      .update({ is_current_version: false })
      .eq('deliverable_id', deliverableId)) as QueryResult<unknown>;

    if (error) {
      throw new BadRequestException('Failed to update previous versions');
    }
  }

  private mapToVersion(
    data: Record<string, unknown> | null,
  ): DeliverableVersion {
    if (!data) {
      throw new BadRequestException('Invalid version data');
    }
    return {
      id: data.id as string,
      deliverableId: data.deliverable_id as string,
      versionNumber: data.version_number as number,
      content: data.content as string,
      format: data.format as DeliverableFormat,
      isCurrentVersion: data.is_current_version as boolean,
      createdByType: data.created_by_type as DeliverableVersionCreationType,
      taskId: (data.task_id as string) || undefined,
      metadata: (data.metadata as Record<string, unknown>) || {},
      fileAttachments: (data.file_attachments as Record<string, unknown>) || {},
      createdAt: new Date(data.created_at as string | number | Date),
      updatedAt: new Date(data.updated_at as string | number | Date),
    };
  }

  /**
   * Perform LLM-based merge of multiple version contents
   */
  private async performLLMMerge(
    versions: DeliverableVersion[],
    mergePrompt: string,
    executionContext: ExecutionContext,
  ): Promise<{
    content: string;
    conflictSummary?: string;
    metadata?: Record<string, unknown>;
  }> {
    // Build version contents for LLM
    const versionContents = versions
      .map(
        (version) =>
          `=== VERSION ${version.versionNumber} (Created: ${version.createdAt instanceof Date ? version.createdAt.toISOString() : String(version.createdAt)}) ===\n${version.content || ''}`,
      )
      .join('\n\n---\n\n');

    // Build prompts for LLM
    const systemPrompt = `You are an expert content merger. Your task is to intelligently merge multiple versions of content into a single, coherent version.

When merging:
1. Preserve all unique information from all versions
2. Resolve conflicts by choosing the most recent or most complete information
3. Maintain the format and style of the original content
4. If there are contradictions, note them in the output
5. Follow the user's merge instructions carefully`;

    const userMessage = `Please merge the following ${versions.length} versions of content according to these instructions:

MERGE INSTRUCTIONS:
${mergePrompt}

VERSIONS TO MERGE:
${versionContents}

Please output ONLY the merged content, maintaining the same format as the original versions.`;

    // Use LLM to generate merged content - provider/model comes from ExecutionContext
    const response = await this.llmService.generateUnifiedResponse({
      provider: executionContext.provider,
      model: executionContext.model,
      systemPrompt,
      userMessage,
      options: {
        temperature: 0.3, // Lower temperature for more consistent merging
        maxTokens: 4096,
        includeMetadata: true,
        callerType: 'service',
        callerName: 'deliverable-versions-merge',
        executionContext,
      },
    });

    const content = typeof response === 'string' ? response : response.content;
    const responseMetadata =
      typeof response === 'string'
        ? undefined
        : (response.metadata as unknown as Record<string, unknown> | undefined);

    return {
      content,
      conflictSummary: `Successfully merged ${versions.length} versions using LLM (${executionContext.provider}/${executionContext.model})`,
      metadata: responseMetadata,
    };
  }

  /**
   * Perform task-based content modification using LLM
   * TODO: Integrate with actual LLM service
   */
  private performTaskBasedModification(
    baseContent: string,
    taskPrompt: string,
  ): string {
    // Placeholder implementation - will be replaced with actual LLM integration
    return `${baseContent}\n\n=== TASK MODIFICATION ===\n${taskPrompt}\n\n[TODO: This will be replaced with LLM-modified content]`;
  }

  /**
   * Detect format from content using simple heuristics
   */
  private detectFormatFromContent(content: string): DeliverableFormat {
    if (!content) return DeliverableFormat.TEXT;

    const trimmedContent = content.trim();

    // Check for JSON
    if (
      (trimmedContent.startsWith('{') && trimmedContent.endsWith('}')) ||
      (trimmedContent.startsWith('[') && trimmedContent.endsWith(']'))
    ) {
      try {
        JSON.parse(trimmedContent);
        return DeliverableFormat.JSON;
      } catch {
        // Not valid JSON, continue checking
      }
    }

    // Check for HTML
    if (
      trimmedContent.includes('<html') ||
      trimmedContent.includes('<!DOCTYPE') ||
      (trimmedContent.includes('<') && trimmedContent.includes('>'))
    ) {
      return DeliverableFormat.HTML;
    }

    // Check for Markdown
    if (
      content.includes('```') ||
      content.includes('#') ||
      content.includes('**') ||
      content.includes('__') ||
      (content.includes('[') && content.includes(']('))
    ) {
      return DeliverableFormat.MARKDOWN;
    }

    // Default to plain text
    return DeliverableFormat.TEXT;
  }

  /**
   * Get the most common format from a list of versions
   */
  private getMostCommonFormat(
    versions: DeliverableVersion[],
  ): DeliverableFormat {
    if (versions.length === 0) return DeliverableFormat.TEXT;

    const formatCounts = versions.reduce(
      (acc, v) => {
        if (v.format) {
          acc[v.format] = (acc[v.format] || 0) + 1;
        }
        return acc;
      },
      {} as Record<string, number>,
    );

    const mostCommon = Object.entries(formatCounts).sort(
      ([, a], [, b]) => b - a,
    )[0]?.[0];

    return (mostCommon as DeliverableFormat) || DeliverableFormat.TEXT;
  }

  /**
   * Build system prompt for LLM rerun based on agent type and context
   */
  private buildSystemPromptForRerun(
    agentName: string,
    agentType: string,
    sourceVersion: DeliverableVersion,
  ): string {
    const basePrompt = `You are ${agentName}, a ${agentType} agent. You are re-running a previous task with a different LLM model.`;

    // Add context from the original version if available
    let contextPrompt = '';
    if (sourceVersion.metadata?.conversationId) {
      contextPrompt += ' This is part of an ongoing conversation.';
    }

    // Add format guidance
    const formatGuidance =
      sourceVersion.format === DeliverableFormat.MARKDOWN
        ? ' Please format your response in Markdown.'
        : sourceVersion.format === DeliverableFormat.JSON
          ? ' Please format your response as valid JSON.'
          : sourceVersion.format === DeliverableFormat.HTML
            ? ' Please format your response as HTML.'
            : ' Please format your response as plain text.';

    return `${basePrompt}${contextPrompt}${formatGuidance}

Please provide a fresh response to the user's request. Do not reference this being a "rerun" or mention previous versions.`;
  }
}
