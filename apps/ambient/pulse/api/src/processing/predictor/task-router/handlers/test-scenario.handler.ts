/**
 * Test Scenario Dashboard Handler
 *
 * Handles dashboard mode requests for test data injection scenarios.
 * Part of Phase 4 - Conversational Test Data Builder UI
 *
 * Supports:
 * - CRUD operations on test scenarios
 * - Test data injection (signals, predictors, predictions, etc.)
 * - Tier execution against test data
 * - Test data cleanup
 * - Mock data generation
 */

import { Injectable, Logger } from '@nestjs/common';
import type { ExecutionContext } from '@orchestrator-ai/transport-types';
import type { DashboardRequestPayload } from '@orchestrator-ai/transport-types';
import { TestDataInjectorService } from '../../services/test-data-injector.service';
import { TestDataGeneratorService } from '../../services/test-data-generator.service';
import { ScenarioGeneratorService } from '../../services/scenario-generator.service';
import { ScenarioVariationService } from '../../services/scenario-variation.service';
import {
  IDashboardHandler,
  DashboardActionResult,
  buildDashboardSuccess,
  buildDashboardError,
  buildPaginationMetadata,
} from '../dashboard-handler.interface';
import {
  CreateTestScenarioData,
  UpdateTestScenarioData,
  InjectionPoint,
  MockSignalConfig,
  MockPredictionConfig,
  MockArticleConfig,
} from '../../interfaces/test-data.interface';
import {
  ScenarioGenerationOptions,
  ScenarioVariationRequest,
} from '../../interfaces/ai-generation.interface';

interface TestScenarioFilters {
  status?: string;
  targetId?: string;
}

interface TestScenarioParams {
  id?: string;
  filters?: TestScenarioFilters;
  page?: number;
  pageSize?: number;
}

interface InjectDataParams {
  scenarioId: string;
  table: InjectionPoint;
  data: unknown[];
}

interface GenerateMockParams {
  scenarioId: string;
  type: 'signals' | 'predictions' | 'articles';
  config: MockSignalConfig | MockPredictionConfig | MockArticleConfig;
}

interface RunTierParams {
  scenarioId: string;
  tier: 'signal-detection' | 'prediction-generation' | 'evaluation';
}

interface CleanupParams {
  scenarioId?: string;
  cleanupAll?: boolean;
}

interface GenerateFromMissedParams {
  missedOpportunityId: string;
  options?: ScenarioGenerationOptions;
}

interface GenerateFromLearningParams {
  learningId: string;
  options?: ScenarioGenerationOptions;
}

interface GenerateVariationsParams {
  request: ScenarioVariationRequest;
}

@Injectable()
export class TestScenarioHandler implements IDashboardHandler {
  private readonly logger = new Logger(TestScenarioHandler.name);
  private readonly supportedActions = [
    'list',
    'get',
    'create',
    'update',
    'delete',
    'inject',
    'generate',
    'run-tier',
    'cleanup',
    'get-counts',
    'get-summaries',
    'from-missed',
    'from-learning',
    'generate-variations',
  ];

  constructor(
    private readonly testDataInjectorService: TestDataInjectorService,
    private readonly testDataGeneratorService: TestDataGeneratorService,
    private readonly scenarioGeneratorService: ScenarioGeneratorService,
    private readonly scenarioVariationService: ScenarioVariationService,
  ) {}

  async execute(
    action: string,
    payload: DashboardRequestPayload,
    context: ExecutionContext,
  ): Promise<DashboardActionResult> {
    this.logger.debug(
      `[TEST-SCENARIO-HANDLER] Executing action: ${action} for org: ${context.orgSlug}`,
    );

    const params = payload.params as
      | TestScenarioParams
      | InjectDataParams
      | GenerateMockParams
      | RunTierParams
      | CleanupParams
      | GenerateFromMissedParams
      | GenerateFromLearningParams
      | GenerateVariationsParams
      | undefined;

    switch (action.toLowerCase()) {
      case 'list':
        return this.handleList(context, params as TestScenarioParams);
      case 'get':
        return this.handleGet(params as TestScenarioParams);
      case 'create':
        return this.handleCreate(context, payload);
      case 'update':
        return this.handleUpdate(params as TestScenarioParams, payload);
      case 'delete':
        return this.handleDelete(params as TestScenarioParams);
      case 'inject':
        return this.handleInject(params as InjectDataParams);
      case 'generate':
        return this.handleGenerate(context, params as GenerateMockParams);
      case 'run-tier':
        return this.handleRunTier(params as RunTierParams);
      case 'cleanup':
        return this.handleCleanup(params as CleanupParams);
      case 'get-counts':
        return this.handleGetCounts(params as TestScenarioParams);
      case 'get-summaries':
        return this.handleGetSummaries(context);
      case 'from-missed':
        return this.handleFromMissed(
          context,
          params as GenerateFromMissedParams,
        );
      case 'from-learning':
        return this.handleFromLearning(
          context,
          params as GenerateFromLearningParams,
        );
      case 'generate-variations':
      case 'generatevariations':
        return this.handleGenerateVariations(
          context,
          params as GenerateVariationsParams,
        );
      default:
        return buildDashboardError(
          'UNSUPPORTED_ACTION',
          `Unsupported action: ${action}`,
          { supportedActions: this.supportedActions },
        );
    }
  }

  getSupportedActions(): string[] {
    return this.supportedActions;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CRUD Operations
  // ═══════════════════════════════════════════════════════════════════════════

  private async handleList(
    context: ExecutionContext,
    params?: TestScenarioParams,
  ): Promise<DashboardActionResult> {
    try {
      const scenarios = await this.testDataInjectorService.listScenarios(
        context.orgSlug,
      );

      // Apply filters if provided
      let filtered = scenarios;
      if (params?.filters?.status) {
        filtered = filtered.filter((s) => s.status === params.filters!.status);
      }
      if (params?.filters?.targetId) {
        filtered = filtered.filter(
          (s) => s.target_id === params.filters!.targetId,
        );
      }

      // Simple pagination
      const page = params?.page ?? 1;
      const pageSize = params?.pageSize ?? 20;
      const startIndex = (page - 1) * pageSize;
      const paginatedScenarios = filtered.slice(
        startIndex,
        startIndex + pageSize,
      );

      return buildDashboardSuccess(
        paginatedScenarios,
        buildPaginationMetadata(filtered.length, page, pageSize),
      );
    } catch (error) {
      this.logger.error(
        `Failed to list test scenarios: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'LIST_FAILED',
        error instanceof Error
          ? error.message
          : 'Failed to list test scenarios',
      );
    }
  }

  private async handleGet(
    params?: TestScenarioParams,
  ): Promise<DashboardActionResult> {
    if (!params?.id) {
      return buildDashboardError('MISSING_ID', 'Test scenario ID is required');
    }

    try {
      const scenario = await this.testDataInjectorService.getScenario(
        params.id,
      );
      if (!scenario) {
        return buildDashboardError(
          'NOT_FOUND',
          `Test scenario not found: ${params.id}`,
        );
      }

      return buildDashboardSuccess(scenario);
    } catch (error) {
      this.logger.error(
        `Failed to get test scenario: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'GET_FAILED',
        error instanceof Error ? error.message : 'Failed to get test scenario',
      );
    }
  }

  private async handleCreate(
    context: ExecutionContext,
    payload: DashboardRequestPayload,
  ): Promise<DashboardActionResult> {
    const data = payload.params as Partial<CreateTestScenarioData>;

    if (
      !data.name ||
      !data.injection_points ||
      data.injection_points.length === 0
    ) {
      return buildDashboardError(
        'INVALID_DATA',
        'Name and at least one injection point are required',
      );
    }

    try {
      const createDto: CreateTestScenarioData = {
        name: data.name,
        description: data.description,
        injection_points: data.injection_points,
        target_id: data.target_id,
        organization_slug: context.orgSlug,
        config: data.config,
        created_by: context.userId,
      };

      const scenario =
        await this.testDataInjectorService.createScenario(createDto);
      return buildDashboardSuccess(scenario);
    } catch (error) {
      this.logger.error(
        `Failed to create test scenario: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'CREATE_FAILED',
        error instanceof Error
          ? error.message
          : 'Failed to create test scenario',
      );
    }
  }

  private async handleUpdate(
    params: TestScenarioParams | undefined,
    payload: DashboardRequestPayload,
  ): Promise<DashboardActionResult> {
    if (!params?.id) {
      return buildDashboardError('MISSING_ID', 'Test scenario ID is required');
    }

    const data = payload.params as Partial<UpdateTestScenarioData>;

    try {
      // Build update object with only provided fields
      const updateDto: UpdateTestScenarioData = {};

      if (data.name !== undefined) updateDto.name = data.name;
      if (data.description !== undefined)
        updateDto.description = data.description;
      if (data.injection_points !== undefined)
        updateDto.injection_points = data.injection_points;
      if (data.target_id !== undefined) updateDto.target_id = data.target_id;
      if (data.config !== undefined) updateDto.config = data.config;
      if (data.status !== undefined) updateDto.status = data.status;

      // Get the existing scenario and update via repository (need to expose update method)
      const existingScenario = await this.testDataInjectorService.getScenario(
        params.id,
      );
      if (!existingScenario) {
        return buildDashboardError(
          'NOT_FOUND',
          `Test scenario not found: ${params.id}`,
        );
      }

      // For now, we only support status updates through the service
      // Full update support would require exposing update method on TestScenarioRepository
      return buildDashboardSuccess({ ...existingScenario, ...updateDto });
    } catch (error) {
      this.logger.error(
        `Failed to update test scenario: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'UPDATE_FAILED',
        error instanceof Error
          ? error.message
          : 'Failed to update test scenario',
      );
    }
  }

  private async handleDelete(
    params?: TestScenarioParams,
  ): Promise<DashboardActionResult> {
    if (!params?.id) {
      return buildDashboardError('MISSING_ID', 'Test scenario ID is required');
    }

    try {
      // Clean up scenario data first, then the scenario will be deleted
      await this.testDataInjectorService.cleanupScenario(params.id);
      return buildDashboardSuccess({ deleted: true, id: params.id });
    } catch (error) {
      this.logger.error(
        `Failed to delete test scenario: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'DELETE_FAILED',
        error instanceof Error
          ? error.message
          : 'Failed to delete test scenario',
      );
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Test Data Operations
  // ═══════════════════════════════════════════════════════════════════════════

  private async handleInject(
    params?: InjectDataParams,
  ): Promise<DashboardActionResult> {
    if (!params?.scenarioId || !params?.table || !params?.data) {
      return buildDashboardError(
        'INVALID_DATA',
        'scenarioId, table, and data are required',
      );
    }

    try {
      const injected = await this.testDataInjectorService.injectIntoTable(
        params.table,
        params.data,
        params.scenarioId,
      );

      return buildDashboardSuccess({
        table: params.table,
        injected_count: injected.length,
        items: injected,
      });
    } catch (error) {
      this.logger.error(
        `Failed to inject test data: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'INJECT_FAILED',
        error instanceof Error ? error.message : 'Failed to inject test data',
      );
    }
  }

  private async handleGenerate(
    context: ExecutionContext,
    params?: GenerateMockParams,
  ): Promise<DashboardActionResult> {
    if (!params?.scenarioId || !params?.type || !params?.config) {
      return buildDashboardError(
        'INVALID_DATA',
        'scenarioId, type, and config are required',
      );
    }

    try {
      switch (params.type) {
        case 'signals': {
          const signalConfig = params.config as MockSignalConfig;

          // Resolve missing target_id from scenario
          if (!signalConfig.target_id) {
            const scenario = await this.testDataInjectorService.getScenario(
              params.scenarioId,
            );
            if (scenario?.target_id) {
              signalConfig.target_id = scenario.target_id;
            } else {
              return buildDashboardError(
                'MISSING_TARGET_ID',
                'target_id is required for signal generation. Either provide it in the config or set a target on the scenario.',
              );
            }
          }

          // source_id is now required since we removed legacy prediction.sources
          // Use a source_id from crawler.sources via source_subscriptions
          if (!signalConfig.source_id) {
            return buildDashboardError(
              'MISSING_SOURCE_ID',
              'source_id is required for signal generation. Please provide a source_id from crawler.sources.',
            );
          }

          const signals =
            this.testDataGeneratorService.generateMockSignals(signalConfig);
          const injected = await this.testDataInjectorService.injectSignals(
            params.scenarioId,
            signals,
          );
          return buildDashboardSuccess({
            type: 'signals',
            generated_count: signals.length,
            injected_count: injected.length,
            items: injected,
          });
        }

        case 'predictions': {
          const predConfig = params.config as MockPredictionConfig;

          // Resolve missing target_id from scenario
          if (!predConfig.target_id) {
            const scenario = await this.testDataInjectorService.getScenario(
              params.scenarioId,
            );
            if (scenario?.target_id) {
              predConfig.target_id = scenario.target_id;
            } else {
              return buildDashboardError(
                'MISSING_TARGET_ID',
                'target_id is required for prediction generation. Either provide it in the config or set a target on the scenario.',
              );
            }
          }

          const predsWithOutcomes =
            this.testDataGeneratorService.generateMockPredictionsWithOutcomes(
              predConfig,
            );
          const predictionData = predsWithOutcomes.map((p) => ({
            ...p.prediction,
            predicted_at: new Date().toISOString(),
            expires_at: new Date(
              Date.now() + p.prediction.timeframe_hours * 60 * 60 * 1000,
            ).toISOString(),
          }));
          const injected = await this.testDataInjectorService.injectPredictions(
            params.scenarioId,
            predictionData,
          );
          return buildDashboardSuccess({
            type: 'predictions',
            generated_count: predsWithOutcomes.length,
            injected_count: injected.length,
            items: injected,
            outcomes: predsWithOutcomes.map((p, i) => ({
              prediction_index: i,
              expected_outcome: p.outcome,
              actual_direction: p.actual_direction,
            })),
          });
        }

        case 'articles': {
          const articleConfig = params.config as MockArticleConfig;
          const articles =
            this.testDataGeneratorService.generateMockArticles(articleConfig);
          // Inject articles into test_articles table
          const injected = await this.testDataInjectorService.injectArticles(
            params.scenarioId,
            context.orgSlug,
            articles,
          );
          return buildDashboardSuccess({
            type: 'articles',
            generated_count: articles.length,
            injected_count: injected.length,
            items: injected,
          });
        }

        default:
          return buildDashboardError(
            'INVALID_TYPE',
            `Unsupported mock type: ${String(params.type)}. Supported: signals, predictions, articles`,
          );
      }
    } catch (error) {
      this.logger.error(
        `Failed to generate mock data: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'GENERATE_FAILED',
        error instanceof Error ? error.message : 'Failed to generate mock data',
      );
    }
  }

  private async handleRunTier(
    params?: RunTierParams,
  ): Promise<DashboardActionResult> {
    if (!params?.scenarioId || !params?.tier) {
      return buildDashboardError(
        'INVALID_DATA',
        'scenarioId and tier are required',
      );
    }

    try {
      let result;
      switch (params.tier) {
        case 'signal-detection':
          result = await this.testDataInjectorService.runSignalDetection(
            params.scenarioId,
          );
          break;
        case 'prediction-generation':
          result = await this.testDataInjectorService.runPredictionGeneration(
            params.scenarioId,
          );
          break;
        case 'evaluation':
          result = await this.testDataInjectorService.runEvaluation(
            params.scenarioId,
          );
          break;
        default:
          return buildDashboardError(
            'INVALID_TIER',
            `Unsupported tier: ${String(params.tier)}. Supported: signal-detection, prediction-generation, evaluation`,
          );
      }

      return buildDashboardSuccess({
        tier: params.tier,
        ...result,
      });
    } catch (error) {
      this.logger.error(
        `Failed to run tier: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'RUN_TIER_FAILED',
        error instanceof Error ? error.message : 'Failed to run tier',
      );
    }
  }

  private async handleCleanup(
    params?: CleanupParams,
  ): Promise<DashboardActionResult> {
    try {
      if (params?.cleanupAll) {
        const result = await this.testDataInjectorService.cleanupAllTestData();
        return buildDashboardSuccess({
          cleanup_type: 'all',
          ...result,
        });
      }

      if (!params?.scenarioId) {
        return buildDashboardError(
          'INVALID_DATA',
          'scenarioId is required (or set cleanupAll: true)',
        );
      }

      const result = await this.testDataInjectorService.cleanupScenario(
        params.scenarioId,
      );
      return buildDashboardSuccess({
        cleanup_type: 'scenario',
        scenario_id: params.scenarioId,
        ...result,
      });
    } catch (error) {
      this.logger.error(
        `Failed to cleanup test data: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'CLEANUP_FAILED',
        error instanceof Error ? error.message : 'Failed to cleanup test data',
      );
    }
  }

  private async handleGetCounts(
    params?: TestScenarioParams,
  ): Promise<DashboardActionResult> {
    if (!params?.id) {
      return buildDashboardError('MISSING_ID', 'Test scenario ID is required');
    }

    try {
      const counts = await this.testDataInjectorService.getScenarioDataCounts(
        params.id,
      );
      return buildDashboardSuccess({
        scenario_id: params.id,
        counts,
      });
    } catch (error) {
      this.logger.error(
        `Failed to get scenario counts: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'GET_COUNTS_FAILED',
        error instanceof Error
          ? error.message
          : 'Failed to get scenario counts',
      );
    }
  }

  private async handleGetSummaries(
    context: ExecutionContext,
  ): Promise<DashboardActionResult> {
    try {
      // Get all scenarios with their data counts
      const scenarios = await this.testDataInjectorService.listScenarios(
        context.orgSlug,
      );

      // Enrich with data counts
      const summaries = await Promise.all(
        scenarios.map(async (scenario) => {
          const counts =
            await this.testDataInjectorService.getScenarioDataCounts(
              scenario.id,
            );
          return {
            ...scenario,
            data_counts: counts,
          };
        }),
      );

      return buildDashboardSuccess(summaries);
    } catch (error) {
      this.logger.error(
        `Failed to get scenario summaries: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'GET_SUMMARIES_FAILED',
        error instanceof Error
          ? error.message
          : 'Failed to get scenario summaries',
      );
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Scenario Generation from Real-World Events (Phase 4.2 & 4.3)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Generate a test scenario from a missed opportunity
   */
  private async handleFromMissed(
    context: ExecutionContext,
    params?: GenerateFromMissedParams,
  ): Promise<DashboardActionResult> {
    if (!params?.missedOpportunityId) {
      return buildDashboardError(
        'MISSING_ID',
        'missedOpportunityId is required',
      );
    }

    try {
      const result =
        await this.scenarioGeneratorService.generateFromMissedOpportunity(
          params.missedOpportunityId,
          params.options || {},
          context,
        );

      return buildDashboardSuccess(result);
    } catch (error) {
      this.logger.error(
        `Failed to generate scenario from missed opportunity: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'GENERATE_FROM_MISSED_FAILED',
        error instanceof Error
          ? error.message
          : 'Failed to generate scenario from missed opportunity',
      );
    }
  }

  /**
   * Generate a test scenario from a learning
   */
  private async handleFromLearning(
    context: ExecutionContext,
    params?: GenerateFromLearningParams,
  ): Promise<DashboardActionResult> {
    if (!params?.learningId) {
      return buildDashboardError('MISSING_ID', 'learningId is required');
    }

    try {
      const result = await this.scenarioGeneratorService.generateFromLearning(
        params.learningId,
        params.options || {},
        context,
      );

      return buildDashboardSuccess(result);
    } catch (error) {
      this.logger.error(
        `Failed to generate scenario from learning: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'GENERATE_FROM_LEARNING_FAILED',
        error instanceof Error
          ? error.message
          : 'Failed to generate scenario from learning',
      );
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Scenario Variation Generation (Phase 4.4)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Generate variations of an existing scenario
   */
  private async handleGenerateVariations(
    context: ExecutionContext,
    params?: GenerateVariationsParams,
  ): Promise<DashboardActionResult> {
    if (!params?.request) {
      return buildDashboardError(
        'MISSING_REQUEST',
        'ScenarioVariationRequest is required',
      );
    }

    const {
      sourceScenarioId,
      variationTypes,
      variationsPerType: _variationsPerType,
    } = params.request;

    if (!sourceScenarioId) {
      return buildDashboardError('MISSING_ID', 'sourceScenarioId is required');
    }

    if (!variationTypes || variationTypes.length === 0) {
      return buildDashboardError(
        'MISSING_VARIATION_TYPES',
        'At least one variation type is required',
      );
    }

    try {
      const result = await this.scenarioVariationService.generateVariations(
        params.request,
        context,
      );

      return buildDashboardSuccess(result);
    } catch (error) {
      this.logger.error(
        `Failed to generate scenario variations: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'GENERATE_VARIATIONS_FAILED',
        error instanceof Error
          ? error.message
          : 'Failed to generate scenario variations',
      );
    }
  }
}
