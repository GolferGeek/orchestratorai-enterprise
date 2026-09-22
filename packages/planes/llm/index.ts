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

// ---------------------------------------------------------------------------
// PII boundary pipeline
//
// The services below run inside the plane on every external LLM call. They are
// re-exported so the admin API can manage the patterns and dictionary that
// drive them — not so products can invoke the pipeline themselves. Products
// get protection by going through LLM_SERVICE; nothing else should call these.
// ---------------------------------------------------------------------------
export { PIIService } from './fine-control/pii/pii.service';
export { PIIPatternService } from './fine-control/pii-pattern.service';
export { DictionaryPseudonymizerService } from './fine-control/pii/dictionary-pseudonymizer.service';
export { PatternRedactionService } from './fine-control/pii/pattern-redaction.service';
export { PseudonymizationService } from './fine-control/pseudonymization.service';

export type {
  PIIPattern,
  PIIDataType,
  PIIDetectionResult,
} from './fine-control/pii-pattern.service';
export type {
  DictionaryPseudonymMapping,
  DictionaryPseudonymizationResult,
  DictionaryReversalResult,
} from './fine-control/pii/dictionary-pseudonymizer.service';
export type {
  PatternRedactionMapping,
  PatternRedactionResult,
} from './fine-control/pii/pattern-redaction.service';
export type {
  PIIProcessingMetadata,
  PIIMatch as PIIMetadataMatch,
  PIISeverity,
  ProcessingFlow,
} from './fine-control/types/pii-metadata.types';
export type { PrivacySummary } from './fine-control/services/llm-interfaces';

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
