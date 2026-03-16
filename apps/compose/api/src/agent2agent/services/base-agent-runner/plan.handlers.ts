import * as AjvModule from 'ajv';
import { AgentRuntimeDefinition } from '@agent-platform/interfaces/agent.interface';
import { LLMServiceProvider } from '@/planes/llm/llm.interface';
import type { LLMResponse } from '@llm/services/llm-interfaces';
import type { ConversationMessage } from '../../context-optimization/context-optimization.service';
import { PlansService } from '../../plans/services/plans.service';
import type { Plan } from '@/agent2agent/plans/types/plan.types';
import type { PlanVersion } from '@/agent2agent/plans/types/plan.types';
import { Agent2AgentConversationsService } from '../agent-conversations.service';
import {
  fetchConversationHistory,
  fetchExistingPlan,
  buildResponseMetadata,
  callLLM,
  handleError,
} from './shared.helpers';
import { AgentTaskMode, TaskRequestDto } from '../../dto/task-request.dto';
import { TaskResponseDto } from '../../dto/task-response.dto';
import type {
  PlanCreatePayload,
  PlanDeletePayload,
  PlanDeleteVersionPayload,
  PlanEditPayload,
  PlanListPayload,
  PlanMergeVersionsPayload,
  PlanReadPayload,
  PlanSetCurrentPayload,
  PlanCopyVersionPayload,
  PlanRerunPayload,
  PlanCreateResponseContent,
  PlanListResponseContent,
  PlanRerunResponseContent,
  PlanResponseMetadata,
  PlanModePayload,
  ExecutionContext,
} from '@orchestrator-ai/transport-types';

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

export interface PlanHandlerDependencies {
  llmService: LLMServiceProvider;
  plansService: PlansService;
  conversationsService: Agent2AgentConversationsService;
}

const EMPTY_USAGE = {
  inputTokens: 0 as number,
  outputTokens: 0 as number,
  totalTokens: 0 as number,
  cost: 0 as number,
};

const EMPTY_PLAN_METADATA: PlanResponseMetadata = {
  provider: '',
  model: '',
  usage: EMPTY_USAGE,
};

interface DeleteVersionActionResult {
  deletedVersionId: string;
  plan: Plan;
  remainingVersions: PlanVersion[];
}

interface DeletePlanActionResult {
  deletedPlanId: string;
  deletedVersionCount: number;
}

interface MergeVersionsActionResult {
  plan: Plan;
  mergedVersion: PlanVersion;
  sourceVersions: PlanVersion[];
  llmMetadata?: Record<string, unknown> | null;
}

interface CopyVersionActionResult {
  sourcePlan: Plan;
  sourceVersion: PlanVersion;
  targetPlan: Plan;
  copiedVersion: PlanVersion;
}

/**
 * Validate plan payload structure against transport-types
 * Ensures action field is present and valid for PLAN mode
 */
function validatePlanPayload(payload: unknown): payload is PlanModePayload {
  if (!payload || typeof payload !== 'object') {
    // Payload is optional for plan create (defaults to 'create' action)
    return true;
  }

  const payloadObj = payload as Record<string, unknown>;

  // If action is present, validate it
  if (payloadObj.action !== undefined) {
    const validActions = [
      'create',
      'read',
      'list',
      'edit',
      'rerun',
      'set_current',
      'delete_version',
      'merge_versions',
      'copy_version',
      'delete',
    ];

    if (
      typeof payloadObj.action !== 'string' ||
      !validActions.includes(payloadObj.action)
    ) {
      throw new Error(
        `Invalid plan action: ${typeof payloadObj.action === 'string' ? payloadObj.action : JSON.stringify(payloadObj.action)}. Must be one of: ${validActions.join(', ')}`,
      );
    }
  }

  return true;
}

export async function handlePlanCreate(
  definition: AgentRuntimeDefinition,
  request: TaskRequestDto,
  organizationSlug: string | null,
  services: PlanHandlerDependencies,
): Promise<TaskResponseDto> {
  try {
    // Validate payload structure
    validatePlanPayload(request.payload);

    const payload = (request.payload ?? {}) as Partial<PlanCreatePayload>;
    const { userId, conversationId, taskId, executionContext } =
      buildPlanActionContext(definition, request);

    const organization = resolveOrganization(definition, organizationSlug);
    const existingPlan = (await fetchExistingPlan(
      services.plansService,
      request,
    )) as Plan | null;

    if (existingPlan && payload.forceNew !== true) {
      const currentVersion = existingPlan.currentVersion ?? null;
      if (!currentVersion) {
        return TaskResponseDto.failure(
          AgentTaskMode.PLAN,
          'Existing plan is missing a current version',
        );
      }

      const metadata = buildResponseMetadata(
        EMPTY_PLAN_METADATA as unknown as Record<string, unknown>,
        {
          planMetadata: extractPlanMetadata(currentVersion.content),
          planStructureApplied: Boolean(definition.planStructure),
          source: 'existing',
        },
      );

      // MUTATION: Set planId in context when plan is found
      if (request.context) {
        request.context.planId = existingPlan.id;
      }

      return TaskResponseDto.success(AgentTaskMode.PLAN, {
        content: {
          plan: serializePlan(existingPlan, definition, existingPlan.userId),
          version: serializePlanVersion(currentVersion),
          isNew: false,
        },
        metadata,
      });
    }

    const conversationHistory = await fetchConversationHistory(
      services.conversationsService,
      request,
    );
    const planningPrompt = buildPlanningPrompt(
      definition,
      conversationHistory,
      definition.planStructure ?? null,
    );

    let planSourceContent: unknown = payload.content;
    let llmResponse: LLMResponse | null = null;

    if (!planSourceContent) {
      const userMessage =
        typeof request.userMessage === 'string' &&
        request.userMessage.trim().length > 0
          ? request.userMessage.trim()
          : 'Generate a detailed, actionable plan that satisfies the conversation context.';

      // Extract LLM configuration from payload (required from frontend)
      const payloadRec = payload as Record<string, unknown>;
      const llmSelection = payloadRec.llmSelection as
        | Record<string, unknown>
        | undefined;
      const config = payloadRec.config as
        | {
            provider?: string;
            model?: string;
            temperature?: number;
            maxTokens?: number;
          }
        | undefined;
      const providerName = config?.provider ?? llmSelection?.providerName;
      const modelName = config?.model ?? llmSelection?.modelName;

      // Validate LLM configuration (no fallbacks - frontend must provide)
      if (!providerName || !modelName) {
        throw new Error(
          'LLM provider and model must be specified in the request payload. ' +
            'Frontend must send config.provider and config.model.',
        );
      }

      llmResponse = await callLLM(
        services.llmService,
        {
          providerName,
          modelName,
          temperature: config?.temperature ?? payloadRec.temperature,
          maxTokens: config?.maxTokens ?? payloadRec.maxTokens,
          conversationId,
          sessionId: request.context?.taskId, // Use taskId for session correlation
          userId,
          organizationSlug: organization,
          agentSlug: definition.slug,
          callerType: 'agent',
          callerName: `${definition.slug}-plan-create`,
          stream: false,
        },
        planningPrompt,
        userMessage,
        request.context,
        conversationHistory,
      );

      planSourceContent = llmResponse.content;
    }

    const { content: normalizedContent, parsed } = normalizePlanContent(
      planSourceContent,
      definition.planStructure ?? null,
    );

    const planFormat = resolvePlanFormat(definition);
    const planMetadata = extractPlanMetadata(parsed ?? normalizedContent);

    const createResult =
      await services.plansService.executeAction<PlanCreateResponseContent>(
        'create',
        {
          title:
            (payload.title && payload.title.trim().length > 0
              ? payload.title
              : null) ?? 'Plan',
          content: normalizedContent,
          format: planFormat,
          agentName: definition.slug, // Always use slug, not displayName
          organization,
          taskId,
          metadata: {
            planMetadata,
            planStructureApplied: Boolean(definition.planStructure),
            source: llmResponse ? 'llm' : 'payload',
          },
        },
        executionContext,
      );

    if (!createResult.success || !createResult.data) {
      return TaskResponseDto.failure(
        AgentTaskMode.PLAN,
        createResult.error?.message ?? 'Failed to create plan',
      );
    }

    const { plan, version, isNew } = createResult.data;
    const baseMetadata = createBaseMetadataFromLLM(llmResponse);
    const metadata = buildResponseMetadata(
      baseMetadata as unknown as Record<string, unknown>,
      {
        planMetadata,
        planFormat,
        planStructureApplied: Boolean(definition.planStructure),
        isNew,
        conversationId,
      },
    );

    // MUTATION: Set planId in context when plan is created
    if (request.context) {
      request.context.planId = plan.id;
    }

    // Create a descriptive message for the frontend
    const planTitle = plan.title || 'Untitled Plan';
    const message = isNew
      ? `Created plan "${planTitle}" (version ${version.versionNumber})`
      : `Updated plan "${planTitle}" to version ${version.versionNumber}`;

    return TaskResponseDto.success(AgentTaskMode.PLAN, {
      content: {
        plan: serializePlan(plan, definition, userId),
        version: serializePlanVersion(version),
        isNew,
        message,
      },
      metadata,
    });
  } catch (error) {
    return handleError(AgentTaskMode.PLAN, error);
  }
}

export async function handlePlanRead(
  definition: AgentRuntimeDefinition,
  request: TaskRequestDto,
  organizationSlug: string | null,
  services: PlanHandlerDependencies,
): Promise<TaskResponseDto> {
  void organizationSlug;
  try {
    // Validate payload structure
    validatePlanPayload(request.payload);

    const payload = (request.payload ?? {}) as Partial<PlanReadPayload>;
    const { userId, conversationId, executionContext } = buildPlanActionContext(
      definition,
      request,
    );

    const plan =
      ((await fetchExistingPlan(
        services.plansService,
        request,
      )) as Plan | null) ?? null;
    if (!plan) {
      return TaskResponseDto.failure(
        AgentTaskMode.PLAN,
        'No plan found for this conversation',
      );
    }

    // MUTATION: Set planId in context when plan is found
    if (request.context) {
      request.context.planId = plan.id;
    }

    if (payload.versionId) {
      const listResult =
        await services.plansService.executeAction<PlanListResponseContent>(
          'list',
          {},
          executionContext,
        );

      if (!listResult.success || !listResult.data) {
        return TaskResponseDto.failure(
          AgentTaskMode.PLAN,
          listResult.error?.message ??
            'Unable to list plan versions for version lookup',
        );
      }

      const targetVersion = (listResult.data.versions ?? []).find(
        (version) => version.id === payload.versionId,
      );

      if (!targetVersion) {
        return TaskResponseDto.failure(
          AgentTaskMode.PLAN,
          `Plan version ${payload.versionId} not found`,
        );
      }

      const metadata = buildResponseMetadata(
        EMPTY_PLAN_METADATA as unknown as Record<string, unknown>,
        {
          planMetadata: extractPlanMetadata(targetVersion.content),
          requestedVersionId: payload.versionId,
        },
      );

      return TaskResponseDto.success(AgentTaskMode.PLAN, {
        content: {
          plan: {
            ...serializePlan(plan, definition, userId),
            currentVersion: serializePlanVersion(targetVersion) ?? undefined,
          },
        },
        metadata,
      });
    }

    const currentVersion = plan.currentVersion ?? null;

    const metadata = buildResponseMetadata(
      EMPTY_PLAN_METADATA as unknown as Record<string, unknown>,
      {
        planMetadata: extractPlanMetadata(
          currentVersion?.content ?? plan.currentVersion ?? '',
        ),
        conversationId,
      },
    );

    return TaskResponseDto.success(AgentTaskMode.PLAN, {
      content: {
        plan: {
          ...serializePlan(plan, definition, userId),
          currentVersion: serializePlanVersion(currentVersion) ?? undefined,
        },
      },
      metadata,
    });
  } catch (error) {
    return handleError(AgentTaskMode.PLAN, error);
  }
}

export async function handlePlanList(
  definition: AgentRuntimeDefinition,
  request: TaskRequestDto,
  organizationSlug: string | null,
  services: PlanHandlerDependencies,
): Promise<TaskResponseDto> {
  void organizationSlug;
  try {
    // Validate payload structure
    validatePlanPayload(request.payload);

    const payload = (request.payload ?? {}) as Partial<PlanListPayload>;
    const { userId, executionContext } = buildPlanActionContext(
      definition,
      request,
    );

    const listResult =
      await services.plansService.executeAction<PlanListResponseContent>(
        'list',
        {
          includeArchived: payload.includeArchived ?? false,
        },
        executionContext,
      );

    if (!listResult.success || !listResult.data) {
      return TaskResponseDto.failure(
        AgentTaskMode.PLAN,
        listResult.error?.message ?? 'Failed to list plan versions',
      );
    }

    const responsePlan = serializePlan(
      listResult.data.plan,
      definition,
      userId,
    );
    const responseVersions = (listResult.data.versions ?? []).map((version) =>
      serializePlanVersion(version),
    );

    return TaskResponseDto.success(AgentTaskMode.PLAN, {
      content: {
        plan: responsePlan,
        versions: responseVersions.filter(
          (version): version is NonNullable<typeof version> => Boolean(version),
        ),
      },
      metadata: buildResponseMetadata(
        EMPTY_PLAN_METADATA as unknown as Record<string, unknown>,
        {
          versionCount: responseVersions.length,
        },
      ),
    });
  } catch (error) {
    return handleError(AgentTaskMode.PLAN, error);
  }
}

export async function handlePlanEdit(
  definition: AgentRuntimeDefinition,
  request: TaskRequestDto,
  organizationSlug: string | null,
  services: PlanHandlerDependencies,
): Promise<TaskResponseDto> {
  void organizationSlug;
  try {
    // Validate payload structure
    validatePlanPayload(request.payload);

    const payload = (request.payload ?? {}) as Partial<PlanEditPayload>;
    if (!payload.editedContent) {
      return TaskResponseDto.failure(
        AgentTaskMode.PLAN,
        'editedContent is required to edit a plan',
      );
    }

    const { userId, executionContext } = buildPlanActionContext(
      definition,
      request,
    );

    const normalized = normalizePlanContent(
      payload.editedContent,
      definition.planStructure ?? null,
    );
    const planMetadata = extractPlanMetadata(
      normalized.parsed ?? normalized.content,
    );

    const editResult =
      await services.plansService.executeAction<PlanCreateResponseContent>(
        'edit',
        {
          content: normalized.content,
          metadata: {
            comment: payload.comment,
            planMetadata,
            planStructureApplied: Boolean(definition.planStructure),
          },
        },
        executionContext,
      );

    if (!editResult.success || !editResult.data) {
      return TaskResponseDto.failure(
        AgentTaskMode.PLAN,
        editResult.error?.message ?? 'Failed to edit plan',
      );
    }

    const baseMetadata = buildResponseMetadata(
      EMPTY_PLAN_METADATA as unknown as Record<string, unknown>,
      {
        planMetadata,
        source: 'manual-edit',
      },
    );

    return TaskResponseDto.success(AgentTaskMode.PLAN, {
      content: {
        plan: serializePlan(editResult.data.plan, definition, userId),
        version: serializePlanVersion(editResult.data.version),
        isNew: true,
      },
      metadata: baseMetadata,
    });
  } catch (error) {
    return handleError(AgentTaskMode.PLAN, error);
  }
}

export async function handlePlanRerun(
  definition: AgentRuntimeDefinition,
  request: TaskRequestDto,
  organizationSlug: string | null,
  services: PlanHandlerDependencies,
): Promise<TaskResponseDto> {
  void organizationSlug;
  try {
    // Validate payload structure
    validatePlanPayload(request.payload);

    const payload = (request.payload ?? {}) as unknown as PlanRerunPayload;
    if (!payload.versionId || !payload.llmOverride) {
      return TaskResponseDto.failure(
        AgentTaskMode.PLAN,
        'versionId and llmOverride are required for rerun action',
      );
    }

    const { userId, executionContext } = buildPlanActionContext(
      definition,
      request,
    );

    const rerunResult =
      await services.plansService.executeAction<PlanRerunResponseContent>(
        'rerun',
        payload,
        executionContext,
      );

    if (!rerunResult.success || !rerunResult.data) {
      return TaskResponseDto.failure(
        AgentTaskMode.PLAN,
        rerunResult.error?.message ?? 'Failed to rerun plan generation',
      );
    }

    const versionMetadata =
      (rerunResult.data.version?.metadata as Record<string, unknown>) ?? {};
    const llmInfo = (versionMetadata?.llmRerunInfo ?? {}) as Record<
      string,
      unknown
    >;
    const llmMetadata = (versionMetadata?.llmMetadata ?? {}) as Record<
      string,
      unknown
    >;

    const metadata = buildResponseMetadata(
      EMPTY_PLAN_METADATA as unknown as Record<string, unknown>,
      {
        provider: typeof llmInfo.provider === 'string' ? llmInfo.provider : '',
        model: typeof llmInfo.model === 'string' ? llmInfo.model : '',
        usage: normalizeUsage(llmMetadata.usage),
        planMetadata: extractPlanMetadata(rerunResult.data.version.content),
        sourceVersionId: payload.versionId,
        llmOverride: payload.llmOverride,
      },
    );

    return TaskResponseDto.success(AgentTaskMode.PLAN, {
      content: {
        plan: serializePlan(rerunResult.data.plan, definition, userId),
        version: serializePlanVersion(rerunResult.data.version),
        isNew: true,
      },
      metadata,
    });
  } catch (error) {
    return handleError(AgentTaskMode.PLAN, error);
  }
}

export async function handlePlanSetCurrent(
  definition: AgentRuntimeDefinition,
  request: TaskRequestDto,
  organizationSlug: string | null,
  services: PlanHandlerDependencies,
): Promise<TaskResponseDto> {
  void organizationSlug;
  try {
    // Validate payload structure
    validatePlanPayload(request.payload);

    const payload = (request.payload ?? {}) as unknown as PlanSetCurrentPayload;
    if (!payload.versionId) {
      return TaskResponseDto.failure(
        AgentTaskMode.PLAN,
        'versionId is required to set current plan version',
      );
    }

    const { userId, executionContext } = buildPlanActionContext(
      definition,
      request,
    );

    const result =
      await services.plansService.executeAction<PlanCreateResponseContent>(
        'set_current',
        payload,
        executionContext,
      );

    if (!result.success || !result.data) {
      return TaskResponseDto.failure(
        AgentTaskMode.PLAN,
        result.error?.message ?? 'Failed to set current plan version',
      );
    }

    const metadata = buildResponseMetadata(
      EMPTY_PLAN_METADATA as unknown as Record<string, unknown>,
      {
        planMetadata: extractPlanMetadata(result.data.version.content),
        updatedVersionId: payload.versionId,
      },
    );

    return TaskResponseDto.success(AgentTaskMode.PLAN, {
      content: {
        plan: serializePlan(result.data.plan, definition, userId),
        version: serializePlanVersion(result.data.version),
        isNew: false,
      },
      metadata,
    });
  } catch (error) {
    return handleError(AgentTaskMode.PLAN, error);
  }
}

export async function handlePlanDeleteVersion(
  definition: AgentRuntimeDefinition,
  request: TaskRequestDto,
  organizationSlug: string | null,
  services: PlanHandlerDependencies,
): Promise<TaskResponseDto> {
  void organizationSlug;
  try {
    // Validate payload structure
    validatePlanPayload(request.payload);

    const payload = (request.payload ??
      {}) as unknown as PlanDeleteVersionPayload;
    if (!payload.versionId) {
      return TaskResponseDto.failure(
        AgentTaskMode.PLAN,
        'versionId is required to delete a plan version',
      );
    }

    const { userId, executionContext } = buildPlanActionContext(
      definition,
      request,
    );

    const deleteResult =
      await services.plansService.executeAction<DeleteVersionActionResult>(
        'delete_version',
        payload,
        executionContext,
      );

    if (!deleteResult.success || !deleteResult.data) {
      return TaskResponseDto.failure(
        AgentTaskMode.PLAN,
        deleteResult.error?.message ?? 'Failed to delete plan version',
      );
    }

    const serializedPlan = serializePlan(
      deleteResult.data.plan,
      definition,
      userId,
    );
    const remainingVersions = (deleteResult.data.remainingVersions ?? []).map(
      (version: unknown) => serializePlanVersion(version),
    );

    const metadata = buildResponseMetadata(
      EMPTY_PLAN_METADATA as unknown as Record<string, unknown>,
      {
        deletedVersionId: payload.versionId,
        remainingVersionCount: remainingVersions.length,
      },
    );

    return TaskResponseDto.success(AgentTaskMode.PLAN, {
      content: {
        deletedVersionId: payload.versionId,
        plan: serializedPlan,
        remainingVersions: remainingVersions.filter(
          (version: unknown): version is NonNullable<typeof version> =>
            Boolean(version),
        ),
      },
      metadata,
    });
  } catch (error) {
    return handleError(AgentTaskMode.PLAN, error);
  }
}

export async function handlePlanMergeVersions(
  definition: AgentRuntimeDefinition,
  request: TaskRequestDto,
  organizationSlug: string | null,
  services: PlanHandlerDependencies,
): Promise<TaskResponseDto> {
  void organizationSlug;
  try {
    // Validate payload structure
    validatePlanPayload(request.payload);

    const payload = (request.payload ??
      {}) as unknown as PlanMergeVersionsPayload;
    if (!payload.versionIds || payload.versionIds.length < 2) {
      return TaskResponseDto.failure(
        AgentTaskMode.PLAN,
        'At least two versionIds are required to merge versions',
      );
    }

    if (!payload.mergePrompt || payload.mergePrompt.trim().length === 0) {
      return TaskResponseDto.failure(
        AgentTaskMode.PLAN,
        'mergePrompt is required to merge versions',
      );
    }

    const { userId, executionContext } = buildPlanActionContext(
      definition,
      request,
    );

    const planFormat = resolvePlanFormat(definition);
    const mergeResult =
      await services.plansService.executeAction<MergeVersionsActionResult>(
        'merge_versions',
        {
          versionIds: payload.versionIds,
          mergePrompt: payload.mergePrompt,
          planStructure: definition.planStructure ?? null,
          llmConfig: normalizeLlmConfig(definition.llm),
          preferredFormat: planFormat,
        },
        executionContext,
      );

    if (!mergeResult.success || !mergeResult.data) {
      return TaskResponseDto.failure(
        AgentTaskMode.PLAN,
        mergeResult.error?.message ?? 'Failed to merge plan versions',
      );
    }

    const mergedVersion = serializePlanVersion(mergeResult.data.mergedVersion);
    const llmMetadata = mergeResult.data.llmMetadata ?? null;
    const planMetadata = extractPlanMetadata(
      mergeResult.data.mergedVersion?.content,
    );
    const metadata = buildResponseMetadata(
      llmMetadata
        ? {
            provider: llmMetadata.provider ?? '',
            model: llmMetadata.model ?? '',
            usage: normalizeUsage(llmMetadata.usage),
          }
        : (EMPTY_PLAN_METADATA as unknown as Record<string, unknown>),
      {
        planMetadata,
        mergedVersionId: mergedVersion?.id,
        mergedVersionCount: payload.versionIds.length,
      },
    );

    return TaskResponseDto.success(AgentTaskMode.PLAN, {
      content: {
        plan: serializePlan(mergeResult.data.plan, definition, userId),
        mergedVersion,
        sourceVersions: (mergeResult.data.sourceVersions ?? []).map(
          (version: unknown) => serializePlanVersion(version),
        ),
      },
      metadata,
    });
  } catch (error) {
    return handleError(AgentTaskMode.PLAN, error);
  }
}

export async function handlePlanCopyVersion(
  definition: AgentRuntimeDefinition,
  request: TaskRequestDto,
  organizationSlug: string | null,
  services: PlanHandlerDependencies,
): Promise<TaskResponseDto> {
  void organizationSlug;
  try {
    // Validate payload structure
    validatePlanPayload(request.payload);

    const payload = (request.payload ??
      {}) as unknown as PlanCopyVersionPayload;
    if (!payload.versionId) {
      return TaskResponseDto.failure(
        AgentTaskMode.PLAN,
        'versionId is required to copy a plan version',
      );
    }

    const { userId, executionContext } = buildPlanActionContext(
      definition,
      request,
    );

    const copyResult =
      await services.plansService.executeAction<CopyVersionActionResult>(
        'copy_version',
        payload,
        executionContext,
      );

    if (!copyResult.success || !copyResult.data) {
      return TaskResponseDto.failure(
        AgentTaskMode.PLAN,
        copyResult.error?.message ?? 'Failed to copy plan version',
      );
    }

    const metadata = buildResponseMetadata(
      EMPTY_PLAN_METADATA as unknown as Record<string, unknown>,
      {
        sourceVersionId: payload.versionId,
        copiedVersionId: copyResult.data.copiedVersion?.id,
      },
    );

    return TaskResponseDto.success(AgentTaskMode.PLAN, {
      content: {
        sourcePlan: serializePlan(
          copyResult.data.sourcePlan,
          definition,
          userId,
        ),
        sourceVersion: serializePlanVersion(copyResult.data.sourceVersion),
        targetPlan: serializePlan(
          copyResult.data.targetPlan,
          definition,
          userId,
        ),
        copiedVersion: serializePlanVersion(copyResult.data.copiedVersion),
      },
      metadata,
    });
  } catch (error) {
    return handleError(AgentTaskMode.PLAN, error);
  }
}

export async function handlePlanDelete(
  definition: AgentRuntimeDefinition,
  request: TaskRequestDto,
  organizationSlug: string | null,
  services: PlanHandlerDependencies,
): Promise<TaskResponseDto> {
  void organizationSlug;
  try {
    // Validate payload structure
    validatePlanPayload(request.payload);

    const payload = (request.payload ?? {}) as unknown as PlanDeletePayload;
    void payload;

    const { executionContext } = buildPlanActionContext(definition, request);

    const deleteResult =
      await services.plansService.executeAction<DeletePlanActionResult>(
        'delete',
        {},
        executionContext,
      );

    if (!deleteResult.success || !deleteResult.data) {
      return TaskResponseDto.failure(
        AgentTaskMode.PLAN,
        deleteResult.error?.message ?? 'Failed to delete plan',
      );
    }

    return TaskResponseDto.success(AgentTaskMode.PLAN, {
      content: {
        deletedPlanId: deleteResult.data.deletedPlanId,
        deletedVersionCount: deleteResult.data.deletedVersionCount,
      },
      metadata: buildResponseMetadata(
        EMPTY_PLAN_METADATA as unknown as Record<string, unknown>,
        {
          deletedPlanId: deleteResult.data.deletedPlanId,
          deletedVersionCount: deleteResult.data.deletedVersionCount,
        },
      ),
    });
  } catch (error) {
    return handleError(AgentTaskMode.PLAN, error);
  }
}

export function buildPlanningPrompt(
  definition: AgentRuntimeDefinition,
  conversationHistory: ConversationMessage[],
  planStructure: unknown,
): string {
  const basePromptCandidates = [
    definition.prompts?.plan,
    definition.prompts?.system,
    definition.llm?.systemPrompt,
    definition.context?.systemPrompt,
  ];

  const basePrompt =
    basePromptCandidates.find(
      (prompt): prompt is string =>
        typeof prompt === 'string' && prompt.trim().length > 0,
    ) ??
    `You are ${definition.name ?? definition.slug}, an expert planning assistant. Create detailed, actionable plans.`;

  const historySection =
    conversationHistory.length > 0
      ? conversationHistory
          .map((message) => `${message.role}: ${message.content}`.trim())
          .join('\n')
      : 'No prior conversation history was provided.';

  let prompt = `${basePrompt.trim()}\n\nConversation history:\n${historySection}`;

  if (planStructure) {
    // Check if planStructure is a string (markdown template) or object (JSON schema)
    const isMarkdownTemplate = typeof planStructure === 'string';

    if (isMarkdownTemplate) {
      prompt += `\n\n=== MARKDOWN TEMPLATE TO FOLLOW ===\n${planStructure}\n=== END TEMPLATE ===`;
      prompt += '\n\n🚨 CRITICAL INSTRUCTIONS 🚨';
      prompt += '\n- Your ENTIRE response must be in MARKDOWN format only';
      prompt +=
        '\n- Use the template structure above with proper markdown headings (# ## ###)';
      prompt += '\n- Use bullet points (-) and proper markdown formatting';
      prompt += '\n- DO NOT use JSON format';
      prompt += '\n- DO NOT wrap your response in code blocks';
      prompt += '\n- DO NOT include any JSON objects or arrays';
      prompt += '\n- Start your response directly with markdown content';
      prompt +=
        '\n\nReturn ONLY the markdown-formatted plan following the template structure. Begin now with your markdown response:';
    } else {
      prompt += `\n\nYour plan must follow this structure:\n${safeStringify(planStructure)}`;
      prompt +=
        '\n\nIMPORTANT: You MUST return your response as valid JSON that strictly validates against the plan structure above. Do not return plain text, explanations, or any other format. Return ONLY valid JSON matching the structure exactly.';
    }
  } else {
    prompt +=
      '\n\nGenerate a structured plan with named phases, clear steps, owners, and measurable outcomes.';
  }

  return prompt;
}

export function validatePlanStructure(
  planContent: unknown,
  planStructure: unknown,
): unknown {
  if (!planStructure) {
    return planContent;
  }

  // If planStructure is a string (markdown template), just return the content as-is
  // No JSON schema validation needed for markdown templates
  if (typeof planStructure === 'string') {
    // Try to parse as JSON schema, but if it fails, treat as markdown template
    try {
      const parsed: unknown = JSON.parse(planStructure);
      if (typeof parsed === 'object' && parsed !== null) {
        // It's a JSON schema stored as a string, continue with validation
        planStructure = parsed;
      } else {
        // It's a markdown template, return content as-is
        return planContent;
      }
    } catch {
      // Not valid JSON, it's a markdown template - return content as-is
      return planContent;
    }
  }

  // planStructure is an object (JSON schema), validate the content
  const ajv = new Ajv({
    allErrors: true,
  });

  const validate = ajv.compile(planStructure as Record<string, unknown>);
  const candidate = coercePlanContent(planContent);

  if (!validate(candidate)) {
    // Don't throw - just continue
    // This allows flexible plan structures while still providing feedback
  }

  return candidate;
}

export function extractPlanMetadata(
  planContent: unknown,
): Record<string, unknown> {
  if (planContent === undefined || planContent === null) {
    return { hasContent: false };
  }

  if (typeof planContent === 'string') {
    const trimmed = planContent.trim();
    const metadata: Record<string, unknown> = {
      format: 'text',
      contentLength: trimmed.length,
    };

    if (trimmed.length > 0) {
      metadata.preview = trimmed.slice(0, 200);
    }

    const parsed = tryParseJson(trimmed);
    if (parsed !== null) {
      const keys = Object.keys(parsed as Record<string, unknown>);
      metadata.format = Array.isArray(parsed) ? 'array' : 'json';
      metadata.keyCount = keys.length;
      if (keys.length > 0) {
        metadata.topLevelKeys = keys.slice(0, 10);
      }
    }

    return metadata;
  }

  if (Array.isArray(planContent)) {
    return {
      format: 'array',
      length: planContent.length,
    };
  }

  if (typeof planContent === 'object') {
    const keys = Object.keys(planContent as Record<string, unknown>);
    return {
      format: 'object',
      keyCount: keys.length,
      topLevelKeys: keys.slice(0, 10),
    };
  }

  return {
    format: typeof planContent,
  };
}

/**
 * Extract context from request - uses request.context directly
 * The ExecutionContext is immutable and flows through the entire system unchanged.
 * We only extract individual fields for convenience in handlers.
 */
function buildPlanActionContext(
  _definition: AgentRuntimeDefinition,
  request: TaskRequestDto,
): {
  userId: string;
  conversationId: string;
  taskId: string;
  executionContext: ExecutionContext;
} {
  // Use request.context directly - it's the full ExecutionContext from transport-types
  const ctx = request.context;

  if (!ctx.userId) {
    throw new Error('Unable to determine user identity for plan operation');
  }

  if (!ctx.conversationId) {
    throw new Error('Missing conversationId for plan operation');
  }

  return {
    userId: ctx.userId,
    conversationId: ctx.conversationId,
    taskId: ctx.taskId,
    executionContext: ctx,
  };
}

function resolveOrganization(
  definition: AgentRuntimeDefinition,
  organizationSlug: string | null,
): string {
  const orgSlugs = definition.organizationSlug;
  const firstOrgSlug =
    Array.isArray(orgSlugs) && orgSlugs.length > 0 ? orgSlugs[0] : null;
  return organizationSlug ?? firstOrgSlug ?? 'global';
}

function normalizeUsage(usage: unknown): typeof EMPTY_USAGE {
  if (!usage || typeof usage !== 'object') {
    return EMPTY_USAGE;
  }

  const usageRec = usage as Record<string, unknown>;
  const inputTokens = numberOrZero(
    usageRec.inputTokens ??
      usageRec.promptTokens ??
      usageRec.total_input_tokens,
  );
  const outputTokens = numberOrZero(
    usageRec.outputTokens ??
      usageRec.completionTokens ??
      usageRec.total_output_tokens,
  );
  const totalTokens = numberOrZero(
    usageRec.totalTokens ?? usageRec.total_tokens,
    inputTokens + outputTokens,
  );
  const cost = numberOrZero(usageRec.cost ?? usageRec.price);

  return {
    inputTokens,
    outputTokens,
    totalTokens,
    cost,
  };
}

function createBaseMetadataFromLLM(
  response: LLMResponse | null,
): PlanResponseMetadata {
  if (!response) {
    return EMPTY_PLAN_METADATA;
  }

  return {
    provider: response.metadata?.provider ?? '',
    model: response.metadata?.model ?? '',
    usage: normalizeUsage(response.metadata?.usage),
  };
}

function serializePlan(
  plan: Plan | Record<string, unknown>,
  definition: AgentRuntimeDefinition,
  fallbackUserId: string,
): PlanCreateResponseContent['plan'] {
  const record = plan as Record<string, unknown>;

  const createdAt = toIsoString(
    record.createdAt ?? record.created_at ?? new Date().toISOString(),
  );
  const updatedAt = toIsoString(
    record.updatedAt ?? record.updated_at ?? createdAt,
  );

  const agentNameRaw: unknown =
    record.agentName ?? record.agent_name ?? definition.name ?? definition.slug;

  const userIdRaw: unknown = record.userId ?? record.user_id ?? fallbackUserId;
  const organizationRaw: unknown =
    record.organization ?? record.organizationSlug ?? 'default';

  const currentVersionIdRaw: unknown =
    record.currentVersionId ??
    record.current_version_id ??
    (record.currentVersion as { id?: unknown } | undefined)?.id;

  const idRaw: unknown = record.id;
  const conversationIdAlt: unknown =
    record.conversationId ?? record.conversation_id;
  const titleAlt: unknown = record.title ?? record.name;

  return {
    id: String(idRaw),
    conversationId: String(conversationIdAlt),
    userId: String(userIdRaw),
    agentName: String(agentNameRaw),
    organization: String(organizationRaw),
    title: typeof titleAlt === 'string' ? titleAlt : 'Plan',
    currentVersionId:
      typeof currentVersionIdRaw === 'string' ? currentVersionIdRaw : '',
    createdAt,
    updatedAt,
  };
}

function serializePlanVersion(
  version: unknown,
): PlanCreateResponseContent['version'] | null {
  if (!version) {
    return null;
  }

  const record = version as Record<string, unknown>;
  const rawFormat =
    typeof record.format === 'string' ? record.format : 'markdown';
  const format: 'json' | 'markdown' =
    rawFormat === 'text'
      ? 'markdown'
      : rawFormat === 'json'
        ? 'json'
        : 'markdown';

  return {
    id: record.id as string,
    planId: (record.planId ?? record.plan_id) as string,
    versionNumber: numberOrZero(
      record.versionNumber ?? record.version_number ?? 1,
      1,
    ),
    content: (record.content ?? '') as string,
    format,
    createdByType: (record.createdByType ??
      record.created_by_type ??
      'agent') as 'agent' | 'user',
    createdById: (record.createdById ?? record.created_by_id ?? null) as
      | string
      | null,
    metadata: record.metadata ?? undefined,
    isCurrentVersion: Boolean(
      record.isCurrentVersion ?? record.is_current_version,
    ),
    createdAt: toIsoString(record.createdAt ?? record.created_at),
  };
}

function normalizePlanContent(
  rawContent: unknown,
  planStructure: unknown,
): { content: string; parsed?: unknown } {
  if (planStructure) {
    const validated = validatePlanStructure(rawContent, planStructure);

    if (validated === undefined || validated === null) {
      return { content: '' };
    }

    if (typeof validated === 'string') {
      return { content: validated };
    }

    return {
      content: JSON.stringify(validated, null, 2),
      parsed: validated,
    };
  }

  if (typeof rawContent === 'string') {
    const candidate = extractCodeFenceContent(rawContent.trim());
    const parsed = tryParseJson(candidate);
    if (parsed !== null) {
      return {
        content: JSON.stringify(parsed, null, 2),
        parsed,
      };
    }

    return { content: candidate };
  }

  if (rawContent && typeof rawContent === 'object') {
    return {
      content: JSON.stringify(rawContent, null, 2),
      parsed: rawContent,
    };
  }

  if (rawContent === undefined || rawContent === null) {
    return { content: '' };
  }

  if (
    typeof rawContent === 'number' ||
    typeof rawContent === 'boolean' ||
    typeof rawContent === 'bigint'
  ) {
    return { content: rawContent.toString() };
  }

  if (
    typeof rawContent === 'symbol' ||
    typeof rawContent === 'function' ||
    (typeof rawContent === 'string' && rawContent.length === 0)
  ) {
    return { content: rawContent.toString() };
  }

  try {
    return {
      content: JSON.stringify(rawContent, null, 2),
    };
  } catch (error) {
    const reason =
      error instanceof Error ? error.message : 'Unable to stringify content';
    return { content: `Failed to stringify content: ${reason}` };
  }
}

function resolvePlanFormat(
  definition: AgentRuntimeDefinition,
): 'markdown' | 'json' | 'text' {
  const config = definition.config as Record<string, unknown> | undefined;
  const plan = config?.plan as Record<string, unknown> | undefined;
  const planning = config?.planning as Record<string, unknown> | undefined;
  const formatCandidate =
    plan?.format ??
    plan?.outputFormat ??
    planning?.format ??
    config?.planFormat;

  if (typeof formatCandidate === 'string') {
    const normalized = formatCandidate.toLowerCase();
    if (normalized === 'json') {
      return 'json';
    }
    if (normalized === 'markdown') {
      return 'markdown';
    }
  }

  return 'markdown';
}

function coercePlanContent(planContent: unknown): unknown {
  if (typeof planContent === 'string') {
    const candidate = extractCodeFenceContent(planContent.trim());
    const parsed = tryParseJson(candidate);
    return parsed !== null ? parsed : candidate;
  }

  if (Array.isArray(planContent)) {
    return planContent;
  }

  if (planContent && typeof planContent === 'object') {
    return planContent;
  }

  return planContent ?? '';
}

function tryParseJson(value: string): unknown {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    return null;
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function extractCodeFenceContent(value: string): string {
  const fencedMatch = value.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch && fencedMatch[1]) {
    return fencedMatch[1].trim();
  }
  return value;
}

function toIsoString(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === 'string') {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString();
    }
  }

  return new Date().toISOString();
}

function numberOrZero(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function normalizeLlmConfig(
  llmConfig: AgentRuntimeDefinition['llm'] | undefined,
): Record<string, unknown> | null {
  if (!llmConfig) {
    return null;
  }

  const provider =
    typeof llmConfig.provider === 'string'
      ? llmConfig.provider
      : typeof llmConfig.raw?.provider === 'string'
        ? llmConfig.raw.provider
        : undefined;

  const model =
    typeof llmConfig.model === 'string'
      ? llmConfig.model
      : typeof llmConfig.raw?.model === 'string'
        ? llmConfig.raw.model
        : undefined;

  const normalized: Record<string, unknown> = {};

  if (provider) {
    normalized.provider = provider;
    normalized.providerName = provider;
  }

  if (model) {
    normalized.model = model;
    normalized.modelName = model;
  }

  if (typeof llmConfig.temperature === 'number') {
    normalized.temperature = llmConfig.temperature;
  }

  if (typeof llmConfig.maxTokens === 'number') {
    normalized.maxTokens = llmConfig.maxTokens;
  }

  return Object.keys(normalized).length > 0 ? normalized : null;
}
