import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  createBusinessAutomationAdvisorGraph,
  BusinessAutomationAdvisorGraph,
} from './business-automation-advisor.graph';
import {
  BusinessAutomationAdvisorInput,
  BusinessAutomationAdvisorState,
  BusinessAutomationAdvisorResult,
} from './business-automation-advisor.state';
import { LLMHttpClientService } from '../shared/services/llm-http-client.service';
import { ObservabilityService } from '../shared/services/observability.service';
import { PostgresCheckpointerService } from '../shared/persistence/postgres-checkpointer.service';
import {
  BusinessAutomationAdvisorDbService,
  SubmitInterestRequest,
  SubmissionResponse,
} from './business-automation-advisor-db.service';

/**
 * BusinessAutomationAdvisorService
 *
 * Manages the Business Automation Advisor agent lifecycle:
 * - Creates and initializes the graph
 * - Handles recommendation requests
 * - Returns agent recommendations for a given industry
 */
@Injectable()
export class BusinessAutomationAdvisorService implements OnModuleInit {
  private readonly logger = new Logger(BusinessAutomationAdvisorService.name);
  private graph!: BusinessAutomationAdvisorGraph;

  constructor(
    private readonly llmClient: LLMHttpClientService,
    private readonly observability: ObservabilityService,
    private readonly checkpointer: PostgresCheckpointerService,
    private readonly dbService: BusinessAutomationAdvisorDbService,
  ) {}

  async onModuleInit() {
    this.logger.log('Initializing Business Automation Advisor graph...');
    this.graph = await createBusinessAutomationAdvisorGraph(
      this.llmClient,
      this.observability,
      this.checkpointer,
    );
    this.logger.log('Business Automation Advisor graph initialized');
  }

  /**
   * Generate agent recommendations for an industry
   *
   * @param input - Input containing ExecutionContext and industry string
   */
  async generate(
    input: BusinessAutomationAdvisorInput,
  ): Promise<BusinessAutomationAdvisorResult> {
    const startTime = Date.now();
    const { context, industry } = input;
    const taskId = context.conversationId;

    this.logger.log(
      `Starting Business Automation Advisor: conversationId=${taskId}, industry=${industry}`,
    );

    try {
      // Validate input
      if (!industry || industry.trim().length === 0) {
        return {
          status: 'error',
          message: 'Missing required field: industry',
          error: 'Industry input is required',
        };
      }

      // Initial state
      const initialState: Partial<BusinessAutomationAdvisorState> = {
        executionContext: context,
        industryInput: industry.trim(),
        status: 'started',
        startedAt: startTime,
      };

      const config = {
        configurable: {
          thread_id: taskId,
        },
      };

      const finalState = (await this.graph.invoke(
        initialState,
        config,
      )) as BusinessAutomationAdvisorState;

      const duration = Date.now() - startTime;

      this.logger.log(
        `Business Automation Advisor completed: taskId=${taskId}, status=${finalState.status}, recommendations=${finalState.recommendations.length}, duration=${duration}ms`,
      );

      if (finalState.status === 'failed') {
        return {
          status: 'error',
          message: finalState.error || 'Generation failed',
          error: finalState.error,
        };
      }

      return {
        status: finalState.isFallback ? 'partial' : 'success',
        message: finalState.isFallback
          ? 'AI generation failed, using fallback recommendations'
          : 'Recommendations generated successfully',
        data: {
          industry: finalState.normalizedIndustry,
          industryDescription: finalState.industryDescription,
          recommendationCount: finalState.recommendations.length,
          isFallback: finalState.isFallback,
          recommendations: finalState.recommendations,
          processingTimeMs: duration,
        },
      };
    } catch (error) {
      const _duration = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      this.logger.error(
        `Business Automation Advisor failed: taskId=${taskId}, error=${errorMessage}`,
      );

      return {
        status: 'error',
        message: 'Failed to generate recommendations',
        error: errorMessage,
      };
    }
  }

  /**
   * Submit interest in selected agents
   *
   * Stores lead submission in the database for follow-up.
   */
  async submitInterest(
    request: SubmitInterestRequest,
  ): Promise<SubmissionResponse> {
    return this.dbService.submitInterest(request);
  }
}
