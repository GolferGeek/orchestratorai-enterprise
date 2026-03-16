/**
 * Missed Opportunity Dashboard Handler
 *
 * Handles dashboard mode requests for missed opportunity analysis.
 * Missed opportunities are significant price moves that were not predicted.
 *
 * ACTIONS:
 * - list/detect: Legacy detection (deprecated - use baseline predictions instead)
 * - analyze: Deep on-demand analysis of a single miss (uses frontier LLM)
 * - investigate: NEW - Hierarchical investigation (predictors → signals → sources)
 *
 * RECOMMENDED FLOW (New System):
 * 1. BaselinePredictionRunner creates "flat" predictions for uncovered instruments (4:30 PM)
 * 2. OutcomeTrackingRunner resolves all predictions
 * 3. DailyMissInvestigationRunner identifies and investigates misses (5:00 PM)
 * 4. User can then:
 *    - Call 'investigate' to see hierarchical breakdown
 *    - Call 'analyze' for deep LLM analysis of a specific miss
 */

import { Injectable, Logger } from '@nestjs/common';
import type { ExecutionContext } from '@orchestrator-ai/transport-types';
import type { DashboardRequestPayload } from '@orchestrator-ai/transport-types';
import { MissedOpportunityDetectionService } from '../../services/missed-opportunity-detection.service';
import { MissedOpportunityAnalysisService } from '../../services/missed-opportunity-analysis.service';
import { MissInvestigationService } from '../../services/miss-investigation.service';
import {
  IDashboardHandler,
  DashboardActionResult,
  buildDashboardSuccess,
  buildDashboardError,
  buildPaginationMetadata,
} from '../dashboard-handler.interface';
import type {
  MissedOpportunity,
  MissDetectionConfig,
} from '../../interfaces/missed-opportunity.interface';

interface MissedOpportunityFilters {
  targetId?: string;
  status?: string;
  fromDate?: string;
  toDate?: string;
  minMovePercent?: number;
}

interface MissedOpportunityParams {
  id?: string;
  targetId?: string;
  predictionId?: string;
  universeId?: string;
  date?: string;
  filters?: MissedOpportunityFilters;
  page?: number;
  pageSize?: number;
  // Detection params
  detectionConfig?: MissDetectionConfig;
}

@Injectable()
export class MissedOpportunityHandler implements IDashboardHandler {
  private readonly logger = new Logger(MissedOpportunityHandler.name);
  private readonly supportedActions = [
    'list',
    'detect',
    'analyze',
    'investigate',
    'identify',
  ];

  constructor(
    private readonly detectionService: MissedOpportunityDetectionService,
    private readonly analysisService: MissedOpportunityAnalysisService,
    private readonly missInvestigationService: MissInvestigationService,
  ) {}

  async execute(
    action: string,
    payload: DashboardRequestPayload,
    context: ExecutionContext,
  ): Promise<DashboardActionResult> {
    this.logger.debug(
      `[MISSED-OPPORTUNITY-HANDLER] Executing action: ${action} for org: ${context.orgSlug}`,
    );

    const params = payload.params as MissedOpportunityParams | undefined;

    switch (action.toLowerCase()) {
      case 'list':
      case 'detect':
        return this.handleDetect(params);
      case 'analyze':
        return this.handleAnalyze(params, context);
      case 'identify':
        return this.handleIdentify(params);
      case 'investigate':
        return this.handleInvestigate(params);
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

  /**
   * @deprecated Use 'identify' action instead for the new baseline-based approach.
   *
   * Detect missed opportunities for a target (Legacy)
   * Runs detection to find unpredicted significant moves by scanning price snapshots.
   *
   * MIGRATION: The new approach uses:
   * 1. BaselinePredictionService to create "flat" predictions for all instruments
   * 2. OutcomeTrackingService to resolve predictions
   * 3. MissInvestigationService.identifyMisses() to find misses based on outcomes
   */
  private async handleDetect(
    params?: MissedOpportunityParams,
  ): Promise<DashboardActionResult> {
    this.logger.warn(
      'DEPRECATED: "detect" action uses legacy detection. Use "identify" for baseline-based miss identification.',
    );
    const targetId = params?.targetId || params?.filters?.targetId;

    if (!targetId) {
      return buildDashboardError(
        'MISSING_TARGET_ID',
        'Target ID is required to detect missed opportunities',
      );
    }

    try {
      // Detect missed opportunities for the target
      const opportunities =
        await this.detectionService.detectMissedOpportunities(
          targetId,
          params?.detectionConfig,
        );

      // Apply additional filters
      let filtered: MissedOpportunity[] = opportunities;

      if (params?.filters?.status) {
        filtered = filtered.filter(
          (o) => o.analysis_status === params.filters!.status,
        );
      }

      if (params?.filters?.fromDate) {
        const fromDate = new Date(params.filters.fromDate);
        filtered = filtered.filter((o) => new Date(o.move_start) >= fromDate);
      }

      if (params?.filters?.toDate) {
        const toDate = new Date(params.filters.toDate);
        filtered = filtered.filter((o) => new Date(o.move_start) <= toDate);
      }

      if (params?.filters?.minMovePercent !== undefined) {
        filtered = filtered.filter(
          (o) => Math.abs(o.move_percentage) >= params.filters!.minMovePercent!,
        );
      }

      // Sort by significance score (highest first)
      filtered.sort((a, b) => b.significance_score - a.significance_score);

      // Simple pagination
      const page = params?.page ?? 1;
      const pageSize = params?.pageSize ?? 20;
      const startIndex = (page - 1) * pageSize;
      const paginatedOpportunities = filtered.slice(
        startIndex,
        startIndex + pageSize,
      );

      return buildDashboardSuccess(
        paginatedOpportunities,
        buildPaginationMetadata(filtered.length, page, pageSize),
      );
    } catch (error) {
      this.logger.error(
        `Failed to detect missed opportunities: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'DETECT_FAILED',
        error instanceof Error
          ? error.message
          : 'Failed to detect missed opportunities',
      );
    }
  }

  /**
   * Analyze a specific missed opportunity
   * Runs full analysis to find root causes and suggest learnings
   */
  private async handleAnalyze(
    params: MissedOpportunityParams | undefined,
    context: ExecutionContext,
  ): Promise<DashboardActionResult> {
    if (!params?.id) {
      return buildDashboardError(
        'MISSING_ID',
        'Missed opportunity ID is required for analysis',
      );
    }

    try {
      const analysis = await this.analysisService.analyzeMissedOpportunity(
        params.id,
        context,
      );

      return buildDashboardSuccess({
        missedOpportunityId: params.id,
        analysis,
      });
    } catch (error) {
      this.logger.error(
        `Failed to analyze missed opportunity: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'ANALYZE_FAILED',
        error instanceof Error
          ? error.message
          : 'Failed to analyze missed opportunity',
      );
    }
  }

  /**
   * Identify misses using the NEW baseline-based approach
   *
   * This uses MissInvestigationService.identifyMisses() which works with
   * predictions that have outcomes (including baseline "flat" predictions).
   *
   * Prerequisites:
   * - BaselinePredictionRunner has created flat predictions for uncovered instruments
   * - OutcomeTrackingRunner has resolved predictions
   */
  private async handleIdentify(
    params?: MissedOpportunityParams,
  ): Promise<DashboardActionResult> {
    const datePart = new Date().toISOString().split('T')[0];
    const date =
      params?.date || datePart || new Date().toISOString().slice(0, 10);

    try {
      const misses = await this.missInvestigationService.identifyMisses(
        date,
        params?.universeId,
      );

      // Apply pagination
      const page = params?.page ?? 1;
      const pageSize = params?.pageSize ?? 20;
      const startIndex = (page - 1) * pageSize;
      const paginatedMisses = misses.slice(startIndex, startIndex + pageSize);

      return buildDashboardSuccess(
        paginatedMisses,
        buildPaginationMetadata(misses.length, page, pageSize),
      );
    } catch (error) {
      this.logger.error(
        `Failed to identify misses: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'IDENTIFY_FAILED',
        error instanceof Error ? error.message : 'Failed to identify misses',
      );
    }
  }

  /**
   * Investigate a specific prediction miss hierarchically
   *
   * Uses MissInvestigationService.investigateMissById() to navigate:
   * - Level 1: Find unused predictors that could have predicted the move
   * - Level 2: Find signals that were misread or ignored
   *
   * Requires predictionId to investigate.
   */
  private async handleInvestigate(
    params?: MissedOpportunityParams,
  ): Promise<DashboardActionResult> {
    if (!params?.predictionId) {
      return buildDashboardError(
        'MISSING_PREDICTION_ID',
        'Prediction ID is required for investigation',
      );
    }

    try {
      const investigation =
        await this.missInvestigationService.investigateMissById(
          params.predictionId,
        );

      if (!investigation) {
        return buildDashboardError(
          'NOT_A_MISS',
          'Prediction not found, has no outcome, or was correct (not a miss)',
        );
      }

      return buildDashboardSuccess(investigation);
    } catch (error) {
      this.logger.error(
        `Failed to investigate miss: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'INVESTIGATE_FAILED',
        error instanceof Error ? error.message : 'Failed to investigate miss',
      );
    }
  }
}
