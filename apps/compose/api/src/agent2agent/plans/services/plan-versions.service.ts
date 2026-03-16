import * as AjvModule from 'ajv';
import type {
  JsonObject,
  ExecutionContext,
} from '@orchestrator-ai/transport-types';
import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import {
  PlanVersionRecord,
  PlanVersionsRepository,
} from '../repositories/plan-versions.repository';
import { PlansRepository, PlanRecord } from '../repositories/plans.repository';
import { LLM_SERVICE, LLMServiceProvider } from '@/planes/llm/llm.interface';
import { TasksService } from '@/agent2agent/tasks/tasks.service';
import type {
  Plan,
  PlanVersion,
  CreatePlanVersionDto,
} from '../types/plan.types';

type AjvValidator = {
  (data: unknown): boolean;
  errors?: unknown[];
};

type AjvConstructor = new (options?: Record<string, unknown>) => {
  compile: (schema: unknown) => AjvValidator;
  errorsText: (errors?: unknown[], options?: { separator?: string }) => string;
};

function resolveAjvConstructor(): AjvConstructor {
  if (typeof AjvModule === 'function') {
    return AjvModule as unknown as AjvConstructor;
  }

  const maybeDefault = (AjvModule as unknown as { default?: AjvConstructor })
    .default;
  if (typeof maybeDefault === 'function') {
    return maybeDefault;
  }

  throw new Error('Ajv constructor is unavailable in this runtime');
}

const Ajv = resolveAjvConstructor();

@Injectable()
export class PlanVersionsService {
  private readonly logger = new Logger(PlanVersionsService.name);

  constructor(
    private readonly versionsRepo: PlanVersionsRepository,
    private readonly plansRepo: PlansRepository,
    @Inject(LLM_SERVICE)
    private readonly llmService: LLMServiceProvider,
    @Inject(forwardRef(() => TasksService))
    private readonly tasksService: TasksService,
  ) {}

  /**
   * Create a new version of a plan
   */
  async createVersion(
    executionContext: ExecutionContext,
    dto: CreatePlanVersionDto,
  ): Promise<PlanVersion> {
    const { planId, userId } = executionContext;

    // Verify plan exists and belongs to user
    const plan = await this.plansRepo.findById(planId, userId);
    if (!plan) {
      throw new NotFoundException(`Plan not found: ${planId}`);
    }

    // Get next version number
    const nextVersion = await this.versionsRepo.getNextVersionNumber(planId);

    // Mark all previous versions as not current
    await this.versionsRepo.markAllAsNotCurrent(planId);

    // Create new version
    const versionData = await this.versionsRepo.create({
      plan_id: planId,
      version_number: nextVersion,
      content: dto.content,
      format: dto.format,
      created_by_type: dto.createdByType,
      created_by_id: dto.createdById,
      task_id: dto.taskId,
      metadata: dto.metadata || {},
      is_current_version: true,
    });

    // Update plan's current_version_id
    await this.plansRepo.setCurrentVersion(planId, userId, versionData.id);

    return this.mapToVersion(versionData);
  }

  /**
   * Get current version of a plan
   */
  async getCurrentVersion(
    executionContext: ExecutionContext,
  ): Promise<PlanVersion | null> {
    const { planId, userId } = executionContext;

    // Verify plan exists and belongs to user
    const plan = await this.plansRepo.findById(planId, userId);
    if (!plan) {
      throw new NotFoundException(`Plan not found: ${planId}`);
    }

    const versionData = await this.versionsRepo.getCurrentVersion(planId);
    return versionData ? this.mapToVersion(versionData) : null;
  }

  /**
   * Get version history for a plan
   */
  async getVersionHistory(
    executionContext: ExecutionContext,
  ): Promise<PlanVersion[]> {
    const { planId, userId } = executionContext;

    // Verify plan exists and belongs to user
    const plan = await this.plansRepo.findById(planId, userId);
    if (!plan) {
      throw new NotFoundException(`Plan not found: ${planId}`);
    }

    const versions = await this.versionsRepo.findByPlanId(planId);
    return versions.map((v) => this.mapToVersion(v));
  }

  /**
   * Get specific version by ID
   */
  async findOne(
    versionId: string,
    executionContext: ExecutionContext,
  ): Promise<PlanVersion> {
    const { userId } = executionContext;

    const versionData = await this.versionsRepo.findById(versionId);
    if (!versionData) {
      throw new NotFoundException(`Plan version not found: ${versionId}`);
    }

    // Verify plan belongs to user
    const plan = await this.plansRepo.findById(versionData.plan_id, userId);
    if (!plan) {
      throw new NotFoundException(`Plan not found`);
    }

    return this.mapToVersion(versionData);
  }

  /**
   * Update a version (for manual edits)
   * Creates a new version instead of updating in place (immutable versioning)
   */
  async update(
    versionId: string,
    executionContext: ExecutionContext,
    content: string,
    metadata?: JsonObject,
  ): Promise<PlanVersion> {
    // Get the source version
    const sourceVersion = await this.findOne(versionId, executionContext);

    // Create a new version with updated content
    return this.createVersion(executionContext, {
      content,
      format: sourceVersion.format,
      createdByType: 'user',
      metadata: this.mergeMetadata(sourceVersion.metadata, {
        ...metadata,
        editedFromVersionId: versionId,
        editedAt: new Date().toISOString(),
      }),
    });
  }

  /**
   * Set a version as the current version
   */
  async setCurrentVersion(
    versionId: string,
    executionContext: ExecutionContext,
  ): Promise<PlanVersion> {
    const { userId } = executionContext;

    // Verify version exists and user owns the plan
    const version = await this.findOne(versionId, executionContext);

    // Mark all versions as not current
    await this.versionsRepo.markAllAsNotCurrent(version.planId);

    // Mark this version as current
    const versionData = await this.versionsRepo.markAsCurrent(versionId);

    // Update plan's current_version_id
    await this.plansRepo.setCurrentVersion(version.planId, userId, versionId);

    return this.mapToVersion(versionData);
  }

  /**
   * Copy a version to create a new version
   */
  async copyVersion(
    versionId: string,
    executionContext: ExecutionContext,
  ): Promise<PlanVersion> {
    const sourceVersion = await this.findOne(versionId, executionContext);

    return this.createVersion(executionContext, {
      content: sourceVersion.content,
      format: sourceVersion.format,
      createdByType: 'user',
      metadata: {
        ...sourceVersion.metadata,
        copiedFromVersionId: versionId,
        copiedAt: new Date().toISOString(),
      },
    });
  }

  /**
   * Delete a specific version (cannot delete current version)
   */
  async deleteVersion(
    versionId: string,
    executionContext: ExecutionContext,
  ): Promise<{ success: boolean; message: string }> {
    const version = await this.findOne(versionId, executionContext);

    // Prevent deletion of current version
    if (version.isCurrentVersion) {
      return {
        success: false,
        message:
          'Cannot delete the current version. Please set a different version as current first.',
      };
    }

    await this.versionsRepo.deleteVersion(versionId);

    return {
      success: true,
      message: `Version ${version.versionNumber} deleted successfully`,
    };
  }

  /**
   * Merge multiple versions into a new version using LLM assistance.
   */
  async mergeVersions(
    executionContext: ExecutionContext,
    versionIds: string[],
    mergePrompt: string,
    options?: {
      planStructure?: unknown;
      llmConfig?: Record<string, unknown> | null;
      preferredFormat?: 'markdown' | 'json' | 'text';
    },
  ): Promise<{
    newVersion: PlanVersion;
    conflictSummary?: string;
    llmMetadata?: JsonObject;
  }> {
    const { planId, userId } = executionContext;

    // Verify plan exists
    const plan = await this.plansRepo.findById(planId, userId);
    if (!plan) {
      throw new NotFoundException(`Plan not found: ${planId}`);
    }

    // Validate that we have at least 2 versions to merge
    if (!Array.isArray(versionIds) || versionIds.length < 2) {
      throw new BadRequestException(
        'At least 2 versions are required for merging',
      );
    }

    // Get all versions to merge
    const versions = await Promise.all(
      versionIds.map((id) => this.findOne(id, executionContext)),
    );

    if (versions.length !== versionIds.length) {
      throw new BadRequestException(
        'One or more plan versions could not be loaded for merging',
      );
    }

    // Verify all versions belong to the same plan
    for (const version of versions) {
      if (version.planId !== planId) {
        throw new BadRequestException(
          `Version ${version.id} does not belong to plan ${planId}`,
        );
      }
    }

    const normalizedPlanStructure = this.normalizePlanStructure(
      options?.planStructure,
    );
    const targetFormat = this.resolveTargetFormat(
      versions,
      options?.preferredFormat,
      normalizedPlanStructure,
    );
    const llmConfig = this.normalizeLlmConfig(options?.llmConfig);
    const systemPrompt = this.buildMergeSystemPrompt(targetFormat);
    const userMessage = this.buildMergeUserMessage(
      versions,
      mergePrompt,
      normalizedPlanStructure,
      targetFormat,
    );

    let llmResponseContent: string;
    let llmResponseMetadata: JsonObject | undefined;

    try {
      const response = await this.llmService.generateUnifiedResponse({
        provider: llmConfig.provider,
        model: llmConfig.model,
        systemPrompt,
        userMessage,
        options: {
          temperature: llmConfig.temperature,
          maxTokens: llmConfig.maxTokens,
          executionContext,
          callerType: 'plan_merge',
          callerName: `plan_merge_${plan.id}`,
          includeMetadata: true,
        },
      });

      if (typeof response === 'string') {
        llmResponseContent = response;
        llmResponseMetadata = this.mergeMetadata(undefined, {
          provider: llmConfig.provider,
          model: llmConfig.model,
        } as JsonObject);
      } else {
        llmResponseContent = response.content;
        const usageMetadata = response.metadata?.usage as
          | JsonObject
          | undefined;
        llmResponseMetadata = this.mergeMetadata(undefined, {
          provider: response.metadata?.provider ?? llmConfig.provider,
          model: response.metadata?.model ?? llmConfig.model,
          ...(usageMetadata ? { usage: usageMetadata } : {}),
        } as JsonObject);
      }
    } catch (error) {
      this.logger.error(
        `Failed to merge plan versions with LLM: ${
          error instanceof Error ? error.message : String(error)
        }`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new BadRequestException(
        `Failed to merge plan versions: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
    }

    const normalizedContent = this.normalizeMergedContent(
      llmResponseContent,
      targetFormat,
      normalizedPlanStructure,
    );

    // Create new version with merged content
    const llmMergeInfo: JsonObject = {
      provider: llmConfig.provider,
      model: llmConfig.model,
    } as JsonObject;
    if (llmConfig.temperature !== undefined) {
      llmMergeInfo.temperature = llmConfig.temperature;
    }
    if (llmConfig.maxTokens !== undefined) {
      llmMergeInfo.maxTokens = llmConfig.maxTokens;
    }

    const versionMetadata = this.mergeMetadata(undefined, {
      mergedFromVersionIds: versionIds,
      mergePrompt,
      mergedAt: new Date().toISOString(),
      mergeStrategy: 'llm',
      llmMergeInfo,
      llmMetadata: llmResponseMetadata ?? null,
      planStructureApplied: Boolean(normalizedPlanStructure),
      targetFormat: normalizedContent.format,
    } as JsonObject);

    const newVersion = await this.createVersion(executionContext, {
      content: normalizedContent.content,
      format: normalizedContent.format,
      createdByType: 'agent',
      metadata: versionMetadata,
    });

    return {
      newVersion,
      conflictSummary: `Merged ${versions.length} versions using ${llmConfig.provider}/${llmConfig.model}`,
      llmMetadata: llmResponseMetadata,
    };
  }

  // Helper methods
  private mapToVersion(data: PlanVersionRecord): PlanVersion {
    return {
      id: data.id,
      planId: data.plan_id,
      versionNumber: data.version_number,
      content: data.content,
      format: data.format,
      createdByType: data.created_by_type,
      createdById: data.created_by_id ?? undefined,
      taskId: data.task_id ?? undefined,
      metadata: data.metadata ?? {},
      isCurrentVersion: data.is_current_version,
      createdAt: new Date(data.created_at),
    };
  }

  private mergeMetadata(
    base: JsonObject | undefined,
    patch: JsonObject | undefined,
  ): JsonObject {
    return {
      ...(base ?? {}),
      ...(patch ?? {}),
    } as JsonObject;
  }

  private normalizePlanStructure(value: unknown): JsonObject | null {
    if (!value) {
      return null;
    }

    if (typeof value === 'string') {
      try {
        const parsed: unknown = JSON.parse(value);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return parsed as JsonObject;
        }
        return null;
      } catch (error) {
        this.logger.warn(
          `Failed to parse planStructure string: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        return null;
      }
    }

    if (typeof value === 'object' && !Array.isArray(value)) {
      return value as JsonObject;
    }

    return null;
  }

  private resolveTargetFormat(
    versions: PlanVersion[],
    preferred?: 'markdown' | 'json' | 'text',
    planStructure?: JsonObject | null,
  ): 'markdown' | 'json' | 'text' {
    if (preferred) {
      return preferred;
    }

    if (planStructure) {
      return 'json';
    }

    const formats = versions.map((version) => version.format);
    if (formats.includes('json')) {
      return 'json';
    }
    if (formats.includes('markdown')) {
      return 'markdown';
    }
    return 'text';
  }

  private normalizeLlmConfig(
    llmConfig: Record<string, unknown> | null | undefined,
  ): {
    provider: string;
    model: string;
    temperature?: number;
    maxTokens?: number;
  } {
    const providerCandidates = [
      (llmConfig?.provider as string | undefined) ?? null,
      (llmConfig?.providerName as string | undefined) ?? null,
    ].filter((candidate): candidate is string => Boolean(candidate));

    const provider = (providerCandidates[0] ?? 'anthropic').toLowerCase();

    const modelCandidates = [
      llmConfig?.model as string | undefined,
      llmConfig?.modelName as string | undefined,
    ].filter((candidate): candidate is string => Boolean(candidate));

    const model =
      modelCandidates[0] ?? this.getDefaultModelForProvider(provider);

    const temperature =
      typeof llmConfig?.temperature === 'number'
        ? llmConfig.temperature
        : undefined;
    const maxTokens =
      typeof llmConfig?.maxTokens === 'number'
        ? llmConfig.maxTokens
        : undefined;

    return {
      provider,
      model,
      temperature,
      maxTokens,
    };
  }

  private getDefaultModelForProvider(provider: string): string {
    switch (provider?.toLowerCase()) {
      case 'openai':
        return 'gpt-4o-mini';
      case 'google':
        return 'gemini-1.5-pro';
      case 'grok':
        return 'grok-beta';
      case 'ollama':
        return 'llama3.1:latest';
      case 'anthropic':
      default:
        return 'claude-3-5-sonnet-20241022';
    }
  }

  private buildMergeSystemPrompt(format: 'markdown' | 'json' | 'text'): string {
    const base =
      'You are an expert planning assistant. Merge multiple plan versions into a single cohesive plan that preserves the strongest ideas, resolves conflicts, and maintains clarity.';

    if (format === 'json') {
      return `${base} Respond with a single valid JSON object. Do not include code fences or commentary outside the JSON.`;
    }

    if (format === 'markdown') {
      return `${base} Respond with well-structured Markdown using headings and bullet points where appropriate.`;
    }

    return `${base} Respond with clear, structured text.`;
  }

  private buildMergeUserMessage(
    versions: PlanVersion[],
    mergePrompt: string,
    planStructure: JsonObject | null,
    format: 'markdown' | 'json' | 'text',
  ): string {
    const header = `We have ${versions.length} plan versions that need to be merged into a single ${
      format === 'json' ? 'JSON' : format
    } plan. Each version includes the full plan content. Produce a merged plan that incorporates the best elements of each version while eliminating duplicates and contradictions.`;

    const versionsSection = versions
      .map(
        (version, index) =>
          `--- PLAN VERSION ${index + 1} (versionId: ${version.id}, number: ${version.versionNumber}) ---\n${version.content}`,
      )
      .join('\n\n');

    const instructions = mergePrompt
      ? `\n\nAdditional merge instructions:\n${mergePrompt}`
      : '';

    const structureHint = planStructure
      ? `\n\nThe merged plan MUST conform to the following JSON schema:\n${JSON.stringify(planStructure, null, 2)}`
      : '';

    return `${header}\n\n${versionsSection}${instructions}${structureHint}\n\nReturn only the merged plan content.`;
  }

  private normalizeMergedContent(
    rawContent: string,
    format: 'markdown' | 'json' | 'text',
    planStructure: JsonObject | null,
  ): { content: string; format: 'markdown' | 'json' | 'text' } {
    if (!rawContent || !rawContent.trim()) {
      throw new BadRequestException('Merged plan content was empty');
    }

    if (format === 'json' || planStructure) {
      const candidate = this.extractJsonCandidate(rawContent);
      let parsed: unknown;
      try {
        parsed = JSON.parse(candidate);
      } catch (error) {
        throw new BadRequestException(
          `Merged plan is not valid JSON: ${
            error instanceof Error ? error.message : 'Unknown error'
          }`,
        );
      }

      if (planStructure) {
        this.validateAgainstStructure(parsed, planStructure);
      }

      if (typeof parsed === 'object' && parsed !== null) {
        return {
          content: JSON.stringify(parsed, null, 2),
          format: 'json',
        };
      }
    }

    return {
      content: rawContent.trim(),
      format,
    };
  }

  private extractJsonCandidate(value: string): string {
    const trimmed = value.trim();
    if (!trimmed) {
      return trimmed;
    }

    const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fencedMatch && fencedMatch[1]) {
      return fencedMatch[1].trim();
    }

    return trimmed;
  }

  private validateAgainstStructure(content: unknown, schema: JsonObject): void {
    try {
      const ajv = new Ajv({
        allErrors: true,
      });
      const validate = ajv.compile(schema);
      const valid = validate(content);
      if (!valid) {
        const message = ajv.errorsText(validate.errors, { separator: '; ' });
        throw new BadRequestException(
          `Merged plan does not match required schema: ${message}`,
        );
      }
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(
        `Failed to validate merged plan against schema: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
    }
  }

  /**
   * Rerun plan with different LLM
   */
  async rerunWithDifferentLLM(
    versionId: string,
    config: {
      provider: string;
      model: string;
      temperature?: number;
      maxTokens?: number;
    },
    executionContext: ExecutionContext,
  ): Promise<{ plan: Plan; version: PlanVersion }> {
    const { userId } = executionContext;

    try {
      // 1. Get the source version
      const sourceVersion = await this.findOne(versionId, executionContext);
      if (!sourceVersion) {
        throw new NotFoundException('Source version not found');
      }

      // 2. Verify plan ownership
      const plan = await this.plansRepo.findById(sourceVersion.planId, userId);
      if (!plan) {
        throw new NotFoundException('Plan not found');
      }

      // 3. Get the original task to retrieve the prompt
      if (!sourceVersion.taskId) {
        throw new BadRequestException(
          'Cannot rerun: source version has no associated task',
        );
      }

      const originalTask = await this.tasksService.getTaskById(
        sourceVersion.taskId,
        userId,
      );
      if (!originalTask || !originalTask.prompt) {
        throw new BadRequestException(
          'Cannot rerun: original task not found or has no prompt',
        );
      }

      // 4. Build system prompt for plan generation
      const systemPrompt = `You are an expert planning assistant. Create a comprehensive, well-structured plan based on the user's request. Format the plan in markdown.`;

      this.logger.debug(
        `🔄 [PLAN RERUN] Calling LLM with provider=${config.provider}, model=${config.model}`,
      );

      // 5. Call LLM service with new model
      const llmResponse = await this.llmService.generateUnifiedResponse({
        provider: config.provider,
        model: config.model,
        systemPrompt: systemPrompt,
        userMessage: originalTask.prompt,
        options: {
          temperature: config.temperature,
          maxTokens: config.maxTokens,
          executionContext,
          callerType: 'plan_rerun',
          callerName: `plan_rerun`,
          includeMetadata: true,
        },
      });

      this.logger.debug(`🔄 [PLAN RERUN] LLM response received successfully`);

      // 6. Handle string | LLMResponse union type
      const responseContent =
        typeof llmResponse === 'string' ? llmResponse : llmResponse.content;
      const responseMetadata =
        typeof llmResponse === 'object' ? llmResponse.metadata : undefined;

      // 7. Create new version with LLM response
      const rerunMetadata = this.mergeMetadata(sourceVersion.metadata, {
        sourceVersionId: versionId,
        rerunAt: new Date().toISOString(),
        llmRerunInfo: {
          provider: config.provider,
          model: config.model,
          temperature: config.temperature,
          maxTokens: config.maxTokens,
        },
        llmMetadata: responseMetadata
          ? {
              runId: responseMetadata.requestId,
              provider: responseMetadata.provider,
              model: responseMetadata.model,
              inputTokens: responseMetadata.usage?.inputTokens ?? null,
              outputTokens: responseMetadata.usage?.outputTokens ?? null,
              cost: responseMetadata.usage?.cost ?? null,
              duration: responseMetadata.timing?.duration ?? null,
            }
          : null,
      } as JsonObject);

      const newVersion = await this.createVersion(executionContext, {
        content: responseContent,
        format: sourceVersion.format || 'markdown',
        createdByType: 'agent',
        taskId: sourceVersion.taskId,
        metadata: rerunMetadata,
      });

      this.logger.log(
        `🔄 Plan rerun completed: Version ${newVersion.versionNumber} created with ${config.provider}/${config.model} for plan ${plan.id}`,
      );

      return {
        plan: this.mapPlanFromDb(plan),
        version: newVersion,
      };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }

      this.logger.error('Failed to rerun plan with different LLM:', error);
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';
      throw new BadRequestException(
        `Failed to rerun plan with different LLM: ${errorMessage}`,
      );
    }
  }

  private mapPlanFromDb(data: PlanRecord): Plan {
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
    };
  }
}
