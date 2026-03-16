import {
  Injectable,
  Logger,
  Inject,
  forwardRef,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ExecutionContext } from '@orchestrator-ai/transport-types';
import { RiskScope } from '../interfaces/scope.interface';
import { RiskSubject } from '../interfaces/subject.interface';
import { RiskCompositeScore } from '../interfaces/composite-score.interface';
import { RiskDebate } from '../interfaces/debate.interface';
import { ScopeRepository } from '../repositories/scope.repository';
import { SubjectRepository } from '../repositories/subject.repository';
import { DimensionRepository } from '../repositories/dimension.repository';
import { AssessmentRepository } from '../repositories/assessment.repository';
import { CompositeScoreRepository } from '../repositories/composite-score.repository';
import {
  PredictorReaderRepository,
  PredictorForRisk,
} from '../repositories/predictor-reader.repository';
import { DimensionAnalyzerService } from './dimension-analyzer.service';
import { ScoreAggregationService } from './score-aggregation.service';
import { DebateService } from './debate.service';
import { ObservabilityEventsService } from '@orchestratorai/planes/observability';

export interface AnalysisResult {
  subject: RiskSubject;
  compositeScore: RiskCompositeScore;
  assessmentCount: number;
  debate?: RiskDebate;
  debateTriggered: boolean;
  /** True when no predictors were available for analysis */
  noDataAvailable?: boolean;
  /** Message explaining why analysis couldn't be performed */
  noDataReason?: string;
}

@Injectable()
export class RiskAnalysisService {
  private readonly logger = new Logger(RiskAnalysisService.name);

  constructor(
    private readonly scopeRepo: ScopeRepository,
    private readonly subjectRepo: SubjectRepository,
    private readonly dimensionRepo: DimensionRepository,
    private readonly assessmentRepo: AssessmentRepository,
    private readonly compositeScoreRepo: CompositeScoreRepository,
    private readonly predictorReaderRepo: PredictorReaderRepository,
    private readonly dimensionAnalyzer: DimensionAnalyzerService,
    private readonly scoreAggregation: ScoreAggregationService,
    @Inject(forwardRef(() => DebateService))
    private readonly debateService: DebateService,
    private readonly configService: ConfigService,
    @Optional()
    private readonly observabilityEvents?: ObservabilityEventsService,
  ) {}

  /**
   * Emit a progress event for real-time UI updates
   */
  private emitProgress(
    context: ExecutionContext,
    step: string,
    message: string,
    progress: number,
    metadata?: Record<string, unknown>,
  ): void {
    if (!this.observabilityEvents) return;

    void this.observabilityEvents.push({
      context,
      source_app: 'risk-analysis',
      hook_event_type: 'risk.analysis.progress',
      status: 'in_progress',
      message,
      progress,
      step,
      payload: {
        mode: 'analysis',
        ...metadata,
      },
      timestamp: Date.now(),
    });
  }

  /**
   * Run full risk analysis for a single subject
   * This is the main orchestration method
   */
  async analyzeSubject(
    subject: RiskSubject,
    scope: RiskScope,
    context: ExecutionContext,
  ): Promise<AnalysisResult> {
    this.logger.log(
      `Starting risk analysis for ${subject.identifier} in scope ${scope.name}`,
    );

    // Emit: Analysis starting
    this.emitProgress(
      context,
      'initializing',
      `Starting analysis for ${subject.identifier}`,
      0,
      {
        subjectId: subject.id,
        subjectIdentifier: subject.identifier,
        totalSteps: 8,
        sequence: 1,
      },
    );

    const analysisConfig = scope.analysis_config ?? {};

    // Check if Risk Radar is enabled (via scope config OR global env var)
    const scopeEnabled = analysisConfig.riskRadar?.enabled === true;
    const globalEnabled =
      this.configService.get<string>('RISK_RADAR_ENABLED')?.toLowerCase() ===
      'true';

    if (!scopeEnabled && !globalEnabled) {
      this.logger.debug(
        `Risk Radar disabled for scope ${scope.name} (set scope.analysis_config.riskRadar.enabled=true or RISK_RADAR_ENABLED=true)`,
      );
      throw new Error(
        'Risk Radar is not enabled for this scope. Set scope.analysis_config.riskRadar.enabled=true or RISK_RADAR_ENABLED=true environment variable.',
      );
    }

    // 1. Get all active dimensions for this scope
    this.emitProgress(
      context,
      'loading-dimensions',
      'Loading risk dimensions...',
      10,
      {
        subjectIdentifier: subject.identifier,
        sequence: 2,
      },
    );

    const dimensions = await this.dimensionRepo.findByScope(scope.id);
    if (dimensions.length === 0) {
      throw new Error(`No dimensions configured for scope ${scope.name}`);
    }

    this.logger.debug(
      `Found ${dimensions.length} dimensions to analyze: ${dimensions.map((d) => d.slug).join(', ')}`,
    );

    // Emit: Dimensions loaded
    this.emitProgress(
      context,
      'dimensions-loaded',
      `Found ${dimensions.length} dimensions to analyze`,
      15,
      {
        subjectIdentifier: subject.identifier,
        dimensionCount: dimensions.length,
        dimensions: dimensions.map((d) => d.name),
        sequence: 3,
      },
    );

    // 1b. Fetch predictors for this subject from prediction system
    let predictors: PredictorForRisk[] = [];
    try {
      // Get predictors from last 24 hours for this instrument
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      predictors = await this.predictorReaderRepo.findPredictorsBySymbol(
        subject.identifier,
        since,
        20, // Limit to 20 most recent predictors
      );
      this.logger.debug(
        `Found ${predictors.length} predictors for ${subject.identifier}`,
      );
    } catch (error) {
      this.logger.warn(
        `Failed to fetch predictors for ${subject.identifier}: ${error instanceof Error ? error.message : String(error)}`,
      );
      // Continue without predictors - don't fail analysis
    }

    // Check if we have any predictors to analyze
    // Without predictors, the analysis would be based on no real data
    if (predictors.length === 0) {
      this.logger.log(
        `No predictors available for ${subject.identifier} - skipping analysis`,
      );

      this.emitProgress(
        context,
        'no-data',
        `No recent market data available for ${subject.identifier}`,
        100,
        {
          subjectId: subject.id,
          subjectIdentifier: subject.identifier,
          noDataAvailable: true,
          sequence: 3,
        },
      );

      // Return a placeholder result indicating no data
      // We don't create a composite score with fake 50% values
      return {
        subject,
        compositeScore: {
          id: '',
          subject_id: subject.id,
          task_id: context.conversationId,
          overall_score: 0,
          dimension_scores: {},
          debate_id: null,
          debate_adjustment: 0,
          pre_debate_score: null,
          confidence: 0,
          status: 'active',
          valid_until: null,
          is_test: false,
          test_scenario_id: null,
          created_at: new Date().toISOString(),
        },
        assessmentCount: 0,
        debateTriggered: false,
        noDataAvailable: true,
        noDataReason: `No recent predictors available for ${subject.identifier}. Analysis requires market data from processed articles.`,
      };
    }

    // 2. Run dimension analysis with individual progress updates
    this.emitProgress(
      context,
      'analyzing-dimensions',
      'Analyzing dimensions with AI...',
      20,
      {
        subjectIdentifier: subject.identifier,
        dimensionCount: dimensions.length,
        sequence: 4,
      },
    );

    // Run dimension analysis sequentially to show progress for each
    type AssessmentData = Awaited<
      ReturnType<typeof this.dimensionAnalyzer.analyzeDimension>
    >;
    const successfulAssessments: AssessmentData[] = [];
    const failedDimensions: string[] = [];

    for (let i = 0; i < dimensions.length; i++) {
      const dimension = dimensions[i]!;
      const dimensionProgress = 20 + Math.floor((i / dimensions.length) * 40);

      // Emit progress for each dimension
      this.emitProgress(
        context,
        `analyzing-${dimension.slug}`,
        `Analyzing ${dimension.name}...`,
        dimensionProgress,
        {
          subjectIdentifier: subject.identifier,
          currentDimension: dimension.name,
          dimensionSlug: dimension.slug,
          dimensionIndex: i + 1,
          totalDimensions: dimensions.length,
          sequence: 5 + i,
        },
      );

      try {
        const assessment = await this.dimensionAnalyzer.analyzeDimension({
          subject,
          dimension,
          context,
          marketData: {},
          predictors, // Pass predictors from prediction system
        });
        successfulAssessments.push(assessment);
      } catch (error) {
        this.logger.warn(
          `Dimension ${dimension.slug} analysis failed: ${error instanceof Error ? error.message : String(error)}`,
        );
        failedDimensions.push(dimension.slug);
      }
    }

    if (successfulAssessments.length === 0) {
      throw new Error('All dimension analyses failed');
    }

    // Emit: Dimensions analyzed
    this.emitProgress(
      context,
      'dimensions-analyzed',
      `Analyzed ${successfulAssessments.length}/${dimensions.length} dimensions`,
      60,
      {
        subjectIdentifier: subject.identifier,
        successCount: successfulAssessments.length,
        failedCount: failedDimensions.length,
        sequence: 5 + dimensions.length,
      },
    );

    // Save assessments to database
    this.emitProgress(
      context,
      'saving-assessments',
      'Saving assessment results...',
      65,
      {
        subjectIdentifier: subject.identifier,
        sequence: 6 + dimensions.length,
      },
    );

    const createdAssessments = await this.assessmentRepo.createBatch(
      successfulAssessments,
    );

    this.logger.debug(
      `Created ${createdAssessments.length} assessments for ${subject.identifier}`,
    );

    // 4. Aggregate into composite score
    this.emitProgress(
      context,
      'aggregating-score',
      'Calculating composite risk score...',
      70,
      {
        subjectIdentifier: subject.identifier,
        sequence: 7 + dimensions.length,
      },
    );

    const aggregation = this.scoreAggregation.aggregateAssessments(
      createdAssessments,
      dimensions,
    );

    // 5. Mark previous active scores as superseded
    await this.compositeScoreRepo.supersedeForSubject(subject.id);

    // 6. Calculate validity duration
    const staleHours = scope.thresholds?.stale_hours ?? 24;
    const validUntil = this.scoreAggregation.calculateValidUntil(
      new Date(),
      staleHours,
    );

    // 7. Create the composite score
    this.emitProgress(
      context,
      'creating-score',
      'Saving composite score...',
      75,
      {
        subjectIdentifier: subject.identifier,
        overallScore: aggregation.overallScore,
        confidence: aggregation.confidence,
        sequence: 8 + dimensions.length,
      },
    );

    const compositeScore = await this.compositeScoreRepo.create({
      subject_id: subject.id,
      task_id: context.conversationId,
      overall_score: aggregation.overallScore,
      dimension_scores: aggregation.dimensionScores,
      confidence: aggregation.confidence,
      status: 'active',
      valid_until: validUntil.toISOString(),
    });

    this.logger.log(
      `Risk analysis complete for ${subject.identifier}: score=${compositeScore.overall_score}`,
    );

    // 8. Check if Red Team debate should be triggered
    let debate: RiskDebate | undefined;
    let debateTriggered = false;

    if (
      this.debateService.shouldTriggerDebate(compositeScore, analysisConfig)
    ) {
      this.emitProgress(
        context,
        'running-debate',
        'Running Red vs Blue debate...',
        80,
        {
          subjectIdentifier: subject.identifier,
          overallScore: compositeScore.overall_score,
          sequence: 9 + dimensions.length,
        },
      );

      this.logger.log(
        `Triggering Red Team debate for ${subject.identifier} (score: ${compositeScore.overall_score})`,
      );

      try {
        const debateResult = await this.debateService.runDebate({
          subject,
          compositeScore,
          assessments: createdAssessments,
          scopeId: scope.id,
          context,
        });

        debate = debateResult.debate;
        debateTriggered = true;

        this.emitProgress(
          context,
          'debate-complete',
          `Debate complete: score adjusted by ${debateResult.adjustment >= 0 ? '+' : ''}${debateResult.adjustment}`,
          95,
          {
            subjectIdentifier: subject.identifier,
            originalScore: compositeScore.overall_score,
            adjustedScore: debateResult.adjustedScore,
            adjustment: debateResult.adjustment,
            sequence: 10 + dimensions.length,
          },
        );

        this.logger.log(
          `Debate completed for ${subject.identifier}: score adjusted ${compositeScore.overall_score} → ${debateResult.adjustedScore} (${debateResult.adjustment >= 0 ? '+' : ''}${debateResult.adjustment})`,
        );
      } catch (error) {
        this.logger.error(
          `Debate failed for ${subject.identifier}: ${error instanceof Error ? error.message : String(error)}`,
        );
        // Continue without debate - don't fail the entire analysis
      }
    }

    // Emit: Analysis complete
    this.emitProgress(
      context,
      'complete',
      `Analysis complete for ${subject.identifier}: ${(compositeScore.overall_score * 100).toFixed(0)}% risk score`,
      100,
      {
        subjectId: subject.id,
        subjectIdentifier: subject.identifier,
        overallScore: compositeScore.overall_score,
        confidence: compositeScore.confidence,
        assessmentCount: createdAssessments.length,
        debateTriggered,
        sequence: 11 + dimensions.length,
      },
    );

    return {
      subject,
      compositeScore,
      assessmentCount: createdAssessments.length,
      debate,
      debateTriggered,
    };
  }

  /**
   * Run risk analysis for all active subjects in a scope
   */
  async analyzeScope(
    scope: RiskScope,
    context: ExecutionContext,
  ): Promise<AnalysisResult[]> {
    const subjects = await this.subjectRepo.findByScope(scope.id);

    this.logger.log(
      `Analyzing ${subjects.length} subjects in scope ${scope.name}`,
    );

    const results: AnalysisResult[] = [];

    for (const subject of subjects) {
      try {
        const result = await this.analyzeSubject(subject, scope, context);
        results.push(result);
      } catch (error) {
        this.logger.error(
          `Failed to analyze subject ${subject.identifier}: ${error instanceof Error ? error.message : String(error)}`,
        );
        // Continue with other subjects
      }
    }

    return results;
  }

  /**
   * Get the current risk score for a subject
   */
  async getCurrentScore(subjectId: string): Promise<RiskCompositeScore | null> {
    return this.compositeScoreRepo.findActiveBySubject(subjectId);
  }

  /**
   * Check if a subject's score is stale
   */
  async isScoreStale(subjectId: string): Promise<boolean> {
    const score = await this.getCurrentScore(subjectId);
    if (!score) {
      return true;
    }

    if (!score.valid_until) {
      return false;
    }

    return new Date() > new Date(score.valid_until);
  }

  /**
   * Get all active scopes for an agent
   */
  async getScopesForAgent(
    agentSlug: string,
    organizationSlug: string,
  ): Promise<RiskScope[]> {
    return this.scopeRepo.findByAgentSlug(agentSlug, organizationSlug);
  }
}
