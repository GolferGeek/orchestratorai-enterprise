import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PlansRepository, PlanRecord } from '../repositories/plans.repository';
import { PlanVersionsService } from './plan-versions.service';
import type {
  JsonObject,
  PlanVersionData,
  ExecutionContext,
} from '@orchestrator-ai/transport-types';
import {
  IActionHandler,
  ActionResult,
} from '../../common/interfaces/action-handler.interface';
import type {
  Plan,
  PlanVersion,
  PlanCreateParams,
  PlanEditParams,
  PlanRerunParams,
  PlanSetCurrentParams,
  PlanTargetVersionParams,
  PlanMergeParams,
  PlanCopyParams,
} from '../types/plan.types';

/**
 * PlansService - Implements the mode × action architecture for plan operations
 *
 * Handles all 9 plan actions:
 * 1. create - Create or refine a plan
 * 2. read - Get current plan
 * 3. list - Get version history
 * 4. edit - Save manual edit as new version
 * 5. set_current - Switch current version
 * 6. delete_version - Delete a specific version
 * 7. merge_versions - LLM-based merge of multiple versions
 * 8. copy_version - Duplicate a version
 * 9. delete - Delete entire plan
 */
@Injectable()
export class PlansService implements IActionHandler {
  private readonly logger = new Logger(PlansService.name);

  constructor(
    private readonly plansRepo: PlansRepository,
    private readonly versionsService: PlanVersionsService,
  ) {}

  /**
   * Main entry point for all plan operations
   * Implements IActionHandler interface for mode × action routing
   */
  async executeAction<TResult = JsonObject | null>(
    action: string,
    params: unknown,
    context: ExecutionContext,
  ): Promise<ActionResult<TResult>> {
    try {
      this.logger.debug(
        `Executing plan action: ${action}`,
        JSON.stringify({ action, context }),
      );

      let result: unknown;

      switch (action) {
        case 'create': {
          const createParams = this.ensureObject<PlanCreateParams>(
            params,
            action,
          );
          result = await this.createOrRefine(createParams, context);
          break;
        }

        case 'read':
          result = await this.getCurrentPlan(context);
          break;

        case 'list':
          result = await this.getVersionHistory(context);
          break;

        case 'edit': {
          this.logger.debug(`🔖 [executeAction] Handling edit action`);
          const editParams = this.ensureObject<PlanEditParams>(params, action);
          this.logger.debug(`🔖 [executeAction] editParams validated`, {
            hasContent: !!editParams.content,
            contentLength: editParams.content?.length,
            hasMetadata: !!editParams.metadata,
          });
          result = await this.saveManualEdit(editParams, context);
          break;
        }

        case 'rerun': {
          const rerunParams = this.ensureObject<PlanRerunParams>(
            params,
            action,
          );
          result = await this.rerunWithDifferentLLM(rerunParams, context);
          break;
        }

        case 'set_current': {
          const setCurrentParams = this.ensureObject<PlanSetCurrentParams>(
            params,
            action,
          );
          result = await this.setCurrentVersion(setCurrentParams, context);
          break;
        }

        case 'delete_version': {
          const deleteParams = this.ensureObject<PlanTargetVersionParams>(
            params,
            action,
          );
          result = await this.deleteVersion(deleteParams, context);
          break;
        }

        case 'merge_versions': {
          const mergeParams = this.ensureObject<PlanMergeParams>(
            params,
            action,
          );
          result = await this.mergeVersions(mergeParams, context);
          break;
        }

        case 'copy_version': {
          const copyParams = this.ensureObject<PlanCopyParams>(params, action);
          result = await this.copyVersion(copyParams, context);
          break;
        }

        case 'delete':
          result = await this.deletePlan(context);
          break;

        default:
          throw new BadRequestException(`Unknown plan action: ${action}`);
      }

      return {
        success: true,
        data: result as TResult,
      };
    } catch (error) {
      this.logger.error(`Failed to execute plan action ${action}:`, error);
      return {
        success: false,
        error: {
          code:
            error instanceof BadRequestException
              ? 'BAD_REQUEST'
              : error instanceof NotFoundException
                ? 'NOT_FOUND'
                : 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
          details: {
            action,
            conversationId: context.conversationId,
            userId: context.userId,
          },
        },
      };
    }
  }

  private ensureObject<T extends object>(params: unknown, action: string): T {
    if (!params || typeof params !== 'object') {
      throw new BadRequestException(
        `Invalid payload for plan action "${action}"`,
      );
    }
    return params as T;
  }

  // ============================================================================
  // ACTION HANDLERS (Private methods - only executeAction is public)
  // ============================================================================

  /**
   * Action: create
   * Create a new plan or refine existing plan (creates new version)
   */
  private async createOrRefine(
    params: PlanCreateParams,
    context: ExecutionContext,
  ) {
    // Check if plan already exists for this conversation
    const existingPlan = await this.plansRepo.findByConversationId(
      context.conversationId,
      context.userId,
    );

    if (existingPlan) {
      // Refine existing plan - create new version
      const planContext: ExecutionContext = {
        ...context,
        planId: existingPlan.id,
      };

      const newVersion = await this.versionsService.createVersion(planContext, {
        content: params.content,
        format: params.format || 'markdown',
        createdByType: 'agent',
        taskId: params.taskId ?? context.taskId ?? undefined,
        metadata: params.metadata || {},
      });

      const plan = await this.findOne(planContext);
      return { plan, version: newVersion, isNew: false };
    } else {
      // Create new plan
      const planData = await this.plansRepo.create({
        conversation_id: context.conversationId,
        user_id: context.userId,
        agent_name: params.agentName ?? context.agentSlug ?? 'unknown',
        organization: params.organization || 'default',
        title: params.title,
      });

      // Create initial version
      const planContext: ExecutionContext = {
        ...context,
        planId: planData.id,
      };

      const initialVersion = await this.versionsService.createVersion(
        planContext,
        {
          content: params.content,
          format: params.format || 'markdown',
          createdByType: 'agent',
          taskId: params.taskId ?? context.taskId ?? undefined,
          metadata: params.metadata || {},
        },
      );

      const plan = await this.findOne(planContext);
      return { plan, version: initialVersion, isNew: true };
    }
  }

  /**
   * Action: read
   * Get current plan with current version
   */
  private async getCurrentPlan(context: ExecutionContext) {
    const plan = await this.plansRepo.findByConversationId(
      context.conversationId,
      context.userId,
    );

    if (!plan) {
      throw new NotFoundException(
        `No plan found for conversation ${context.conversationId}`,
      );
    }

    const planContext: ExecutionContext = {
      ...context,
      planId: plan.id,
    };

    const planWithVersion = await this.findOne(planContext);

    // Return in strict A2A protocol format: { plan, version }
    return {
      plan: {
        id: planWithVersion.id,
        conversationId: planWithVersion.conversationId,
        currentVersionId: planWithVersion.currentVersionId,
        createdAt: planWithVersion.createdAt.toISOString(),
        updatedAt: planWithVersion.updatedAt.toISOString(),
      },
      version: planWithVersion.currentVersion || null,
    };
  }

  /**
   * Action: list
   * Get version history for plan
   */
  private async getVersionHistory(context: ExecutionContext) {
    const plan = await this.plansRepo.findByConversationId(
      context.conversationId,
      context.userId,
    );

    if (!plan) {
      throw new NotFoundException(
        `No plan found for conversation ${context.conversationId}`,
      );
    }

    const planContext: ExecutionContext = {
      ...context,
      planId: plan.id,
    };

    const versions = await this.versionsService.getVersionHistory(planContext);

    return { plan: this.mapToPlan(plan), versions };
  }

  /**
   * Action: edit
   * Save manual edit as new version
   */
  private async saveManualEdit(
    params: PlanEditParams,
    context: ExecutionContext,
  ) {
    this.logger.debug(
      `🔖 [saveManualEdit] Starting with conversationId=${context.conversationId}, userId=${context.userId}`,
    );
    this.logger.debug(
      `🔖 [saveManualEdit] Params:`,
      JSON.stringify({
        contentLength: params.content?.length,
        metadata: params.metadata,
      }),
    );

    const plan = await this.plansRepo.findByConversationId(
      context.conversationId,
      context.userId,
    );

    if (!plan) {
      this.logger.error(
        `❌ [saveManualEdit] No plan found for conversation ${context.conversationId}`,
      );
      throw new NotFoundException(
        `No plan found for conversation ${context.conversationId}`,
      );
    }

    this.logger.debug(`🔖 [saveManualEdit] Found plan ${plan.id}`);

    const planContext: ExecutionContext = {
      ...context,
      planId: plan.id,
    };

    const currentVersion =
      await this.versionsService.getCurrentVersion(planContext);

    if (!currentVersion) {
      throw new NotFoundException(`No current version found for plan`);
    }

    this.logger.debug(
      `🔖 [saveManualEdit] Creating new version from currentVersion ${currentVersion.id}`,
    );

    const newVersion = await this.versionsService.createVersion(planContext, {
      content: params.content,
      format: currentVersion.format,
      createdByType: 'user',
      metadata: {
        ...params.metadata,
        editedFromVersionId: currentVersion.id,
        editedAt: new Date().toISOString(),
      },
    });

    this.logger.debug(
      `✅ [saveManualEdit] Created new version ${newVersion.id}, versionNumber=${newVersion.versionNumber}`,
    );

    return { plan: this.mapToPlan(plan), version: newVersion };
  }

  /**
   * Action: rerun
   * Rerun plan generation with different LLM settings
   */
  private async rerunWithDifferentLLM(
    params: PlanRerunParams,
    context: ExecutionContext,
  ) {
    const { provider, model, temperature, maxTokens } = params.config;

    this.logger.debug(
      `🔄 [PLAN RERUN] versionId=${params.versionId}, provider=${provider}, model=${model}`,
    );

    const plan = await this.plansRepo.findByConversationId(
      context.conversationId,
      context.userId,
    );

    if (!plan) {
      throw new NotFoundException(
        `No plan found for conversation ${context.conversationId}`,
      );
    }

    const planContext: ExecutionContext = {
      ...context,
      planId: plan.id,
    };

    return this.versionsService.rerunWithDifferentLLM(
      params.versionId,
      {
        provider,
        model,
        temperature,
        maxTokens,
      },
      planContext,
    );
  }

  /**
   * Action: set_current
   * Set a specific version as current
   */
  private async setCurrentVersion(
    params: { versionId: string },
    context: ExecutionContext,
  ) {
    // First, get the plan to construct full context
    const plan = await this.plansRepo.findByConversationId(
      context.conversationId,
      context.userId,
    );

    if (!plan) {
      throw new NotFoundException(
        `No plan found for conversation ${context.conversationId}`,
      );
    }

    const planContext: ExecutionContext = {
      ...context,
      planId: plan.id,
    };

    const version = await this.versionsService.setCurrentVersion(
      params.versionId,
      planContext,
    );

    const planWithVersion = await this.findOne(planContext);

    return { plan: planWithVersion, version };
  }

  /**
   * Action: delete_version
   * Delete a specific version
   */
  private async deleteVersion(
    params: { versionId: string },
    context: ExecutionContext,
  ) {
    const plan = await this.plansRepo.findByConversationId(
      context.conversationId,
      context.userId,
    );

    if (!plan) {
      throw new NotFoundException(
        `No plan found for conversation ${context.conversationId}`,
      );
    }

    const planContext: ExecutionContext = {
      ...context,
      planId: plan.id,
    };

    // Get version before deletion to get plan ID
    const version = await this.versionsService.findOne(
      params.versionId,
      planContext,
    );

    await this.versionsService.deleteVersion(params.versionId, planContext);

    const planData = await this.plansRepo.findById(
      version.planId,
      context.userId,
    );
    if (!planData) {
      throw new NotFoundException(`Plan not found: ${version.planId}`);
    }
    const remainingVersions =
      await this.versionsService.getVersionHistory(planContext);

    // Return in strict A2A protocol format for PlanDeleteVersionResponse
    return {
      deletedVersionId: params.versionId,
      plan: this.mapToPlan(planData),
      remainingVersions,
    };
  }

  /**
   * Action: merge_versions
   * Merge multiple versions using LLM
   */
  private async mergeVersions(
    params: {
      versionIds: string[];
      mergePrompt: string;
      planStructure?: unknown;
      llmConfig?: Record<string, unknown> | null;
      preferredFormat?: 'markdown' | 'json' | 'text';
    },
    context: ExecutionContext,
  ) {
    const plan = await this.plansRepo.findByConversationId(
      context.conversationId,
      context.userId,
    );

    if (!plan) {
      throw new NotFoundException(
        `No plan found for conversation ${context.conversationId}`,
      );
    }

    const planContext: ExecutionContext = {
      ...context,
      planId: plan.id,
    };

    const result = await this.versionsService.mergeVersions(
      planContext,
      params.versionIds,
      params.mergePrompt,
      {
        planStructure: params.planStructure,
        llmConfig: params.llmConfig,
        preferredFormat: params.preferredFormat,
      },
    );

    // Get source versions
    const sourceVersions = await Promise.all(
      params.versionIds.map((id) =>
        this.versionsService.findOne(id, planContext),
      ),
    );

    // Return in strict A2A protocol format for PlanMergeVersionsResponse
    return {
      plan: this.mapToPlan(plan),
      mergedVersion: result.newVersion,
      sourceVersions,
      llmMetadata: result.llmMetadata ?? undefined,
    };
  }

  /**
   * Action: copy_version
   * Duplicate a version as a new version
   */
  private async copyVersion(params: PlanCopyParams, context: ExecutionContext) {
    const plan = await this.plansRepo.findByConversationId(
      context.conversationId,
      context.userId,
    );

    if (!plan) {
      throw new NotFoundException(
        `No plan found for conversation ${context.conversationId}`,
      );
    }

    const planContext: ExecutionContext = {
      ...context,
      planId: plan.id,
    };

    const sourceVersion = await this.versionsService.findOne(
      params.versionId,
      planContext,
    );

    const copiedVersion = await this.versionsService.copyVersion(
      params.versionId,
      planContext,
    );

    const planData = await this.plansRepo.findById(
      copiedVersion.planId,
      context.userId,
    );
    if (!planData) {
      throw new NotFoundException(`Plan not found: ${copiedVersion.planId}`);
    }

    // Return in strict A2A protocol format for PlanCopyVersionResponse
    return {
      sourcePlan: this.mapToPlan(planData),
      sourceVersion,
      targetPlan: this.mapToPlan(planData), // Same plan for copy
      copiedVersion,
    };
  }

  /**
   * Action: delete
   * Delete entire plan and all versions
   */
  private async deletePlan(context: ExecutionContext) {
    const plan = await this.plansRepo.findByConversationId(
      context.conversationId,
      context.userId,
    );

    if (!plan) {
      throw new NotFoundException(
        `No plan found for conversation ${context.conversationId}`,
      );
    }

    const planContext: ExecutionContext = {
      ...context,
      planId: plan.id,
    };

    // Get version count before deletion
    const versions = await this.versionsService.getVersionHistory(planContext);
    const versionCount = versions.length;

    await this.plansRepo.delete(plan.id, context.userId);

    // Return in strict A2A protocol format for PlanDeleteResponse
    return {
      deletedPlanId: plan.id,
      deletedVersionCount: versionCount,
    };
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  /**
   * Find a plan by ID with current version
   */
  async findOne(executionContext: ExecutionContext): Promise<Plan> {
    const planData = await this.plansRepo.findById(
      executionContext.planId,
      executionContext.userId,
    );
    if (!planData) {
      throw new NotFoundException(`Plan not found: ${executionContext.planId}`);
    }

    const plan = this.mapToPlan(planData);

    // Get current version
    try {
      const currentVersion =
        await this.versionsService.getCurrentVersion(executionContext);
      if (currentVersion) {
        plan.currentVersion = this.mapPlanVersion(currentVersion);
      }
    } catch (error) {
      // Continue without current version
      this.logger.warn(
        `No current version found for plan ${executionContext.planId}`,
        error instanceof Error ? error : { message: String(error) },
      );
    }

    return plan;
  }

  /**
   * Find plan by conversation ID
   */
  async findByConversationId(
    executionContext: ExecutionContext,
  ): Promise<Plan | null> {
    const planData = await this.plansRepo.findByConversationId(
      executionContext.conversationId,
      executionContext.userId,
    );

    if (!planData) {
      return null;
    }

    const planContext: ExecutionContext = {
      ...executionContext,
      planId: planData.id,
    };

    return this.findOne(planContext);
  }

  /**
   * Map database record to Plan entity
   */
  private mapToPlan(data: PlanRecord): Plan {
    return {
      id: data.id,
      conversationId: data.conversation_id,
      userId: data.user_id,
      agentName: data.agent_name,
      organization: data.organization,
      title: data.title,
      currentVersionId: data.current_version_id,
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at),
      currentVersion: null,
    };
  }

  private mapPlanVersion(version: PlanVersion | null): PlanVersionData | null {
    if (!version) {
      return null;
    }

    const format: 'markdown' | 'json' =
      version.format === 'json' ? 'json' : 'markdown';

    return {
      id: version.id,
      planId: version.planId,
      versionNumber: version.versionNumber,
      content: version.content,
      format,
      createdByType: version.createdByType,
      createdById: version.createdById ?? null,
      taskId: version.taskId,
      metadata: version.metadata,
      isCurrentVersion: version.isCurrentVersion,
      createdAt: version.createdAt.toISOString(),
    };
  }
}
