import * as AjvModule from 'ajv';
import { Logger } from '@nestjs/common';
import { AgentRuntimeDefinition } from '@agent-platform/interfaces/agent.interface';
import { LLMServiceProvider } from '@/planes/llm/llm.interface';
import { Agent2AgentConversationsService } from '../agent-conversations.service';
import { PlansService } from '../../plans/services/plans.service';
import { DeliverablesService } from '../../deliverables/deliverables.service';
import { TaskRequestDto, AgentTaskMode } from '../../dto/task-request.dto';
import { TaskResponseDto } from '../../dto/task-response.dto';
import type {
  BuildCopyVersionPayload,
  BuildDeletePayload,
  BuildDeleteVersionPayload,
  BuildEditPayload,
  BuildListPayload,
  BuildMergeVersionsPayload,
  BuildReadPayload,
  BuildRerunPayload,
  BuildSetCurrentPayload,
  BuildModePayload,
  DeliverableData,
  DeliverableVersionData,
  JsonObject,
  JsonValue,
  ExecutionContext,
} from '@orchestrator-ai/transport-types';
import {
  fetchExistingDeliverable,
  buildResponseMetadata,
  handleError,
} from './shared.helpers';

const logger = new Logger('BuildHandlers');

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

const isJsonObject = (value: JsonValue | undefined): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export interface BuildHandlerDependencies {
  deliverablesService: DeliverablesService;
  plansService: PlansService;
  llmService: LLMServiceProvider;
  conversationsService: Agent2AgentConversationsService;
}

export type ExecuteBuildFn = (
  definition: AgentRuntimeDefinition,
  request: TaskRequestDto,
  organizationSlug: string | null,
) => Promise<TaskResponseDto>;

/**
 * Validate build payload structure against transport-types
 * Ensures action field is present and valid for BUILD mode
 */
function validateBuildPayload(payload: unknown): payload is BuildModePayload {
  if (!payload || typeof payload !== 'object') {
    // Payload is optional for build create (defaults to 'create' action)
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
        `Invalid build action: ${typeof payloadObj.action === 'string' ? payloadObj.action : JSON.stringify(payloadObj.action)}. Must be one of: ${validActions.join(', ')}`,
      );
    }
  }

  return true;
}

/**
 * Handles BUILD read action by retrieving a deliverable.
 * @param definition - Agent definition context
 * @param request - Incoming task request payload
 * @param organizationSlug - Optional organization identifier
 * @param services - Supporting service dependencies
 * @returns A task response containing deliverable data
 */
export async function handleBuildRead(
  definition: AgentRuntimeDefinition,
  request: TaskRequestDto,
  organizationSlug: string | null,
  services: BuildHandlerDependencies,
): Promise<TaskResponseDto> {
  void organizationSlug;
  void services.plansService;
  void services.llmService;
  void services.conversationsService;

  try {
    // Validate payload structure
    validateBuildPayload(request.payload);

    const payload = (request.payload ?? {}) as Partial<BuildReadPayload>;
    const { userId, conversationId, executionContext } =
      buildBuildActionContext(definition, request);

    const existingDeliverable = (await fetchExistingDeliverable(
      services.deliverablesService,
      request,
    )) as Record<string, unknown> | null;

    if (!existingDeliverable) {
      return TaskResponseDto.failure(
        AgentTaskMode.BUILD,
        'No deliverable found for this conversation',
      );
    }

    const deliverableRecord = await services.deliverablesService.findOne(
      existingDeliverable.id as string,
      userId,
    );

    const baseDeliverable = serializeDeliverable(
      deliverableRecord,
      definition,
      userId,
    );

    if (payload.versionId) {
      const listResult = await services.deliverablesService.executeAction(
        'list',
        {
          includeArchived: true,
        },
        executionContext,
      );

      if (!listResult.success || !listResult.data) {
        return TaskResponseDto.failure(
          AgentTaskMode.BUILD,
          listResult.error?.message ??
            'Unable to list deliverable versions for version lookup',
        );
      }

      const versions = ((listResult.data as Record<string, unknown>).versions ??
        []) as unknown[];
      const targetVersion = versions.find(
        (version) =>
          (version as Record<string, unknown>).id === payload.versionId,
      );

      if (!targetVersion) {
        return TaskResponseDto.failure(
          AgentTaskMode.BUILD,
          `Deliverable version ${payload.versionId} not found`,
        );
      }

      const metadata = buildResponseMetadata(EMPTY_BUILD_METADATA, {
        requestedVersionId: payload.versionId,
        conversationId,
      });

      return TaskResponseDto.success(AgentTaskMode.BUILD, {
        content: {
          deliverable: baseDeliverable,
          version: serializeDeliverableVersion(targetVersion) ?? undefined,
        },
        metadata,
      });
    }

    const readResult = await services.deliverablesService.executeAction(
      'read',
      {},
      executionContext,
    );

    if (!readResult.success || !readResult.data) {
      return TaskResponseDto.failure(
        AgentTaskMode.BUILD,
        readResult.error?.message ?? 'Failed to read deliverable',
      );
    }

    const readData = readResult.data as Record<string, unknown> | undefined;
    const deliverableRaw: unknown = readData?.deliverable;
    const versionRaw: unknown = readData?.version;
    const responseDeliverable: unknown = deliverableRaw ?? deliverableRecord;
    const responseVersion: unknown =
      versionRaw ?? deliverableRecord.currentVersion ?? null;

    const metadata = buildResponseMetadata(EMPTY_BUILD_METADATA, {
      conversationId,
    });

    return TaskResponseDto.success(AgentTaskMode.BUILD, {
      content: {
        deliverable: serializeDeliverable(
          responseDeliverable,
          definition,
          userId,
        ),
        version: serializeDeliverableVersion(responseVersion) ?? undefined,
      },
      metadata,
    });
  } catch (error) {
    return handleError(AgentTaskMode.BUILD, error);
  }
}

/**
 * Handles BUILD list action by returning deliverable history.
 * @param definition - Agent definition context
 * @param request - Incoming task request payload
 * @param organizationSlug - Optional organization identifier
 * @param services - Supporting service dependencies
 * @returns A task response containing deliverable list data
 */
export async function handleBuildList(
  definition: AgentRuntimeDefinition,
  request: TaskRequestDto,
  organizationSlug: string | null,
  services: BuildHandlerDependencies,
): Promise<TaskResponseDto> {
  void organizationSlug;
  void services.plansService;
  void services.llmService;
  void services.conversationsService;

  try {
    // Validate payload structure
    validateBuildPayload(request.payload);

    const payload = (request.payload ?? {}) as Partial<BuildListPayload>;
    const { userId, executionContext } = buildBuildActionContext(
      definition,
      request,
    );

    const listResult = await services.deliverablesService.executeAction(
      'list',
      {
        includeArchived: payload.includeArchived ?? false,
      },
      executionContext,
    );

    if (!listResult.success || !listResult.data) {
      return TaskResponseDto.failure(
        AgentTaskMode.BUILD,
        listResult.error?.message ?? 'Failed to list deliverable versions',
      );
    }

    const deliverable = serializeDeliverable(
      (listResult.data as Record<string, unknown>).deliverable,
      definition,
      userId,
    );
    const rawVersions =
      (listResult.data as { versions?: unknown[] }).versions ?? [];
    const versions = rawVersions.map((version: unknown) =>
      serializeDeliverableVersion(version),
    );

    const metadata = buildResponseMetadata(EMPTY_BUILD_METADATA, {
      versionCount: versions.filter(
        (version): version is DeliverableVersionData => version !== null,
      ).length,
    });

    return TaskResponseDto.success(AgentTaskMode.BUILD, {
      content: {
        deliverables: [deliverable],
        versions: versions.filter(
          (version): version is DeliverableVersionData => version !== null,
        ),
      },
      metadata,
    });
  } catch (error) {
    return handleError(AgentTaskMode.BUILD, error);
  }
}

/**
 * Handles BUILD edit action by creating a new deliverable version.
 * @param definition - Agent definition context
 * @param request - Incoming task request payload
 * @param organizationSlug - Optional organization identifier
 * @param services - Supporting service dependencies
 * @returns A task response describing the updated deliverable
 */
export async function handleBuildEdit(
  definition: AgentRuntimeDefinition,
  request: TaskRequestDto,
  organizationSlug: string | null,
  services: BuildHandlerDependencies,
): Promise<TaskResponseDto> {
  void organizationSlug;
  void services.plansService;
  void services.llmService;
  void services.conversationsService;

  try {
    // Validate payload structure
    validateBuildPayload(request.payload);

    const payload = (request.payload ?? {}) as Partial<BuildEditPayload>;
    if (!payload.editedContent) {
      return TaskResponseDto.failure(
        AgentTaskMode.BUILD,
        'editedContent is required to edit a deliverable',
      );
    }

    const { userId, executionContext } = buildBuildActionContext(
      definition,
      request,
    );

    const normalizedContent =
      typeof payload.editedContent === 'string'
        ? payload.editedContent
        : JSON.stringify(payload.editedContent, null, 2);

    validateDeliverableStructure(
      normalizedContent,
      definition.deliverableStructure ?? null,
    );

    const ioSchemaOutput =
      (typeof definition.ioSchema === 'object' &&
        definition.ioSchema?.output) ??
      definition.ioSchema ??
      null;

    validateDeliverableSchema(normalizedContent, ioSchemaOutput);

    const metadataPayload = {
      comment: payload.comment,
      deliverableStructureApplied: Boolean(definition.deliverableStructure),
      ioSchemaApplied: Boolean(ioSchemaOutput),
    };

    const editResult = await services.deliverablesService.executeAction(
      'edit',
      {
        content: normalizedContent,
        metadata: metadataPayload,
      },
      executionContext,
    );

    if (!editResult.success || !editResult.data) {
      return TaskResponseDto.failure(
        AgentTaskMode.BUILD,
        editResult.error?.message ?? 'Failed to edit deliverable',
      );
    }

    const editResultData = editResult.data as Record<string, unknown>;
    const metadata = buildResponseMetadata(EMPTY_BUILD_METADATA, {
      source: 'manual-edit',
    });

    return TaskResponseDto.success(AgentTaskMode.BUILD, {
      content: {
        deliverable: serializeDeliverable(
          editResultData.deliverable,
          definition,
          userId,
        ),
        version:
          serializeDeliverableVersion(editResultData.version) ?? undefined,
      },
      metadata,
    });
  } catch (error) {
    return handleError(AgentTaskMode.BUILD, error);
  }
}

/**
 * Handles BUILD rerun action by regenerating a deliverable.
 * @param definition - Agent definition context
 * @param request - Incoming task request payload
 * @param organizationSlug - Optional organization identifier
 * @param services - Supporting service dependencies
 * @param executeBuild - Runner-provided build execution callback
 * @returns A task response containing regenerated deliverable data
 */
export async function handleBuildRerun(
  definition: AgentRuntimeDefinition,
  request: TaskRequestDto,
  organizationSlug: string | null,
  services: BuildHandlerDependencies,
  executeBuild: ExecuteBuildFn,
): Promise<TaskResponseDto> {
  logger.log('[BUILD-RERUN] handleBuildRerun() ENTRY');
  void organizationSlug;
  void services.plansService;
  void services.llmService;
  void services.conversationsService;

  try {
    // Validate payload structure
    validateBuildPayload(request.payload);

    const payload = (request.payload ?? {}) as unknown as BuildRerunPayload;
    logger.log(
      `[BUILD-RERUN] payload: versionId=${payload.versionId}, hasLlmOverride=${!!payload.llmOverride}`,
    );
    if (!payload.versionId || !payload.llmOverride) {
      logger.log('[BUILD-RERUN] FAILURE: missing versionId or llmOverride');
      return TaskResponseDto.failure(
        AgentTaskMode.BUILD,
        'versionId and llmOverride are required for rerun action',
      );
    }

    const { userId, conversationId, executionContext } =
      buildBuildActionContext(definition, request);

    const existingDeliverable = (await fetchExistingDeliverable(
      services.deliverablesService,
      request,
    )) as Record<string, unknown> | null;

    if (!existingDeliverable) {
      return TaskResponseDto.failure(
        AgentTaskMode.BUILD,
        'No deliverable found to rerun',
      );
    }

    const deliverableRecord = await services.deliverablesService.findOne(
      existingDeliverable.id as string,
      userId,
    );

    const listResult = await services.deliverablesService.executeAction(
      'list',
      {
        includeArchived: true,
      },
      executionContext,
    );

    if (!listResult.success || !listResult.data) {
      return TaskResponseDto.failure(
        AgentTaskMode.BUILD,
        listResult.error?.message ??
          'Unable to load deliverable versions for rerun',
      );
    }

    const versions = ((listResult.data as Record<string, unknown>).versions ??
      []) as unknown[];
    const sourceVersion = versions.find(
      (version) =>
        (version as Record<string, unknown>).id === payload.versionId,
    );

    if (!sourceVersion) {
      return TaskResponseDto.failure(
        AgentTaskMode.BUILD,
        `Deliverable version ${payload.versionId} not found`,
      );
    }

    const serializedDeliverable = serializeDeliverable(
      deliverableRecord,
      definition,
      userId,
    );

    const serializedVersion =
      serializeDeliverableVersion(sourceVersion) ?? undefined;

    const rerunPayload = {
      action: 'create' as const,
      title:
        ((request.payload as Record<string, unknown>)?.title as
          | string
          | undefined) ??
        deliverableRecord.title ??
        'Deliverable',
      type:
        ((request.payload as Record<string, unknown>)?.type as
          | string
          | undefined) ??
        deliverableRecord.type ??
        'document',
      planVersionId: (request.payload as Record<string, unknown>)
        ?.planVersionId,
      deliverableId: deliverableRecord.id,
      llmOverride: payload.llmOverride,
      rerunContext: {
        sourceVersion: serializedVersion,
        deliverable: serializedDeliverable,
      },
    };

    const rerunRequest: TaskRequestDto = {
      ...request,
      payload: rerunPayload as Record<string, unknown>,
      metadata: {
        ...(request.metadata ?? {}),
        buildRerun: {
          sourceVersionId: payload.versionId,
          llmOverride: payload.llmOverride,
        },
      },
    };

    logger.log('[BUILD-RERUN] Calling executeBuild with rerunPayload...');
    const rerunResponse = await executeBuild(
      definition,
      rerunRequest,
      organizationSlug,
    );
    logger.log(
      `[BUILD-RERUN] executeBuild returned: success=${rerunResponse.success}`,
    );

    if (!rerunResponse.success) {
      logger.log('[BUILD-RERUN] executeBuild failed');
      return rerunResponse;
    }

    const metadata = buildResponseMetadata(
      rerunResponse.payload.metadata ?? {},
      {
        sourceVersionId: payload.versionId,
        llmOverride: payload.llmOverride,
        conversationId,
        origin: 'rerun',
      },
    );

    const payloadContent = rerunResponse.payload.content as
      | Record<string, unknown>
      | undefined;
    const content: Record<string, unknown> = {
      ...(payloadContent ?? {}),
      sourceVersionId: payload.versionId,
    };

    return TaskResponseDto.success(AgentTaskMode.BUILD, {
      content,
      metadata,
    });
  } catch (error) {
    return handleError(AgentTaskMode.BUILD, error);
  }
}

/**
 * Handles BUILD set_current action by updating the active deliverable version.
 * @param definition - Agent definition context
 * @param request - Incoming task request payload
 * @param organizationSlug - Optional organization identifier
 * @param services - Supporting service dependencies
 * @returns A task response confirming the update
 */
export async function handleBuildSetCurrent(
  definition: AgentRuntimeDefinition,
  request: TaskRequestDto,
  organizationSlug: string | null,
  services: BuildHandlerDependencies,
): Promise<TaskResponseDto> {
  void organizationSlug;
  void services.plansService;
  void services.llmService;
  void services.conversationsService;

  try {
    // Validate payload structure
    validateBuildPayload(request.payload);

    const payload = (request.payload ??
      {}) as unknown as BuildSetCurrentPayload;
    if (!payload.versionId) {
      return TaskResponseDto.failure(
        AgentTaskMode.BUILD,
        'versionId is required to set current deliverable version',
      );
    }

    const { userId, executionContext } = buildBuildActionContext(
      definition,
      request,
    );

    const result = await services.deliverablesService.executeAction(
      'set_current',
      {
        versionId: payload.versionId,
      },
      executionContext,
    );

    if (!result.success || !result.data) {
      return TaskResponseDto.failure(
        AgentTaskMode.BUILD,
        result.error?.message ?? 'Failed to set current deliverable version',
      );
    }

    const resultData = result.data as Record<string, unknown>;
    const metadata = buildResponseMetadata(EMPTY_BUILD_METADATA, {
      updatedVersionId: payload.versionId,
    });

    return TaskResponseDto.success(AgentTaskMode.BUILD, {
      content: {
        deliverable: serializeDeliverable(
          resultData.deliverable,
          definition,
          userId,
        ),
        version: serializeDeliverableVersion(resultData.version) ?? undefined,
      },
      metadata,
    });
  } catch (error) {
    return handleError(AgentTaskMode.BUILD, error);
  }
}

/**
 * Handles BUILD delete_version action by removing a specific deliverable version.
 * @param definition - Agent definition context
 * @param request - Incoming task request payload
 * @param organizationSlug - Optional organization identifier
 * @param services - Supporting service dependencies
 * @returns A task response confirming version deletion
 */
export async function handleBuildDeleteVersion(
  definition: AgentRuntimeDefinition,
  request: TaskRequestDto,
  organizationSlug: string | null,
  services: BuildHandlerDependencies,
): Promise<TaskResponseDto> {
  void organizationSlug;
  void services.plansService;
  void services.llmService;
  void services.conversationsService;

  try {
    // Validate payload structure
    validateBuildPayload(request.payload);

    const payload = (request.payload ??
      {}) as unknown as BuildDeleteVersionPayload;
    if (!payload.versionId) {
      return TaskResponseDto.failure(
        AgentTaskMode.BUILD,
        'versionId is required to delete a deliverable version',
      );
    }

    const { userId, executionContext } = buildBuildActionContext(
      definition,
      request,
    );

    const deleteResult = await services.deliverablesService.executeAction(
      'delete_version',
      {
        versionId: payload.versionId,
      },
      executionContext,
    );

    if (!deleteResult.success || !deleteResult.data) {
      return TaskResponseDto.failure(
        AgentTaskMode.BUILD,
        deleteResult.error?.message ?? 'Failed to delete deliverable version',
      );
    }

    const deliverable = serializeDeliverable(
      (deleteResult.data as Record<string, unknown>).deliverable,
      definition,
      userId,
    );

    const rawRemainingVersions =
      (deleteResult.data as { remainingVersions?: unknown[] })
        .remainingVersions ?? [];
    const remainingVersions = rawRemainingVersions.map((version: unknown) =>
      serializeDeliverableVersion(version),
    );

    const metadata = buildResponseMetadata(EMPTY_BUILD_METADATA, {
      deletedVersionId: payload.versionId,
      remainingVersionCount: remainingVersions.filter(
        (version): version is DeliverableVersionData => version !== null,
      ).length,
    });

    return TaskResponseDto.success(AgentTaskMode.BUILD, {
      content: {
        deleted: true,
        deliverableId: deliverable.id,
        versionId: payload.versionId,
        remainingVersions: remainingVersions.filter(
          (version): version is DeliverableVersionData => version !== null,
        ),
      },
      metadata,
    });
  } catch (error) {
    return handleError(AgentTaskMode.BUILD, error);
  }
}

/**
 * Handles BUILD merge_versions action by combining multiple deliverable versions.
 * @param definition - Agent definition context
 * @param request - Incoming task request payload
 * @param organizationSlug - Optional organization identifier
 * @param services - Supporting service dependencies
 * @param executeBuild - Runner-provided build execution callback
 * @returns A task response describing the merged deliverable
 */
export async function handleBuildMergeVersions(
  definition: AgentRuntimeDefinition,
  request: TaskRequestDto,
  organizationSlug: string | null,
  services: BuildHandlerDependencies,
  executeBuild: ExecuteBuildFn,
): Promise<TaskResponseDto> {
  void organizationSlug;
  void services.plansService;
  void services.llmService;
  void services.conversationsService;

  try {
    // Validate payload structure
    validateBuildPayload(request.payload);

    const payload = (request.payload ??
      {}) as unknown as BuildMergeVersionsPayload;
    if (!payload.versionIds || payload.versionIds.length < 2) {
      return TaskResponseDto.failure(
        AgentTaskMode.BUILD,
        'At least two versionIds are required to merge versions',
      );
    }

    if (!payload.mergePrompt || payload.mergePrompt.trim().length === 0) {
      return TaskResponseDto.failure(
        AgentTaskMode.BUILD,
        'mergePrompt is required to merge versions',
      );
    }

    const { userId, conversationId, executionContext } =
      buildBuildActionContext(definition, request);

    const existingDeliverable = (await fetchExistingDeliverable(
      services.deliverablesService,
      request,
    )) as Record<string, unknown> | null;

    if (!existingDeliverable) {
      return TaskResponseDto.failure(
        AgentTaskMode.BUILD,
        'No deliverable found to merge',
      );
    }

    const deliverableRecord = await services.deliverablesService.findOne(
      existingDeliverable.id as string,
      userId,
    );

    const listResult = await services.deliverablesService.executeAction(
      'list',
      {
        includeArchived: true,
      },
      executionContext,
    );

    if (!listResult.success || !listResult.data) {
      return TaskResponseDto.failure(
        AgentTaskMode.BUILD,
        listResult.error?.message ??
          'Unable to load deliverable versions for merging',
      );
    }

    const versions = ((listResult.data as Record<string, unknown>).versions ??
      []) as unknown[];
    const sourceVersions = payload.versionIds
      .map((versionId) =>
        versions.find(
          (version) => (version as Record<string, unknown>).id === versionId,
        ),
      )
      .filter((version): version is Record<string, unknown> =>
        Boolean(version),
      );

    if (sourceVersions.length !== payload.versionIds.length) {
      return TaskResponseDto.failure(
        AgentTaskMode.BUILD,
        'One or more versions could not be found for merging',
      );
    }

    const serializedDeliverable = serializeDeliverable(
      deliverableRecord,
      definition,
      userId,
    );

    const serializedVersions = sourceVersions
      .map((version) => serializeDeliverableVersion(version))
      .filter((version): version is DeliverableVersionData => Boolean(version));

    const mergePayload = {
      action: 'create' as const,
      title:
        ((request.payload as Record<string, unknown>)?.title as
          | string
          | undefined) ??
        deliverableRecord.title ??
        'Deliverable',
      type:
        ((request.payload as Record<string, unknown>)?.type as
          | string
          | undefined) ??
        deliverableRecord.type ??
        'document',
      planVersionId: (request.payload as Record<string, unknown>)
        ?.planVersionId,
      deliverableId: deliverableRecord.id,
      mergeContext: {
        versionIds: payload.versionIds,
        mergePrompt: payload.mergePrompt,
        sourceVersions: serializedVersions,
        deliverable: serializedDeliverable,
      },
    };

    const mergeRequest: TaskRequestDto = {
      ...request,
      payload: mergePayload as Record<string, unknown>,
      metadata: {
        ...(request.metadata ?? {}),
        buildMerge: {
          versionIds: payload.versionIds,
          mergePrompt: payload.mergePrompt,
        },
      },
    };

    const mergeResponse = await executeBuild(
      definition,
      mergeRequest,
      organizationSlug,
    );

    if (!mergeResponse.success) {
      return mergeResponse;
    }

    const metadata = buildResponseMetadata(
      mergeResponse.payload.metadata ?? {},
      {
        sourceVersionIds: payload.versionIds,
        mergePrompt: payload.mergePrompt,
        conversationId,
        origin: 'merge',
      },
    );

    const mergePayloadContent = mergeResponse.payload.content as
      | Record<string, unknown>
      | undefined;
    const content: Record<string, unknown> = {
      ...(mergePayloadContent ?? {}),
      sourceVersionIds: payload.versionIds,
    };

    return TaskResponseDto.success(AgentTaskMode.BUILD, {
      content,
      metadata,
    });
  } catch (error) {
    return handleError(AgentTaskMode.BUILD, error);
  }
}

/**
 * Handles BUILD copy_version action by duplicating a deliverable version.
 * @param definition - Agent definition context
 * @param request - Incoming task request payload
 * @param organizationSlug - Optional organization identifier
 * @param services - Supporting service dependencies
 * @returns A task response containing copied deliverable data
 */
export async function handleBuildCopyVersion(
  definition: AgentRuntimeDefinition,
  request: TaskRequestDto,
  organizationSlug: string | null,
  services: BuildHandlerDependencies,
): Promise<TaskResponseDto> {
  void organizationSlug;
  void services.plansService;
  void services.llmService;
  void services.conversationsService;

  try {
    // Validate payload structure
    validateBuildPayload(request.payload);

    const payload = (request.payload ??
      {}) as unknown as BuildCopyVersionPayload;
    if (!payload.versionId) {
      return TaskResponseDto.failure(
        AgentTaskMode.BUILD,
        'versionId is required to copy a deliverable version',
      );
    }

    const { userId, executionContext } = buildBuildActionContext(
      definition,
      request,
    );

    const copyResult = await services.deliverablesService.executeAction(
      'copy_version',
      {
        versionId: payload.versionId,
      },
      executionContext,
    );

    if (!copyResult.success || !copyResult.data) {
      return TaskResponseDto.failure(
        AgentTaskMode.BUILD,
        copyResult.error?.message ?? 'Failed to copy deliverable version',
      );
    }

    const copyResultData = copyResult.data as Record<string, unknown>;
    const metadata = buildResponseMetadata(EMPTY_BUILD_METADATA, {
      sourceVersionId: payload.versionId,
      copiedVersionId: (
        copyResultData.copiedVersion as Record<string, unknown> | undefined
      )?.id,
    });

    const targetDeliverable =
      copyResultData.targetDeliverable ??
      copyResultData.sourceDeliverable ??
      copyResultData.deliverable ??
      {};

    return TaskResponseDto.success(AgentTaskMode.BUILD, {
      content: {
        deliverable: serializeDeliverable(
          targetDeliverable,
          definition,
          userId,
        ),
        version:
          serializeDeliverableVersion(copyResultData.copiedVersion) ??
          undefined,
        sourceVersion:
          serializeDeliverableVersion(copyResultData.sourceVersion) ??
          undefined,
      },
      metadata,
    });
  } catch (error) {
    return handleError(AgentTaskMode.BUILD, error);
  }
}

/**
 * Handles BUILD delete action by removing an entire deliverable.
 * @param definition - Agent definition context
 * @param request - Incoming task request payload
 * @param organizationSlug - Optional organization identifier
 * @param services - Supporting service dependencies
 * @returns A task response confirming deliverable deletion
 */
export async function handleBuildDelete(
  definition: AgentRuntimeDefinition,
  request: TaskRequestDto,
  organizationSlug: string | null,
  services: BuildHandlerDependencies,
): Promise<TaskResponseDto> {
  void organizationSlug;
  void services.plansService;
  void services.llmService;
  void services.conversationsService;

  try {
    // Validate payload structure
    validateBuildPayload(request.payload);

    const payload = (request.payload ?? {}) as unknown as BuildDeletePayload;
    void payload;

    const { userId, executionContext } = buildBuildActionContext(
      definition,
      request,
    );

    const deleteResult = await services.deliverablesService.executeAction(
      'delete',
      {},
      executionContext,
    );

    if (!deleteResult.success || !deleteResult.data) {
      return TaskResponseDto.failure(
        AgentTaskMode.BUILD,
        deleteResult.error?.message ?? 'Failed to delete deliverable',
      );
    }

    const deleteResultData = deleteResult.data as Record<string, unknown>;
    const deletedDeliverableId =
      deleteResultData.deletedDeliverableId ??
      deleteResultData.deletedPlanId ??
      '';

    const metadata = buildResponseMetadata(EMPTY_BUILD_METADATA, {
      deletedDeliverableId,
      deletedVersionCount: deleteResultData.deletedVersionCount ?? 0,
    });

    return TaskResponseDto.success(AgentTaskMode.BUILD, {
      content: {
        deleted: true,
        deliverableId: deletedDeliverableId,
        deletedVersionCount: deleteResultData.deletedVersionCount ?? 0,
        userId,
      },
      metadata,
    });
  } catch (error) {
    return handleError(AgentTaskMode.BUILD, error);
  }
}

/**
 * Validates deliverable content against the configured structure.
 * @param deliverableContent - Generated deliverable payload
 * @param deliverableStructure - Expected structure definition
 */
export function validateDeliverableStructure(
  deliverableContent: unknown,
  deliverableStructure: unknown,
): void {
  if (!deliverableStructure) {
    return;
  }

  const schema =
    typeof deliverableStructure === 'string'
      ? parseJsonSafely(
          deliverableStructure,
          'deliverable_structure must be valid JSON',
        )
      : deliverableStructure;

  const ajv = new Ajv({
    allErrors: true,
  });

  const validate = ajv.compile(schema as Record<string, unknown>);
  const candidate = coerceDeliverableContent(deliverableContent);

  if (!validate(candidate)) {
    const message = ajv.errorsText(validate.errors, { separator: '; ' });
    const error = new Error(
      `Deliverable does not conform to agent structure: ${message}`,
    ) as Error & { details?: unknown };
    error.details = validate.errors;
    throw error;
  }
}

/**
 * Validates deliverable content against an IO schema definition.
 * @param deliverableContent - Generated deliverable payload
 * @param ioSchema - IO schema definition
 */
export function validateDeliverableSchema(
  deliverableContent: unknown,
  ioSchema: unknown,
): void {
  if (!ioSchema) {
    return;
  }

  const schema =
    typeof ioSchema === 'string'
      ? parseJsonSafely(ioSchema, 'io_schema output must be valid JSON')
      : ioSchema;

  const ajv = new Ajv({
    allErrors: true,
  });

  const validate = ajv.compile(schema as Record<string, unknown>);

  // For io_schema validation, we need the ORIGINAL wrapped format (not unwrapped)
  // So parse the string but don't unwrap
  let candidate = deliverableContent;
  if (typeof deliverableContent === 'string') {
    const extracted = extractCodeFenceContent(deliverableContent.trim());
    const parsed = tryParseJson(extracted);
    candidate = parsed !== null ? parsed : extracted;
  }

  if (!validate(candidate)) {
    const message = ajv.errorsText(validate.errors, { separator: '; ' });
    const error = new Error(
      `Deliverable output does not conform to io_schema: ${message}`,
    ) as Error & { details?: unknown };
    error.details = validate.errors;
    throw error;
  }
}

const EMPTY_USAGE = {
  inputTokens: 0 as number,
  outputTokens: 0 as number,
  totalTokens: 0 as number,
  cost: 0 as number,
};

const EMPTY_BUILD_METADATA = {
  provider: '',
  model: '',
  usage: EMPTY_USAGE,
};

/**
 * Extract context from request - uses request.context directly
 * The ExecutionContext is immutable and flows through the entire system unchanged.
 * We only extract individual fields for convenience in handlers.
 */
function buildBuildActionContext(
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
    throw new Error('Unable to determine user identity for build operation');
  }

  if (!ctx.conversationId) {
    throw new Error('Missing conversationId for build operation');
  }

  return {
    userId: ctx.userId,
    conversationId: ctx.conversationId,
    taskId: ctx.taskId,
    executionContext: ctx,
  };
}

function _sanitizeMetadata(
  value: Record<string, unknown> | undefined,
): JsonObject {
  if (!value) {
    return {};
  }

  const jsonValue = toJsonValue(value);
  return isJsonObject(jsonValue) ? jsonValue : {};
}

function toJsonValue(value: unknown): JsonValue | undefined {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    const mapped = value
      .map((entry) => toJsonValue(entry))
      .filter((entry): entry is JsonValue => entry !== undefined);
    return mapped as JsonValue;
  }

  if (typeof value === 'object') {
    const result: JsonObject = {};
    Object.entries(value as Record<string, unknown>).forEach(([key, entry]) => {
      const jsonEntry = toJsonValue(entry);
      if (jsonEntry !== undefined) {
        result[key] = jsonEntry;
      }
    });
    return result;
  }

  return undefined;
}

function serializeDeliverable(
  deliverable: unknown,
  definition: AgentRuntimeDefinition,
  fallbackUserId: string,
): DeliverableData {
  const d = deliverable as Record<string, unknown>;
  const createdAtRaw: unknown = d.createdAt ?? d.created_at;
  const createdAt = toIsoString(
    (typeof createdAtRaw === 'string' ? createdAtRaw : null) ??
      new Date().toISOString(),
  );
  const updatedAtRaw: unknown = d.updatedAt ?? d.updated_at;
  const updatedAt = toIsoString(
    (typeof updatedAtRaw === 'string' ? updatedAtRaw : null) ?? createdAt,
  );

  const userIdRaw: unknown = d.userId ?? d.user_id;
  const userId: unknown = userIdRaw ?? fallbackUserId;

  const organizationRaw: unknown = d.organization ?? d.organizationSlug;
  const organization: unknown =
    organizationRaw ??
    definition.organizationSlug ??
    definition.context?.organizationSlug ??
    'global';

  const currentVersionId =
    d.currentVersionId ??
    d.current_version_id ??
    (d.currentVersion as Record<string, unknown> | undefined)?.id ??
    '';

  return {
    id: d.id as string,
    conversationId: (d.conversationId ?? d.conversation_id ?? '') as string,
    userId: userId as string,
    agentName: (d.agentName ??
      d.agent_name ??
      definition.name ??
      definition.slug) as string,
    organization: organization as string,
    title: (d.title ?? 'Deliverable') as string,
    type: (d.type ?? d.deliverableType ?? 'document') as string,
    currentVersionId: currentVersionId as string,
    createdAt,
    updatedAt,
  };
}

function serializeDeliverableVersion(
  version: unknown,
): DeliverableVersionData | null {
  if (!version) {
    return null;
  }

  const v = version as Record<string, unknown>;
  const formatRaw = v.format ?? v.deliverableFormat ?? 'markdown';
  const normalizedFormat =
    typeof formatRaw === 'string'
      ? normalizeDeliverableFormat(formatRaw)
      : 'markdown';

  return {
    id: v.id as string,
    deliverableId: (v.deliverableId ?? v.deliverable_id ?? '') as string,
    versionNumber: numberOrZero(v.versionNumber ?? v.version_number ?? 1, 1),
    content: (v.content ?? '') as string,
    format: normalizedFormat,
    createdByType: (v.createdByType ?? v.created_by_type ?? 'agent') as
      | 'agent'
      | 'user',
    createdById: (v.createdById ?? v.created_by_id ?? null) as string | null,
    metadata: (v.metadata ?? undefined) as JsonObject | undefined,
    isCurrentVersion: Boolean(v.isCurrentVersion ?? v.is_current_version),
    createdAt: toIsoString(v.createdAt ?? v.created_at),
  };
}

function normalizeDeliverableFormat(
  format: string,
): 'markdown' | 'json' | 'html' {
  const normalized = format.toLowerCase();
  if (normalized.includes('json')) {
    return 'json';
  }
  if (normalized === 'html' || normalized.includes('html')) {
    return 'html';
  }
  return 'markdown';
}

function coerceDeliverableContent(content: unknown): unknown {
  if (typeof content === 'string') {
    const candidate = extractCodeFenceContent(content.trim());
    const parsed = tryParseJson(candidate);

    // If parsed successfully, check if it's wrapped in io_schema output format
    if (
      parsed !== null &&
      typeof parsed === 'object' &&
      !Array.isArray(parsed)
    ) {
      // Check for common io_schema output wrappers and extract the actual deliverable
      if ('blog_post' in parsed) {
        return parsed.blog_post;
      }
      if ('deliverable' in parsed) {
        return parsed.deliverable;
      }
      if ('data' in parsed) {
        return parsed.data;
      }
    }

    return parsed !== null ? parsed : candidate;
  }

  if (Array.isArray(content)) {
    return content;
  }

  if (content && typeof content === 'object') {
    // Check if this is an io_schema wrapped object
    const obj = content as Record<string, unknown>;
    if ('blog_post' in obj) {
      return obj.blog_post;
    }
    if ('deliverable' in obj) {
      return obj.deliverable;
    }
    if ('data' in obj) {
      return obj.data;
    }
    return content;
  }

  return content ?? '';
}

function tryParseJson(value: string): unknown {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();

  // First try: parse the entire string if it starts with JSON
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      return JSON.parse(trimmed);
    } catch {
      // Fall through to search for JSON within the string
    }
  }

  // Second try: search for JSON within the string (for models that output thinking text first)
  // Look for the first occurrence of { or [ and try to parse from there
  const jsonStartIndex = Math.min(
    trimmed.indexOf('{') >= 0 ? trimmed.indexOf('{') : Infinity,
    trimmed.indexOf('[') >= 0 ? trimmed.indexOf('[') : Infinity,
  );

  if (jsonStartIndex !== Infinity && jsonStartIndex > 0) {
    const possibleJson = trimmed.substring(jsonStartIndex);
    try {
      return JSON.parse(possibleJson);
    } catch {
      // Fall through to original parsing attempt
    }
  }

  // Original parsing attempt (will fail but we tried)
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

function parseJsonSafely(value: string, errorMessage: string): unknown {
  try {
    return JSON.parse(value);
  } catch (error) {
    const reason =
      error instanceof Error ? error.message : 'Unable to parse JSON';
    throw new Error(`${errorMessage}: ${reason}`);
  }
}
