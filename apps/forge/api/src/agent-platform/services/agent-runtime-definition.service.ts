import { Injectable, Logger } from '@nestjs/common';
import type {
  JsonArray,
  JsonObject,
  JsonValue,
} from '@orchestrator-ai/transport-types';
import { load as yamlLoad } from 'js-yaml';
import { AgentRecord } from '../interfaces/agent.interface';
import {
  AgentConfigDefinition,
  AgentCommunicationDefinition,
  AgentExecutionDefinition,
  AgentHierarchyDefinition,
  AgentLLMDefinition,
  AgentMetadataDefinition,
  AgentPromptDefinition,
  AgentRuntimeDefinition,
  AgentSkillDefinition,
  AgentTransportDefinition,
} from '../interfaces/agent.interface';

type UnknownRecord = JsonObject | null | undefined;

@Injectable()
export class AgentRuntimeDefinitionService {
  private readonly logger = new Logger(AgentRuntimeDefinitionService.name);

  /**
   * Resolve endpoint URL for api/external agents.
   * LangGraph agents are internal (type=langgraph, endpoint=null) and don't use this.
   */
  private resolveEndpointUrl(url: string): string {
    return url;
  }

  buildDefinition(record: AgentRecord): AgentRuntimeDefinition {
    // Parse context as markdown (may contain YAML frontmatter or structured data)
    const descriptor = this.parseContextAsDescriptor(record.context);

    const metadata = this.extractMetadata(record, descriptor);
    const hierarchy = this.extractHierarchy(descriptor);
    const capabilities = record.capabilities || [];
    const skills = this.extractSkills(descriptor);
    const communication = this.extractCommunication(descriptor);
    const execution = this.extractExecution(record, descriptor);
    const transport = this.extractTransport(record, descriptor);
    const llm = this.extractLlm(record, descriptor);
    const prompts = this.extractPrompts(record, descriptor, llm);
    const contextObj = this.parseContextObject(record.context);
    const config = this.buildConfig(record, descriptor);

    // Use io_schema from database, fall back to descriptor if available
    const ioSchema =
      record.io_schema || this.toJsonObject(descriptor?.io_schema) || null;

    // Extract plan and deliverable structures from metadata and descriptor
    const metadataConfig = this.toJsonObject(record.metadata);
    const descriptorConfig = this.toJsonObject(descriptor?.configuration);

    const planStructure = this.resolveSchema(
      metadataConfig?.plan_structure,
      metadataConfig?.planStructure,
      descriptorConfig?.plan_structure,
      descriptorConfig?.planStructure,
      descriptor?.plan_structure,
      descriptor?.planStructure,
    );

    const deliverableStructure = this.resolveSchema(
      metadataConfig?.deliverable_structure,
      metadataConfig?.deliverableStructure,
      descriptorConfig?.deliverable_structure,
      descriptorConfig?.deliverableStructure,
      descriptor?.deliverable_structure,
      descriptor?.deliverableStructure,
    );

    return {
      slug: record.slug,
      organizationSlug: record.organization_slug,
      name: record.name,
      description: record.description,
      agentType: record.agent_type,
      department: record.department,
      tags: record.tags,
      metadata,
      hierarchy,
      capabilities,
      skills,
      communication,
      execution,
      transport,
      llm,
      prompts,
      context: contextObj,
      config,
      agentCard: this.toJsonObject(record.metadata?.agent_card) ?? null,
      rawDescriptor: descriptor,
      ioSchema,
      planStructure: planStructure ?? undefined,
      deliverableStructure: deliverableStructure ?? undefined,
      record,
    };
  }

  /**
   * Parse context field as descriptor - context may contain YAML frontmatter or structured metadata
   */
  private parseContextAsDescriptor(
    context: string | null | undefined,
  ): JsonObject | null {
    if (!context || typeof context !== 'string' || !context.trim()) {
      return null;
    }

    // Try to extract YAML frontmatter (between --- markers)
    const frontmatterMatch = context.match(/^---\n([\s\S]*?)\n---/);
    if (frontmatterMatch && frontmatterMatch[1]) {
      try {
        const parsed = yamlLoad(frontmatterMatch[1]);
        const jsonObject = this.toJsonObject(parsed);
        if (jsonObject) {
          return jsonObject;
        }
      } catch (error) {
        this.logger.warn(`Unable to parse YAML frontmatter: ${String(error)}`);
      }
    }

    return null;
  }

  /**
   * Parse context as a JSON object for runtime use
   */
  private parseContextObject(
    context: string | null | undefined,
  ): JsonObject | null {
    if (!context || typeof context !== 'string' || !context.trim()) {
      return null;
    }

    // Return a structured object with the markdown content
    return {
      markdown: context,
      raw: context,
    } as JsonObject;
  }

  private extractMetadata(
    record: AgentRecord,
    descriptor: UnknownRecord,
  ): AgentMetadataDefinition {
    const metadataNode = this.toJsonObject(descriptor?.metadata);
    const tags =
      record.tags || this.toStringArray(metadataNode?.tags ?? descriptor?.tags);

    return {
      name: record.name,
      displayName: record.name, // Use name for displayName in v2
      description: record.description,
      category:
        this.asString(metadataNode?.category) ??
        this.asString(descriptor?.category) ??
        record.department,
      version: record.version,
      type: record.agent_type,
      provider: this.asString(metadataNode?.provider) ?? null,
      tags,
      raw: this.toJsonObject(record.metadata) ?? metadataNode ?? null,
    };
  }

  private extractHierarchy(
    descriptor: UnknownRecord,
  ): AgentHierarchyDefinition | undefined {
    const hierarchyNode = this.toJsonObject(descriptor?.hierarchy);
    if (!hierarchyNode) {
      return undefined;
    }

    return {
      level: this.asString(hierarchyNode.level),
      reportsTo: this.asString(hierarchyNode.reportsTo),
      department: this.asString(hierarchyNode.department),
      team: this.toStringArray(hierarchyNode.team),
      path: this.asString(hierarchyNode.path),
    };
  }

  private extractCapabilities(descriptor: UnknownRecord): string[] {
    return this.toStringArray(descriptor?.capabilities);
  }

  private extractSkills(descriptor: UnknownRecord): AgentSkillDefinition[] {
    const skills = this.toJsonArray(descriptor?.skills);
    if (!skills) {
      return [];
    }

    return skills
      .map((skill) => this.toJsonObject(skill))
      .filter((skill): skill is JsonObject => Boolean(skill))
      .map((skill) => ({
        id: this.asString(skill.id),
        name: this.asString(skill.name) ?? 'Unnamed skill',
        description: this.asString(skill.description),
        tags: this.toStringArray(skill.tags),
        examples: this.toStringArray(skill.examples),
        inputModes: this.toStringArray(skill.input_modes ?? skill.inputModes),
        outputModes: this.toStringArray(
          skill.output_modes ?? skill.outputModes,
        ),
        skillOrder: this.asNumber(skill.skillOrder ?? skill.skill_order),
        isPrimary: this.asBoolean(skill.isPrimary ?? skill.is_primary),
        metadata: this.toJsonObject(skill.metadata) ?? undefined,
      }));
  }

  private extractCommunication(
    descriptor: UnknownRecord,
  ): AgentCommunicationDefinition {
    return {
      inputModes: this.toStringArray(
        descriptor?.input_modes ?? descriptor?.inputModes,
      ),
      outputModes: this.toStringArray(
        descriptor?.output_modes ?? descriptor?.outputModes,
      ),
    };
  }

  private extractExecution(
    record: AgentRecord,
    descriptor: UnknownRecord,
  ): AgentExecutionDefinition {
    const configuration = this.toJsonObject(descriptor?.configuration);
    const metadataConfig = this.toJsonObject(record.metadata);

    const executionCaps =
      this.toJsonObject(
        configuration?.execution_capabilities ??
          configuration?.executionCapabilities ??
          metadataConfig?.execution_capabilities ??
          metadataConfig?.executionCapabilities,
      ) ?? null;

    const executionProfile =
      this.asString(configuration?.execution_profile) ??
      this.asString(configuration?.executionProfile) ??
      this.asString(metadataConfig?.execution_profile) ??
      this.asString(metadataConfig?.executionProfile) ??
      undefined;

    // Determine modeProfile from agent_type and capabilities
    const modeProfile = this.determineModeProfile(record);

    return {
      modeProfile,
      canConverse:
        this.asBoolean(executionCaps?.can_converse) ??
        this.asBoolean(executionCaps?.canConverse) ??
        true,
      canPlan:
        this.asBoolean(executionCaps?.can_plan) ??
        this.asBoolean(executionCaps?.canPlan) ??
        this.guessCanPlan(modeProfile),
      canBuild:
        this.asBoolean(executionCaps?.can_build) ??
        this.asBoolean(executionCaps?.canBuild) ??
        this.guessCanBuild(modeProfile),
      canOrchestrate:
        this.asBoolean(executionCaps?.can_orchestrate) ??
        this.asBoolean(executionCaps?.canOrchestrate) ??
        this.guessCanOrchestrate(modeProfile),
      requiresHumanGate:
        this.asBoolean(executionCaps?.requires_human_gate) ??
        this.asBoolean(executionCaps?.requiresHumanGate) ??
        false,
      executionProfile,
      timeoutSeconds:
        this.asNumber(configuration?.timeout_seconds) ??
        this.asNumber(configuration?.timeoutSeconds) ??
        this.asNumber(metadataConfig?.timeout_seconds) ??
        this.asNumber(metadataConfig?.timeoutSeconds),
    };
  }

  private determineModeProfile(record: AgentRecord): string {
    // Use metadata.mode_profile if available
    const metadataConfig = this.toJsonObject(record.metadata);
    const storedMode = this.asString(metadataConfig?.mode_profile);
    if (storedMode) {
      return storedMode;
    }

    // Infer from agent_type and capabilities
    const caps = record.capabilities || [];
    if (caps.includes('orchestrate')) {
      return 'full_orchestration';
    }
    if (caps.includes('plan') && caps.includes('build')) {
      return 'plan_and_build';
    }
    if (caps.includes('plan')) {
      return 'conversation_with_planning';
    }

    // Default based on agent_type
    return 'conversation_only';
  }

  private extractTransport(
    record: AgentRecord,
    descriptor: UnknownRecord,
  ): AgentTransportDefinition | undefined {
    // Use record.endpoint for api/external agents
    const endpointConfig =
      record.endpoint ??
      this.toJsonObject(descriptor?.api_configuration) ??
      this.toJsonObject(descriptor?.external_a2a_configuration);

    if (!endpointConfig) {
      return undefined;
    }

    // Determine if this is an API or external agent
    if (record.agent_type === 'api' || descriptor?.api_configuration) {
      const headers = this.toStringRecord(endpointConfig.headers);
      const authentication =
        endpointConfig.authentication === null
          ? null
          : (this.toJsonObject(endpointConfig.authentication) ?? null);
      const requestTransform =
        this.toJsonObject(
          endpointConfig.request_transform ?? endpointConfig.requestTransform,
        ) ?? null;
      const responseTransform =
        this.toJsonObject(
          endpointConfig.response_transform ?? endpointConfig.responseTransform,
        ) ?? null;
      return {
        kind: 'api',
        api: {
          // Support both 'endpoint' and 'url' field names
          endpoint: this.resolveEndpointUrl(
            this.asString(endpointConfig.endpoint) ??
              this.asString(endpointConfig.url) ??
              '',
          ),
          method: this.asString(endpointConfig.method) ?? 'POST',
          timeout: this.asNumber(endpointConfig.timeout),
          headers,
          authentication,
          requestTransform: requestTransform ?? undefined,
          responseTransform: responseTransform ?? undefined,
        },
        raw: endpointConfig,
      };
    }

    // External agent configuration
    if (
      record.agent_type === 'external' ||
      descriptor?.external_a2a_configuration
    ) {
      const authentication =
        endpointConfig.authentication === null
          ? null
          : (this.toJsonObject(endpointConfig.authentication) ?? null);
      const retry =
        endpointConfig.retry === null
          ? null
          : (this.toJsonObject(endpointConfig.retry) ?? null);
      const healthCheck =
        this.toJsonObject(
          endpointConfig.health_check ?? endpointConfig.healthCheck,
        ) ?? null;

      return {
        kind: 'external',
        external: {
          endpoint: this.resolveEndpointUrl(
            this.asString(endpointConfig.endpoint) ?? '',
          ),
          protocol: this.asString(endpointConfig.protocol),
          timeout: this.asNumber(endpointConfig.timeout),
          authentication,
          retry,
          expectedCapabilities: this.toStringArray(
            endpointConfig.expected_capabilities ??
              endpointConfig.expectedCapabilities,
          ),
          healthCheck,
        },
        raw: endpointConfig,
      };
    }

    return undefined;
  }

  private extractLlm(
    record: AgentRecord,
    descriptor: UnknownRecord,
  ): AgentLLMDefinition | undefined {
    // Use record.llm_config for context agents
    const llmNode = record.llm_config ?? this.toJsonObject(descriptor?.llm);

    if (!llmNode) {
      return undefined;
    }

    const providerCandidate = llmNode.provider;
    const modelCandidate = llmNode.model;

    if (!providerCandidate && !modelCandidate) {
      return undefined;
    }

    return {
      provider: this.asString(providerCandidate),
      model: this.asString(modelCandidate),
      temperature: this.asNumber(llmNode.temperature),
      maxTokens: this.asNumber(llmNode.max_tokens ?? llmNode.maxTokens),
      systemPrompt: this.asString(
        llmNode.system_prompt ?? llmNode.systemPrompt,
      ),
      raw: this.toJsonObject(llmNode) ?? undefined,
    };
  }

  private extractPrompts(
    record: AgentRecord,
    descriptor: UnknownRecord,
    llm: AgentLLMDefinition | undefined,
  ): AgentPromptDefinition {
    const promptsNode = this.toJsonObject(descriptor?.prompts);
    const contextNode = this.toJsonObject(descriptor?.context);

    // For context agents, use the markdown context as the system prompt
    const systemFromContext =
      record.agent_type === 'context'
        ? record.context
        : this.asString(
            contextNode?.system_prompt ?? contextNode?.systemPrompt,
          );

    return {
      system:
        this.asString(promptsNode?.system) ??
        systemFromContext ??
        llm?.systemPrompt ??
        undefined,
      plan: this.asString(promptsNode?.plan),
      build: this.asString(promptsNode?.build),
      human: this.asString(promptsNode?.human),
      additional: promptsNode ?? undefined,
    };
  }

  private buildConfig(
    record: AgentRecord,
    descriptor: UnknownRecord,
  ): AgentConfigDefinition | null {
    const descriptorConfig = this.toJsonObject(
      descriptor?.configuration,
    ) as AgentConfigDefinition | null;
    const metadataConfig = record.metadata
      ? this.toJsonObject(record.metadata)
      : null;
    const merged = this.mergeJsonObjects(descriptorConfig, metadataConfig);
    return (merged as AgentConfigDefinition | null) ?? null;
  }

  private toJsonObject(value: unknown): JsonObject | null {
    if (this.isJsonObject(value)) {
      return value;
    }
    return null;
  }

  private toJsonArray(value: unknown): JsonArray | null {
    if (this.isJsonArray(value)) {
      return value;
    }
    return null;
  }

  private mergeJsonObjects(
    base?: JsonObject | null,
    override?: JsonObject | null,
  ): JsonObject | null {
    if (!base && !override) {
      return null;
    }
    if (!base) {
      return override ?? null;
    }
    if (!override) {
      return base ?? null;
    }
    return { ...base, ...override } as JsonObject;
  }

  private toStringRecord(value: unknown): Record<string, string> | undefined {
    if (!this.isJsonObject(value)) {
      return undefined;
    }

    const result: Record<string, string> = {};
    for (const [key, entry] of Object.entries(value)) {
      const normalized = this.asString(entry);
      if (normalized !== undefined) {
        result[key] = normalized;
      }
    }

    return Object.keys(result).length > 0 ? result : undefined;
  }

  private toStringArray(value: unknown): string[] {
    if (!value) {
      return [];
    }
    if (Array.isArray(value)) {
      return value
        .map((entry) => this.asString(entry))
        .filter((entry): entry is string => Boolean(entry));
    }
    if (typeof value === 'string') {
      return [value];
    }
    return [];
  }

  private asString(value: unknown): string | undefined {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value;
    }
    return undefined;
  }

  private asNumber(value: unknown): number | undefined {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return numeric;
    }
    return undefined;
  }

  private isJsonValue(value: unknown): value is JsonValue {
    if (
      value === null ||
      typeof value === 'string' ||
      typeof value === 'boolean'
    ) {
      return true;
    }
    if (typeof value === 'number') {
      return Number.isFinite(value);
    }
    if (Array.isArray(value)) {
      return value.every((entry) => this.isJsonValue(entry));
    }
    if (typeof value === 'object') {
      return this.isJsonObject(value);
    }
    return false;
  }

  private isJsonObject(value: unknown): value is JsonObject {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return false;
    }

    return Object.entries(value as Record<string, unknown>).every(([, entry]) =>
      this.isJsonValue(entry),
    );
  }

  private isJsonArray(value: unknown): value is JsonArray {
    if (!Array.isArray(value)) {
      return false;
    }
    return value.every((entry) => this.isJsonValue(entry));
  }

  private resolveSchema(...candidates: unknown[]): string | JsonObject | null {
    for (const candidate of candidates) {
      const normalized = this.normalizeSchema(candidate);
      if (normalized) {
        return normalized;
      }
    }
    return null;
  }

  private normalizeSchema(value: unknown): string | JsonObject | null {
    if (!value) {
      return null;
    }

    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value) as unknown;
        return this.toJsonObject(parsed);
      } catch {
        // If it's not valid JSON, return the string as-is (e.g., markdown template)
        return value;
      }
    }

    return this.toJsonObject(value);
  }

  private asBoolean(value: unknown): boolean | undefined {
    if (value === undefined || value === null) {
      return undefined;
    }
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'string') {
      const lowered = value.toLowerCase();
      if (lowered === 'true') return true;
      if (lowered === 'false') return false;
    }
    return undefined;
  }

  private guessCanPlan(modeProfile: string): boolean {
    const lowered = modeProfile.toLowerCase();
    return lowered.includes('plan') || lowered.includes('full');
  }

  private guessCanBuild(modeProfile: string): boolean {
    const lowered = modeProfile.toLowerCase();
    return lowered.includes('build') || lowered.includes('full');
  }

  private guessCanOrchestrate(modeProfile: string): boolean {
    const lowered = modeProfile.toLowerCase();
    return lowered.includes('orchestrate') || lowered.includes('full');
  }
}
