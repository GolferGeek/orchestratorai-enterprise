// Database to API case conversion utilities
// Maps between snake_case (database) and camelCase (API layer)

import {
  Provider,
  Model,
  CIDAFMCommand,
  EnhancedMessage,
  UserUsageStats,
} from '@/llms/types/llm-evaluation';
import { ModelResponseDto } from '@/llms/dto/llm-evaluation.dto';

// Generic function to convert snake_case to camelCase
export function snakeToCamel(obj: unknown): unknown {
  if (obj === null || obj === undefined || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(snakeToCamel);
  }

  const camelObj: Record<string, unknown> = {};
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const camelKey = key.replace(/_([a-z])/g, (_: string, letter: string) =>
        letter.toUpperCase(),
      );
      camelObj[camelKey] = snakeToCamel((obj as Record<string, unknown>)[key]);
    }
  }
  return camelObj;
}

// Generic function to convert camelCase to snake_case
export function camelToSnake(obj: unknown): unknown {
  if (obj === null || obj === undefined || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(camelToSnake);
  }

  const snakeObj: Record<string, unknown> = {};
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const snakeKey = key.replace(
        /[A-Z]/g,
        (letter) => `_${letter.toLowerCase()}`,
      );
      snakeObj[snakeKey] = camelToSnake((obj as Record<string, unknown>)[key]);
    }
  }
  return snakeObj;
}

// Specific converters for LLM evaluation entities

export function mapProviderFromDb(
  dbProvider: Record<string, unknown>,
): Provider {
  return {
    id: dbProvider.id as string,
    name: dbProvider.name as string,
    apiBaseUrl: dbProvider.api_base_url as string | undefined,
    authType: dbProvider.auth_type as Provider['authType'],
    status: dbProvider.status as Provider['status'],
    createdAt: dbProvider.created_at as string,
    updatedAt: dbProvider.updated_at as string,
  };
}

export function mapProviderToDb(
  provider: Partial<Provider>,
): Record<string, unknown> {
  return {
    id: provider.id,
    name: provider.name,
    api_base_url: provider.apiBaseUrl,
    auth_type: provider.authType,
    status: provider.status,
    created_at: provider.createdAt,
    updated_at: provider.updatedAt,
  };
}

export function mapModelFromDb(dbModel: Record<string, unknown>): Model {
  return {
    name: dbModel.model_name as string,
    providerName: dbModel.provider_name as string,
    pricingInputPer1k: dbModel.pricing_input_per_1k as number,
    pricingOutputPer1k: dbModel.pricing_output_per_1k as number,
    supportsThinking: dbModel.supports_thinking as boolean,
    maxTokens: dbModel.max_tokens as number,
    contextWindow: dbModel.context_window as number,
    strengths: dbModel.strengths as string[],
    weaknesses: dbModel.weaknesses as string[],
    useCases: dbModel.use_cases as string[],
    status: dbModel.status as Model['status'],
    createdAt: dbModel.created_at as string,
    updatedAt: dbModel.updated_at as string,
    provider: dbModel.provider
      ? mapProviderFromDb(dbModel.provider as Record<string, unknown>)
      : undefined,
  };
}

export function mapModelToDb(model: Partial<Model>): Record<string, unknown> {
  return {
    provider_name: model.providerName,
    model_name: model.name,
    pricing_input_per_1k: model.pricingInputPer1k,
    pricing_output_per_1k: model.pricingOutputPer1k,
    supports_thinking: model.supportsThinking,
    max_tokens: model.maxTokens,
    context_window: model.contextWindow,
    strengths: model.strengths,
    weaknesses: model.weaknesses,
    use_cases: model.useCases,
    status: model.status,
    created_at: model.createdAt,
    updated_at: model.updatedAt,
  };
}

// New mapping function specifically for llm_models table structure
export function mapLLMModelFromDb(
  dbModel: Record<string, unknown>,
): ModelResponseDto {
  // Extract pricing info from JSON
  const pricingInfo =
    (dbModel.pricing_info_json as Record<string, unknown>) || {};
  const inputCostPer1k =
    ((pricingInfo.input_cost_per_token as number) || 0) * 1000;
  const outputCostPer1k =
    ((pricingInfo.output_cost_per_token as number) || 0) * 1000;

  return {
    providerName: dbModel.provider_name as string,
    name: (dbModel.display_name as string) || (dbModel.model_name as string), // Use display_name as the friendly name
    modelName: dbModel.model_name as string, // Use model_name as the technical ID
    pricingInputPer1k: inputCostPer1k,
    pricingOutputPer1k: outputCostPer1k,
    supportsThinking:
      (dbModel.capabilities as string[])?.includes('reasoning') || false,
    maxTokens: dbModel.max_output_tokens as number,
    contextWindow: dbModel.context_window as number,
    strengths: [], // Not available in llm_models structure
    weaknesses: [], // Not available in llm_models structure
    useCases: [], // Not available in llm_models structure
    status: (dbModel.is_active as boolean) ? 'active' : 'inactive',
    createdAt: dbModel.created_at as string,
    updatedAt: dbModel.updated_at as string,
    provider: dbModel.provider
      ? mapLLMProviderFromDb(dbModel.provider as Record<string, unknown>)
      : undefined,
  };
}

// New mapping function specifically for llm_providers table structure
export function mapLLMProviderFromDb(
  dbProvider: Record<string, unknown>,
): Provider {
  return {
    id: dbProvider.id as string,
    name:
      (dbProvider.provider_name as string) ||
      (dbProvider.name as string) ||
      (dbProvider.display_name as string),
    apiBaseUrl:
      (dbProvider.api_base_url as string) || (dbProvider.base_url as string),
    authType: (dbProvider.auth_type as Provider['authType']) || 'api_key',
    status: (dbProvider.is_active as boolean) ? 'active' : 'inactive',
    isLocal: dbProvider.is_local as boolean | undefined,
    createdAt: dbProvider.created_at as string,
    updatedAt: dbProvider.updated_at as string,
  };
}

export function mapCIDAFMCommandFromDb(
  dbCommand: Record<string, unknown>,
): CIDAFMCommand {
  return {
    id: dbCommand.id as string,
    type: dbCommand.type as CIDAFMCommand['type'],
    name: dbCommand.name as string,
    description: dbCommand.description as string,
    defaultActive: dbCommand.default_active as boolean,
    isBuiltin: dbCommand.is_builtin as boolean,
    createdAt: dbCommand.created_at as string,
    updatedAt: dbCommand.updated_at as string,
  };
}

export function mapCIDAFMCommandToDb(
  command: Partial<CIDAFMCommand>,
): Record<string, unknown> {
  return {
    id: command.id,
    type: command.type,
    name: command.name,
    description: command.description,
    default_active: command.defaultActive,
    is_builtin: command.isBuiltin,
    created_at: command.createdAt,
    updated_at: command.updatedAt,
  };
}

export function mapEnhancedMessageFromDb(
  dbMessage: Record<string, unknown>,
): EnhancedMessage {
  return {
    id: dbMessage.id as string,
    sessionId: dbMessage.session_id as string,
    userId: dbMessage.user_id as string,
    role: dbMessage.role as EnhancedMessage['role'],
    content: dbMessage.content as string,
    timestamp: dbMessage.timestamp as string,
    order: dbMessage.order as number,
    metadata: dbMessage.metadata as Record<string, unknown> | undefined,
    providerName: dbMessage.provider_name as string | undefined,
    modelName: dbMessage.model_name as string | undefined,
    inputTokens: dbMessage.input_tokens as number | undefined,
    outputTokens: dbMessage.output_tokens as number | undefined,
    totalCost: dbMessage.total_cost as number | undefined,
    responseTimeMs: dbMessage.response_time_ms as number | undefined,
    langsmithRunId: dbMessage.langsmith_run_id as string | undefined,
    userRating: dbMessage.user_rating as EnhancedMessage['userRating'],
    speedRating: dbMessage.speed_rating as EnhancedMessage['speedRating'],
    accuracyRating:
      dbMessage.accuracy_rating as EnhancedMessage['accuracyRating'],
    userNotes: dbMessage.user_notes as string | undefined,
    evaluationTimestamp: dbMessage.evaluation_timestamp as string | undefined,
    cidafmOptions: dbMessage.cidafm_options as
      | Record<string, unknown>
      | undefined,
    evaluationDetails: dbMessage.evaluation_details as
      | Record<string, unknown>
      | undefined,
    provider: dbMessage.provider
      ? mapProviderFromDb(dbMessage.provider as Record<string, unknown>)
      : undefined,
    model: dbMessage.model
      ? mapModelFromDb(dbMessage.model as Record<string, unknown>)
      : undefined,
  };
}

export function mapEnhancedMessageToDb(
  message: Partial<EnhancedMessage>,
): Record<string, unknown> {
  return {
    id: message.id,
    sessionId: message.sessionId,
    user_id: message.userId,
    role: message.role,
    content: message.content,
    timestamp: message.timestamp,
    order: message.order,
    metadata: message.metadata,
    provider_name: message.providerName,
    model_name: message.modelName,
    inputTokens: message.inputTokens,
    outputTokens: message.outputTokens,
    totalCost: message.totalCost,
    responseTimeMs: message.responseTimeMs,
    langsmith_run_id: message.langsmithRunId,
    userRating: message.userRating,
    speedRating: message.speedRating,
    accuracyRating: message.accuracyRating,
    userNotes: message.userNotes,
    evaluationTimestamp: message.evaluationTimestamp,
    cidafmOptions: message.cidafmOptions,
    evaluationDetails: message.evaluationDetails,
  };
}

export function mapUserUsageStatsFromDb(
  dbStats: Record<string, unknown>,
): UserUsageStats {
  return {
    id: dbStats.id as string,
    userId: dbStats.user_id as string,
    date: dbStats.date as string,
    providerName: dbStats.provider_name as string,
    modelName: dbStats.model_name as string,
    totalRequests: dbStats.total_requests as number,
    totalTokens: dbStats.total_tokens as number,
    totalCost: dbStats.total_cost as number,
    avgResponseTimeMs: dbStats.avg_response_time_ms as number,
    avgUserRating: dbStats.avg_user_rating as number,
    createdAt: dbStats.created_at as string,
    updatedAt: dbStats.updated_at as string,
    provider: dbStats.provider
      ? mapProviderFromDb(dbStats.provider as Record<string, unknown>)
      : undefined,
    model: dbStats.model
      ? mapModelFromDb(dbStats.model as Record<string, unknown>)
      : undefined,
  };
}

export function mapUserUsageStatsToDb(
  stats: Partial<UserUsageStats>,
): Record<string, unknown> {
  return {
    id: stats.id,
    user_id: stats.userId,
    date: stats.date,
    provider_name: stats.providerName,
    model_name: stats.modelName,
    totalRequests: stats.totalRequests,
    totalTokens: stats.totalTokens,
    totalCost: stats.totalCost,
    avg_responseTimeMs: stats.avgResponseTimeMs,
    avg_userRating: stats.avgUserRating,
    created_at: stats.createdAt,
    updated_at: stats.updatedAt,
  };
}
