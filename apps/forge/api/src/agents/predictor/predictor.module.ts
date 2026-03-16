import { Module, OnModuleInit, Logger, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PredictionContextController } from './controllers/prediction-context.controller';
import { LLMModule } from '@orchestratorai/planes/llm';
import { CrawlerModule } from '@/crawler/crawler.module';
import { RiskRunnerModule } from '../risk-runner/risk-runner.module';

// Enterprise adapter
import { PredictorService } from './predictor.service';

// Repositories
import {
  UniverseRepository,
  TargetRepository,
  SignalRepository,
  PredictorRepository,
  PredictionRepository,
  AnalystRepository,
  LearningRepository,
  LearningQueueRepository,
  LearningLineageRepository,
  SnapshotRepository,
  StrategyRepository,
  ToolRequestRepository,
  TargetSnapshotRepository,
  ReplayTestRepository,
  // Phase 2 Story Deduplication (legacy - dedup now in crawler schema)
  SignalFingerprintRepository,
  // Phase 3 Test Data Injection Framework
  TestScenarioRepository,
  TestTargetMirrorRepository,
  TestPriceDataRepository,
  TestAuditLogRepository,
  TestArticleRepository,
  ScenarioRunRepository,
  // Portfolio & Context Versioning
  PortfolioRepository,
  // Central Crawler Integration
  SourceSubscriptionRepository,
} from './repositories';

// Services
import {
  UniverseService,
  TargetService,
  AnalystService,
  AnalystPromptBuilderService,
  LlmTierResolverService,
  AnalystEnsembleService,
  AnalystPositionService,
  AnalystPerformanceService,
  AnalystMotivationService,
  AgentSelfImprovementService,
  LearningService,
  LearningQueueService,
  LearningPromotionService,
  // Phase 5 Services
  SignalDetectionService,
  PredictorManagementService,
  PredictionGenerationService,
  OutcomeTrackingService,
  EvaluationService,
  MissedOpportunityDetectionService,
  MissedOpportunityAnalysisService,
  FastPathService,
  SnapshotService,
  ReviewQueueService,
  // Phase 6 Services
  FirecrawlService,
  ContentHashService,
  TargetSnapshotService,
  ProviderThrottleService,
  PolygonMarketDataService,
  CoinMarketCapMarketDataService,
  PolymarketMarketDataService,
  MarketDataRouterService,
  StrategyService,
  ToolRequestService,
  // Phase 9 Services
  NotificationService,
  PredictionStreamingService,
  // Phase 2 Test Input Infrastructure
  TestPriceDataRouterService,
  // Phase 3 Test Data Injection Framework
  TestDataInjectorService,
  TestDataGeneratorService,
  TestTargetMirrorService,
  TestPriceDataService,
  // Phase 4.1 AI-Powered Article Generation
  AiArticleGeneratorService,
  // Phase 4.2 & 4.3 Scenario Generation from Real-World Events
  ScenarioGeneratorService,
  // Phase 4.4 Scenario Variation Generator
  ScenarioVariationService,
  // Phase 6.2 Analytics API Endpoints
  AnalyticsService,
  // Sprint 5 - Learning Impact Tracking
  LearningImpactService,
  // Sprint 6 - Advanced Test Framework & Monitoring
  ScenarioRunService,
  TestScenarioComparisonService,
  TestScenarioBatchService,
  AlertService,
  AnomalyDetectionService,
  // Sprint 7 - Operations & Reliability
  BackpressureService,
  PredictionExportService,
  ExternalIntegrationService,
  LlmUsageLimiterService,
  DegradedModeService,
  // Phase 4 - User Portfolios
  UserPositionService,
  // Miss Investigation & Learning
  MissInvestigationService,
  SourceResearchService,
  BaselinePredictionService,
  HistoricalReplayService,
  // Position Resolution (closes positions when predictions resolve)
  PositionResolutionService,
  // Central Crawler Integration
  ArticleProcessorService,
  // EOD Settlement
  EodSettlementService,
  // Daily Postmortem
  DailyPostmortemService,
} from './services';

// Dashboard Task Router and Handlers
import { PredictionDashboardRouter } from './task-router/prediction-dashboard.router';
import {
  UniverseHandler,
  TargetHandler,
  PredictionHandler,
  AnalystHandler,
  LearningHandler,
  LearningQueueHandler,
  ReviewQueueHandler,
  StrategyHandler,
  MissedOpportunityHandler,
  ToolRequestHandler,
  // Phase 5 - Learning Promotion Workflow
  LearningPromotionHandler,
  // Phase 4 - Test Data Builder UI
  TestScenarioHandler,
  // Phase 3 - Test Data Management UI
  TestArticleHandler,
  TestPriceDataHandler,
  TestTargetMirrorHandler,
  // Phase 6.2 - Analytics API Endpoints
  AnalyticsHandler,
  // Sprint 4 - Signals Dashboard
  SignalsHandler,
  // Sprint 5 - Manual Evaluation Override
  EvaluationHandler,
  // Sprint 7 - Audit Log Dashboard
  AuditLogHandler,
  // Phase 3 - Agent Activity (HITL Notifications)
  AgentActivityHandler,
  // Phase 5 - Learning Session (Bidirectional Learning)
  LearningSessionHandler,
  // Manual Runner Triggers
  RunnerHandler,
  // Source Subscriptions
  SourceHandler,
  // Daily Postmortem Reports
  DailyReportHandler,
} from './task-router/handlers';

const repositories = [
  UniverseRepository,
  TargetRepository,
  SignalRepository,
  PredictorRepository,
  PredictionRepository,
  AnalystRepository,
  LearningRepository,
  LearningQueueRepository,
  LearningLineageRepository,
  SnapshotRepository,
  StrategyRepository,
  ToolRequestRepository,
  TargetSnapshotRepository,
  ReplayTestRepository,
  // Phase 2 Story Deduplication (legacy)
  SignalFingerprintRepository,
  // Phase 3 Test Data Injection Framework
  TestScenarioRepository,
  TestTargetMirrorRepository,
  TestPriceDataRepository,
  TestAuditLogRepository,
  TestArticleRepository,
  ScenarioRunRepository,
  // Portfolio & Context Versioning
  PortfolioRepository,
  // Central Crawler Integration
  SourceSubscriptionRepository,
];

const services = [
  UniverseService,
  TargetService,
  AnalystService,
  AnalystPromptBuilderService,
  LlmTierResolverService,
  AnalystEnsembleService,
  AnalystPositionService,
  AnalystPerformanceService,
  AnalystMotivationService,
  AgentSelfImprovementService,
  LearningService,
  LearningQueueService,
  LearningPromotionService,
  // Phase 5 Services
  SignalDetectionService,
  PredictorManagementService,
  PredictionGenerationService,
  OutcomeTrackingService,
  EvaluationService,
  MissedOpportunityDetectionService,
  MissedOpportunityAnalysisService,
  FastPathService,
  SnapshotService,
  ReviewQueueService,
  // Phase 6 Services
  FirecrawlService,
  ContentHashService,
  TargetSnapshotService,
  ProviderThrottleService,
  PolygonMarketDataService,
  CoinMarketCapMarketDataService,
  PolymarketMarketDataService,
  MarketDataRouterService,
  StrategyService,
  ToolRequestService,
  // Phase 9 Services
  NotificationService,
  PredictionStreamingService,
  // Phase 2 Test Input Infrastructure
  TestPriceDataRouterService,
  // Phase 3 Test Data Injection Framework
  TestDataInjectorService,
  TestDataGeneratorService,
  TestTargetMirrorService,
  TestPriceDataService,
  // Phase 4.1 AI-Powered Article Generation
  AiArticleGeneratorService,
  // Phase 4.2 & 4.3 Scenario Generation from Real-World Events
  ScenarioGeneratorService,
  // Phase 4.4 Scenario Variation Generator
  ScenarioVariationService,
  // Phase 6.2 Analytics API Endpoints
  AnalyticsService,
  // Sprint 5 - Learning Impact Tracking
  LearningImpactService,
  // Sprint 6 - Advanced Test Framework & Monitoring
  ScenarioRunService,
  TestScenarioComparisonService,
  TestScenarioBatchService,
  AlertService,
  AnomalyDetectionService,
  // Sprint 7 - Operations & Reliability
  BackpressureService,
  PredictionExportService,
  ExternalIntegrationService,
  LlmUsageLimiterService,
  DegradedModeService,
  // Phase 4 - User Portfolios
  UserPositionService,
  // Miss Investigation & Learning
  MissInvestigationService,
  SourceResearchService,
  BaselinePredictionService,
  HistoricalReplayService,
  // Position Resolution (closes positions when predictions resolve)
  PositionResolutionService,
  // Central Crawler Integration
  ArticleProcessorService,
  // EOD Settlement
  EodSettlementService,
  // Daily Postmortem
  DailyPostmortemService,
];

// Runners removed — batch processing now lives in Pulse (port 6500)

// Dashboard Handlers
const dashboardHandlers = [
  PredictionDashboardRouter,
  UniverseHandler,
  TargetHandler,
  PredictionHandler,
  AnalystHandler,
  LearningHandler,
  LearningQueueHandler,
  ReviewQueueHandler,
  StrategyHandler,
  MissedOpportunityHandler,
  ToolRequestHandler,
  // Phase 5 - Learning Promotion Workflow
  LearningPromotionHandler,
  // Phase 4 - Test Data Builder UI
  TestScenarioHandler,
  // Phase 3 - Test Data Management UI
  TestArticleHandler,
  TestPriceDataHandler,
  TestTargetMirrorHandler,
  // Phase 6.2 - Analytics API Endpoints
  AnalyticsHandler,
  // Sprint 4 - Signals Dashboard
  SignalsHandler,
  // Sprint 5 - Manual Evaluation Override
  EvaluationHandler,
  // Sprint 7 - Audit Log Dashboard
  AuditLogHandler,
  // Phase 3 - Agent Activity (HITL Notifications)
  AgentActivityHandler,
  // Phase 5 - Learning Session (Bidirectional Learning)
  LearningSessionHandler,
  // Manual Runner Triggers
  RunnerHandler,
  // Source Subscriptions
  SourceHandler,
  // Daily Postmortem Reports
  DailyReportHandler,
];

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION VALIDATION
// ═══════════════════════════════════════════════════════════════════════════

interface ConfigValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

@Module({
  imports: [
    LLMModule,
    CrawlerModule,
    forwardRef(() => RiskRunnerModule),
  ],
  controllers: [PredictionContextController],
  providers: [
    PredictorService,
    ...repositories,
    ...services,
    ...dashboardHandlers,
  ],
  exports: [
    PredictorService,
    ...services,
    ...dashboardHandlers,
  ],
})
export class PredictorModule implements OnModuleInit {
  private readonly logger = new Logger(PredictorModule.name);

  constructor(private readonly configService: ConfigService) {}

  /**
   * Startup Configuration Validation
   */
  onModuleInit() {
    this.logger.log('Validating PredictorModule configuration...');

    const validation = this.validateConfig();

    // Log warnings for optional config
    if (validation.warnings.length > 0) {
      this.logger.warn('Configuration warnings:');
      for (const warning of validation.warnings) {
        this.logger.warn(`  - ${warning}`);
      }
    }

    // Fail fast if required config is missing
    if (!validation.valid) {
      this.logger.error('Configuration validation failed!');
      for (const error of validation.errors) {
        this.logger.error(`  - ${error}`);
      }
      throw new Error(
        `PredictorModule startup failed: ${validation.errors.join(', ')}`,
      );
    }

    this.logger.log('PredictorModule configuration validated successfully');
  }

  private validateConfig(): ConfigValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Database config depends on the active DB provider
    const dbProvider = this.configService.get<string>('DB_PROVIDER');
    if (dbProvider === 'supabase_pg' || !dbProvider) {
      if (!this.configService.get<string>('SUPABASE_URL')) {
        errors.push('SUPABASE_URL is required for database operations');
      }
      if (!this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY')) {
        errors.push(
          'SUPABASE_SERVICE_ROLE_KEY is required for database operations',
        );
      }
    }

    if (!this.configService.get<string>('FIRECRAWL_API_KEY')) {
      warnings.push(
        'FIRECRAWL_API_KEY not set - source crawling will be disabled',
      );
    }

    if (!this.configService.get<string>('POLYGON_API_KEY')) {
      warnings.push(
        'POLYGON_API_KEY not set - Polygon.io stock data will be disabled',
      );
    }

    if (!this.configService.get<string>('COINMARKETCAP_API_KEY')) {
      warnings.push(
        'COINMARKETCAP_API_KEY not set - CoinMarketCap crypto data will be disabled',
      );
    }

    if (!this.configService.get<string>('PREDICTION_SLACK_WEBHOOK_URL')) {
      warnings.push(
        'PREDICTION_SLACK_WEBHOOK_URL not set - Slack notifications will be disabled',
      );
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }
}
