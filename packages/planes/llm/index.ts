/**
 * LLM Plane — public API
 *
 * Usage:
 *   import { LLM_SERVICE, LLMServiceProvider } from '@orchestratorai/planes/llm';
 *
 *   @Inject(LLM_SERVICE) private readonly llm: LLMServiceProvider
 */
export {
  LLM_SERVICE,
  type LLMServiceProvider,
  type LLMModelInfo,
  type LLMProviderInfo,
} from './llm.interface';
export { LLMPlaneModule } from './llm.module';

// Re-export the fine-control LLMModule for products that need the full module
export { LLMModule } from './fine-control/llm.module';

// Re-export key services from fine-control
export { LLMService } from './fine-control/llm.service';
export { LLMGenerationService } from './fine-control/services/llm-generation.service';
export { LLMImageService } from './fine-control/services/llm-image.service';
export { LLMVideoService } from './fine-control/services/llm-video.service';
export { LLMServiceFactory } from './fine-control/services/llm-service-factory';

// Re-export core types for convenience
export type {
  LLMResponse,
  LLMRequestOptions,
  LLMServiceConfig,
  GenerateResponseParams,
  UnifiedGenerateResponseParams,
  ResponseMetadata,
  ImageGenerationParams,
  ImageGenerationResponse,
  VideoGenerationParams,
  VideoGenerationResponse,
  StreamingLLMResponse,
  ChatMessage,
  ChatGenerateResponseParams,
  RoutingDecision,
  ProviderCapabilities,
  ProviderHealthStatus,
  CostCalculation,
  UsageMetrics,
  PiiOptions,
  MediaStorageParams,
  StoredMediaAsset,
} from './llm.types';

// Re-export type guard functions
export { isLLMResponse, isImageGenerationResponse, isVideoGenerationResponse } from './fine-control/services/llm-interfaces';

// Re-export evaluation types and DTOs used by products
export type {
  LLMUsageMetrics,
  CIDAFMOptions,
  SystemLLMConfigs,
  Provider,
  Model,
  CIDAFMCommand,
  EnhancedMessage,
  UserUsageStats,
  ModelStatus,
  ProviderStatus,
  CIDAFMCommandType,
  UserRatingScale,
} from './fine-control/types/llm-evaluation';

export {
  ModelResponseDto,
  UsageStatsResponseDto,
  CIDAFMCommandResponseDto,
} from './fine-control/dto/llm-evaluation.dto';

export type {
  EnhancedMessageResponseDto,
} from './fine-control/dto/llm-evaluation.dto';

export {
  EnhancedEvaluationMetadataDto,
  AdminEvaluationFiltersDto,
  EvaluationAnalyticsDto,
  AgentLLMRecommendationDto,
} from './fine-control/dto/enhanced-evaluation.dto';
