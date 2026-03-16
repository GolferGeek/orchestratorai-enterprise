import { Injectable, Logger } from '@nestjs/common';
import type {
  JsonObject,
  JsonValue,
  ExecutionContext,
} from '@orchestrator-ai/transport-types';
import type { ActionResult } from '@/agent2agent/common/interfaces/action-handler.interface';
import { PlansService } from '@/agent2agent/plans/services/plans.service';
import type { Plan } from '@/agent2agent/plans/types/plan.types';
import type { PlanVersion } from '@/agent2agent/plans/types/plan.types';
import {
  AgentTaskMode,
  TaskRequestDto,
} from '@agent2agent/dto/task-request.dto';

export interface CreatePlanInput {
  organizationSlug: string | null;
  agentSlug: string;
  mode: AgentTaskMode;
  conversationId?: string;
  userId?: string | null;
  title?: string | null;
  content?: string | null;
  organization?: string | null;
}

interface CreatePlanActionResult {
  plan: Plan;
  version: PlanVersion | null;
  isNew: boolean;
}

interface EditPlanActionResult {
  plan: Plan;
  version: PlanVersion | null;
}

/**
 * Adapter that converts agent runtime outputs into plan operations.
 */
@Injectable()
export class AgentRuntimePlansAdapter {
  private readonly logger = new Logger(AgentRuntimePlansAdapter.name);

  constructor(private readonly plansService: PlansService) {}

  async maybeCreateFromPlanTask(
    ctx: CreatePlanInput,
    request: TaskRequestDto,
  ): Promise<{
    kind: 'plan' | 'plan_version';
    plan: Plan;
    version: PlanVersion | null;
  } | null> {
    try {
      if (ctx.mode !== AgentTaskMode.PLAN) {
        return null;
      }

      const userId = this.resolveUserId(request) ?? ctx.userId ?? null;
      const conversationId =
        ctx.conversationId ?? request.context?.conversationId ?? null;

      if (!userId || !conversationId) {
        this.logger.warn(
          'Cannot create plan: missing userId or conversationId',
        );
        return null;
      }

      // Validate that request.context exists before passing to executeAction
      // Even though conversationId might be resolved from ctx.conversationId,
      // executeAction requires the full ExecutionContext object
      if (!request.context) {
        this.logger.warn(
          'Cannot create plan: missing ExecutionContext in request',
        );
        return null;
      }

      const title = ctx.title ?? `Plan from ${ctx.agentSlug}`;
      const content =
        ctx.content ??
        this.extractString(request.payload ?? {}, 'output') ??
        '';
      const organization =
        ctx.organization || ctx.organizationSlug || 'default';
      const taskId = this.resolveTaskId(request);

      const result =
        await this.plansService.executeAction<CreatePlanActionResult>(
          'create',
          {
            title,
            content,
            format: 'markdown',
            agentName: ctx.agentSlug,
            organization,
            taskId,
            metadata: this.buildMetadataObject({
              organizationSlug: ctx.organizationSlug,
              agentSlug: ctx.agentSlug,
              mode: ctx.mode,
            }),
          },
          // Use request.context directly - full ExecutionContext from transport-types
          request.context,
        );

      const data = this.ensureSuccess(result, 'Failed to create plan');

      return {
        kind: data.isNew ? 'plan' : 'plan_version',
        plan: data.plan,
        version: data.version,
      };
    } catch (error) {
      this.logger.warn(
        `Failed to auto-create plan: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  /**
   * Create version from manual edit
   * @param context - Full ExecutionContext from transport-types
   * @param editedContent - The edited plan content
   * @param metadata - Optional additional metadata
   */
  async createVersionFromManualEdit(
    context: ExecutionContext,
    editedContent: string,
    metadata?: Record<string, unknown>,
  ): Promise<EditPlanActionResult> {
    const result = await this.plansService.executeAction<EditPlanActionResult>(
      'edit',
      {
        content: editedContent,
        metadata: this.buildMetadataObject(metadata ?? {}),
      },
      context,
    );

    return this.ensureSuccess(result, 'Failed to save manual edit');
  }

  /**
   * Merge multiple plan versions
   * @param context - Full ExecutionContext from transport-types
   * @param versionIds - Array of version IDs to merge
   * @param mergePrompt - Prompt describing how to merge
   */
  async mergeVersions(
    context: ExecutionContext,
    versionIds: string[],
    mergePrompt: string,
  ): Promise<JsonObject> {
    const result = await this.plansService.executeAction<JsonObject>(
      'merge_versions',
      {
        versionIds,
        mergePrompt,
      },
      context,
    );

    return this.ensureSuccess(result, 'Failed to merge versions');
  }

  /**
   * Copy a plan version
   * @param context - Full ExecutionContext from transport-types
   * @param versionId - ID of the version to copy
   */
  async copyVersion(
    context: ExecutionContext,
    versionId: string,
  ): Promise<JsonObject> {
    const result = await this.plansService.executeAction<JsonObject>(
      'copy_version',
      { versionId },
      context,
    );

    return this.ensureSuccess(result, 'Failed to copy version');
  }

  private resolveUserId(request: TaskRequestDto): string | undefined {
    const fromTop = request.metadata?.userId ?? request.metadata?.createdBy;
    const fromPayload =
      this.extractPayloadMetadataString(request.payload, 'userId') ??
      this.extractPayloadMetadataString(request.payload, 'createdBy');

    const candidate = fromTop ?? fromPayload;
    return typeof candidate === 'string' && candidate.length > 0
      ? candidate
      : undefined;
  }

  private resolveTaskId(request: TaskRequestDto): string | undefined {
    const candidate = request.metadata?.taskId ?? request.metadata?.task_id;
    return typeof candidate === 'string' && candidate.length > 0
      ? candidate
      : undefined;
  }

  private extractPayloadMetadataString(
    payload: TaskRequestDto['payload'],
    key: string,
  ): string | undefined {
    if (!payload || typeof payload !== 'object') {
      return undefined;
    }

    const metadata = payload.metadata;
    if (!metadata || typeof metadata !== 'object') {
      return undefined;
    }

    const value = (metadata as Record<string, unknown>)[key];
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }

  private extractString(object: unknown, field: string): string | undefined {
    if (!object || typeof object !== 'object') {
      return undefined;
    }

    const value = (object as Record<string, unknown>)[field];
    return typeof value === 'string' ? value : undefined;
  }

  private buildMetadataObject(value: Record<string, unknown>): JsonObject {
    const parsed = this.toJsonValue(value);
    if (parsed !== undefined && this.isJsonObject(parsed)) {
      return parsed;
    }
    return {};
  }

  private toJsonValue(input: unknown): JsonValue | undefined {
    if (
      input === null ||
      typeof input === 'string' ||
      typeof input === 'number' ||
      typeof input === 'boolean'
    ) {
      return input;
    }

    if (Array.isArray(input)) {
      const mapped = input
        .map((entry) => this.toJsonValue(entry))
        .filter((entry): entry is JsonValue => entry !== undefined);
      return mapped as JsonValue;
    }

    if (typeof input === 'object') {
      const result: JsonObject = {};
      Object.entries(input as Record<string, unknown>).forEach(
        ([key, entry]) => {
          const value = this.toJsonValue(entry);
          if (value !== undefined) {
            result[key] = value;
          }
        },
      );
      return result;
    }

    return undefined;
  }

  private isJsonObject(value: JsonValue): value is JsonObject {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private ensureSuccess<T>(result: ActionResult<T>, defaultMessage: string): T {
    if (!result.success || result.data === undefined || result.data === null) {
      throw new Error(result.error?.message ?? defaultMessage);
    }

    return result.data;
  }
}
