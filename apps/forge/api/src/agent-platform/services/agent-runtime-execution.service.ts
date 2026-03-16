import { Injectable } from '@nestjs/common';
import type { JsonObject, JsonValue } from '@orchestrator-ai/transport-types';
import { AgentRuntimeDefinition } from '../interfaces/agent.interface';
import { AgentRuntimeAgentMetadata } from '../interfaces/agent-runtime-agent-metadata.interface';

export type RuntimeMetadataExtras = JsonObject;

/**
 * AgentRuntimeExecutionService
 *
 * Pure utility service for building metadata objects from agent definitions and requests.
 * This service does NOT receive or require ExecutionContext because it performs no LLM calls,
 * no database writes, and no observability events — it only assembles plain data objects
 * (AgentRuntimeAgentMetadata, JsonObject run-metadata) that are then used by callers
 * that do hold the ExecutionContext (e.g., AgentModeRouterService).
 */
@Injectable()
export class AgentRuntimeExecutionService {
  getAgentMetadataFromDefinition(
    definition: AgentRuntimeDefinition,
    organizationSlug: string | null,
  ): AgentRuntimeAgentMetadata {
    return {
      id: definition.slug, // Use slug as ID in v2
      slug: definition.slug,
      displayName: definition.name ?? null,
      type: definition.agentType ?? null,
      organizationSlug,
    };
  }

  collectRequestMetadata(request: {
    payload?: { metadata?: unknown };
    metadata?: unknown;
  }): JsonObject {
    const result: JsonObject = {};

    const payloadMetadata = this.asJsonObject(request.payload?.metadata);
    if (payloadMetadata) {
      Object.assign(result, payloadMetadata);
    }

    const requestMetadata = this.asJsonObject(request.metadata);
    if (requestMetadata) {
      Object.assign(result, requestMetadata);
    }

    return result;
  }

  enrichPlanDraft(
    draft: unknown,
    agent: AgentRuntimeAgentMetadata,
  ): JsonObject {
    const planDraft = this.asJsonObject(draft) ?? {};
    const result = this.cloneJsonObject(planDraft);
    const existingMeta = this.getJsonObject(result['_meta']);

    const meta: JsonObject = {
      ...(existingMeta ?? {}),
      agent,
    };

    result['_meta'] = meta;

    return result;
  }

  buildRunMetadata(
    base: JsonObject,
    agent: AgentRuntimeAgentMetadata,
    extras: RuntimeMetadataExtras = {},
  ): JsonObject {
    const merged = this.cloneJsonObject(base);
    Object.assign(merged, extras);

    merged.agentId = agent.id;
    merged.agentSlug = agent.slug;
    merged.agentType = agent.type ?? null;
    merged.organizationSlug = agent.organizationSlug ?? null;

    return merged;
  }

  private asJsonObject(value: unknown): JsonObject | undefined {
    return this.isJsonObject(value) ? value : undefined;
  }

  private cloneJsonObject(source: JsonObject): JsonObject {
    const clone: JsonObject = { ...source };
    return clone;
  }

  private getJsonObject(value: JsonValue | undefined): JsonObject | undefined {
    return this.isJsonObject(value) ? value : undefined;
  }

  private isJsonObject(value: unknown): value is JsonObject {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
