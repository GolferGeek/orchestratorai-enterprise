import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ExecutionContext } from '@orchestrator-ai/transport-types';
import { LLM_SERVICE, LLMServiceProvider } from '@orchestratorai/planes/llm';
import { DATABASE_SERVICE, DatabaseService } from '@/database';
import { LearningQueueService } from './learning-queue.service';
import {
  MissedOpportunity,
  MissAnalysisResult,
} from '../interfaces/missed-opportunity.interface';
import {
  LearningType,
  LearningScopeLevel,
} from '../interfaces/learning.interface';
import { CreateLearningQueueDto } from '../dto/learning.dto';

/**
 * MissedOpportunityAnalysisService - On-Demand Deep Analysis
 *
 * PURPOSE:
 * Provides deep, interactive analysis of a SINGLE missed opportunity when
 * triggered by a user from the dashboard. Uses a frontier LLM model for
 * thorough investigation with high-quality reasoning.
 *
 * RELATIONSHIP TO OTHER SERVICES:
 *
 * - MissedOpportunityDetectionService (DEPRECATED):
 *   Old detection approach. Use BaselinePredictionService + MissInvestigationService instead.
 *
 * - MissInvestigationService (NEW - Hierarchical):
 *   Automated hierarchical investigation (predictors → signals) run by
 *   DailyMissInvestigationRunner. Identifies misses and investigates internal
 *   data before external research.
 *
 * - SourceResearchService (NEW - Batch):
 *   Cost-effective batch research using Gemini Flash for automated end-of-day
 *   analysis of multiple misses. Uses cheap LLM for bulk operations.
 *
 * - THIS SERVICE (On-Demand Deep):
 *   User-triggered deep analysis of a single miss using frontier LLM.
 *   Provides detailed reasoning, tool suggestions, and high-quality learnings.
 *   Use when user wants thorough investigation of a specific missed opportunity.
 *
 * WHEN TO USE:
 * - User clicks "Analyze" on a specific missed opportunity in the dashboard
 * - Deep investigation needed with detailed reasoning
 * - Tool/source suggestions with rationale needed
 * - Single-miss analysis where cost is not the primary concern
 *
 * WHEN NOT TO USE:
 * - Batch analysis of many misses (use SourceResearchService)
 * - Automated end-of-day processing (use DailyMissInvestigationRunner)
 * - Just checking what predictors/signals exist (use MissInvestigationService)
 */

type SupabaseError = { message: string; code?: string } | null;

type SupabaseSelectResponse<T> = {
  data: T | null;
  error: SupabaseError;
};

type SupabaseSelectListResponse<T> = {
  data: T[] | null;
  error: SupabaseError;
};

interface RejectedSignal {
  id: string;
  signal_type: string;
  content: string;
  direction: string;
  strength: number;
  timestamp: string;
  rejection_reason: string | null;
}

@Injectable()
export class MissedOpportunityAnalysisService {
  private readonly logger = new Logger(MissedOpportunityAnalysisService.name);
  private readonly schema = 'prediction';

  constructor(
    @Inject(DATABASE_SERVICE) private readonly db: DatabaseService,
    @Inject(LLM_SERVICE) private readonly llmService: LLMServiceProvider,
    private readonly learningQueueService: LearningQueueService,
  ) {}

  /**
   * Analyze a missed opportunity
   * Uses LLM to understand what caused the move and why we missed it
   */
  async analyzeMissedOpportunity(
    missId: string,
    executionContext: ExecutionContext,
  ): Promise<MissAnalysisResult> {
    this.logger.log(`Analyzing missed opportunity: ${missId}`);

    // Get missed opportunity record
    const missedOpportunity = await this.getMissedOpportunity(missId);

    if (!missedOpportunity) {
      throw new NotFoundException(`Missed opportunity not found: ${missId}`);
    }

    // Update status to analyzing
    await this.updateMissedOpportunity(missId, {
      analysis_status: 'analyzing',
    });

    try {
      // Get rejected signals from the time period
      const rejectedSignals = await this.getRejectedSignals(
        missedOpportunity.target_id,
        missedOpportunity.move_start,
        missedOpportunity.move_end,
      );

      this.logger.log(`Found ${rejectedSignals.length} rejected signals`);

      // Build LLM prompt for analysis
      const systemPrompt = this.buildAnalysisSystemPrompt();
      const userPrompt = this.buildAnalysisUserPrompt(
        missedOpportunity,
        rejectedSignals,
      );

      // Call LLM
      const response = await this.llmService.generateResponse(
        systemPrompt,
        userPrompt,
        {
          executionContext,
          callerType: 'api',
          callerName: 'missed-opportunity-analysis',
        },
      );

      // Parse LLM response
      const responseText =
        typeof response === 'string' ? response : response.content;
      const parsedAnalysis = this.parseAnalysisResponse(responseText);

      // Build analysis result
      const analysisResult: MissAnalysisResult = {
        missedOpportunityId: missId,
        discoveredDrivers: parsedAnalysis.discoveredDrivers,
        signalsWeHad: rejectedSignals.map((s) => s.id),
        signalGaps: parsedAnalysis.signalGaps,
        sourceGaps: parsedAnalysis.sourceGaps,
        suggestedLearnings: parsedAnalysis.suggestedLearnings,
        toolSuggestions: this.generateToolSuggestions(parsedAnalysis),
      };

      // Update missed opportunity with analysis
      await this.updateMissedOpportunity(missId, {
        analysis_status: 'completed',
        discovered_drivers: analysisResult.discoveredDrivers,
        source_gaps: analysisResult.sourceGaps,
        suggested_learnings: analysisResult.suggestedLearnings.map((l) => ({
          type: l.type,
          content: l.content,
          scope: l.scope,
        })),
      });

      // Queue suggested learnings for HITL review
      await this.queueSuggestedLearnings(
        missId,
        missedOpportunity.target_id,
        analysisResult.suggestedLearnings,
      );

      this.logger.log(
        `Analysis complete: ${analysisResult.discoveredDrivers.length} drivers, ${analysisResult.suggestedLearnings.length} learning suggestions`,
      );

      return analysisResult;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Failed to analyze missed opportunity: ${errorMessage}`,
      );
      // Update status back to pending on error
      await this.updateMissedOpportunity(missId, {
        analysis_status: 'pending',
      });
      throw error;
    }
  }

  /**
   * Generate tool/source suggestions based on identified gaps
   */
  generateToolSuggestions(
    analysis: Partial<MissAnalysisResult>,
  ): { tool_type: string; description: string; rationale: string }[] {
    const suggestions: {
      tool_type: string;
      description: string;
      rationale: string;
    }[] = [];

    if (!analysis.sourceGaps) return suggestions;

    // Map source gaps to tool suggestions
    for (const gap of analysis.sourceGaps) {
      const gapLower = gap.toLowerCase();

      if (gapLower.includes('social') || gapLower.includes('twitter')) {
        suggestions.push({
          tool_type: 'social_media',
          description: 'Social media sentiment analysis (Twitter, Reddit)',
          rationale: `Gap identified: ${gap}`,
        });
      } else if (gapLower.includes('news') || gapLower.includes('article')) {
        suggestions.push({
          tool_type: 'news_aggregator',
          description: 'Real-time news aggregation and analysis',
          rationale: `Gap identified: ${gap}`,
        });
      } else if (gapLower.includes('technical') || gapLower.includes('chart')) {
        suggestions.push({
          tool_type: 'technical_analysis',
          description: 'Advanced technical indicator analysis',
          rationale: `Gap identified: ${gap}`,
        });
      } else if (
        gapLower.includes('fundamental') ||
        gapLower.includes('financial')
      ) {
        suggestions.push({
          tool_type: 'fundamental_data',
          description: 'Fundamental financial data and metrics',
          rationale: `Gap identified: ${gap}`,
        });
      } else if (gapLower.includes('macro') || gapLower.includes('economic')) {
        suggestions.push({
          tool_type: 'macro_data',
          description: 'Macroeconomic indicators and data',
          rationale: `Gap identified: ${gap}`,
        });
      } else {
        suggestions.push({
          tool_type: 'custom',
          description: `Custom data source for: ${gap}`,
          rationale: `Gap identified: ${gap}`,
        });
      }
    }

    return suggestions;
  }

  /**
   * Get missed opportunity by ID
   */
  private async getMissedOpportunity(
    id: string,
  ): Promise<MissedOpportunity | null> {
    const { data, error } = (await this.db
      .from(this.schema, 'missed_opportunities')
      .select('*')
      .eq('id', id)
      .single()) as SupabaseSelectResponse<MissedOpportunity>;

    if (error && error.code !== 'PGRST116') {
      this.logger.error(`Failed to fetch missed opportunity: ${error.message}`);
      throw new Error(`Failed to fetch missed opportunity: ${error.message}`);
    }

    return data;
  }

  /**
   * Update missed opportunity record
   */
  private async updateMissedOpportunity(
    id: string,
    updates: Partial<MissedOpportunity>,
  ): Promise<void> {
    const { error } = await this.db
      .from(this.schema, 'missed_opportunities')
      .update(updates)
      .eq('id', id);

    if (error) {
      this.logger.error(
        `Failed to update missed opportunity: ${error.message}`,
      );
      throw new Error(`Failed to update missed opportunity: ${error.message}`);
    }
  }

  /**
   * Get rejected signals from time period
   */
  private async getRejectedSignals(
    targetId: string,
    moveStart: string,
    moveEnd: string,
  ): Promise<RejectedSignal[]> {
    // Query signals that were rejected during the move period
    const { data, error } = (await this.db
      .from(this.schema, 'signals')
      .select('id, signal_type, content, direction, strength, timestamp')
      .eq('target_id', targetId)
      .gte('timestamp', moveStart)
      .lte('timestamp', moveEnd)
      .eq('was_used_for_prediction', false)
      .order('timestamp', {
        ascending: true,
      })) as SupabaseSelectListResponse<RejectedSignal>;

    if (error) {
      this.logger.error(`Failed to fetch rejected signals: ${error.message}`);
      throw new Error(`Failed to fetch rejected signals: ${error.message}`);
    }

    return data ?? [];
  }

  /**
   * Build system prompt for analysis
   */
  private buildAnalysisSystemPrompt(): string {
    return `You are an expert market analyst tasked with understanding why a significant price move was not predicted by our system.

Your role is to:
1. Analyze what fundamental or technical drivers caused the price move
2. Review signals that were available but rejected
3. Identify what types of signals or data sources we were missing
4. Suggest learnings that could improve future predictions

Be specific and actionable in your analysis. Focus on what the system could have done differently.`;
  }

  /**
   * Build user prompt for analysis
   */
  private buildAnalysisUserPrompt(
    missedOpportunity: MissedOpportunity,
    rejectedSignals: RejectedSignal[],
  ): string {
    let prompt = `A significant price move was not predicted:

**Move Details:**
- Direction: ${missedOpportunity.move_direction}
- Magnitude: ${missedOpportunity.move_percentage.toFixed(2)}%
- Start: ${missedOpportunity.move_start}
- End: ${missedOpportunity.move_end}
- Significance Score: ${missedOpportunity.significance_score.toFixed(2)}

`;

    if (rejectedSignals.length > 0) {
      prompt += `**Signals We Had But Rejected (${rejectedSignals.length}):**\n`;
      rejectedSignals.forEach((signal, idx) => {
        prompt += `${idx + 1}. [${signal.signal_type}] ${signal.direction} (strength: ${signal.strength})\n`;
        prompt += `   Content: ${signal.content.substring(0, 200)}${signal.content.length > 200 ? '...' : ''}\n`;
        if (signal.rejection_reason) {
          prompt += `   Rejection: ${signal.rejection_reason}\n`;
        }
        prompt += '\n';
      });
    } else {
      prompt += '**No signals were available during this period.**\n\n';
    }

    prompt += `Please provide your analysis in the following JSON format:

\`\`\`json
{
  "discoveredDrivers": ["driver1", "driver2", ...],
  "signalGaps": ["missing signal type1", "missing signal type2", ...],
  "sourceGaps": ["missing data source1", "missing data source2", ...],
  "suggestedLearnings": [
    {
      "type": "rule|pattern|avoid|weight_adjustment|threshold",
      "content": "specific learning description",
      "scope": "runner|domain|universe|target"
    }
  ]
}
\`\`\`

Provide 2-5 specific, actionable learnings that could help predict similar moves in the future.`;

    return prompt;
  }

  /**
   * Parse LLM analysis response
   */
  private parseAnalysisResponse(responseText: string): {
    discoveredDrivers: string[];
    signalGaps: string[];
    sourceGaps: string[];
    suggestedLearnings: { type: string; content: string; scope: string }[];
  } {
    try {
      // Extract JSON from markdown code blocks if present
      const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      const jsonText = jsonMatch && jsonMatch[1] ? jsonMatch[1] : responseText;

      const parsed = JSON.parse(jsonText) as {
        discoveredDrivers?: string[];
        signalGaps?: string[];
        sourceGaps?: string[];
        suggestedLearnings?: { type: string; content: string; scope: string }[];
      };

      return {
        discoveredDrivers: Array.isArray(parsed.discoveredDrivers)
          ? parsed.discoveredDrivers
          : [],
        signalGaps: Array.isArray(parsed.signalGaps) ? parsed.signalGaps : [],
        sourceGaps: Array.isArray(parsed.sourceGaps) ? parsed.sourceGaps : [],
        suggestedLearnings: Array.isArray(parsed.suggestedLearnings)
          ? parsed.suggestedLearnings
          : [],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to parse analysis response: ${errorMessage}`);
      // Return empty analysis if parsing fails
      return {
        discoveredDrivers: [],
        signalGaps: [],
        sourceGaps: [],
        suggestedLearnings: [],
      };
    }
  }

  /**
   * Queue suggested learnings for HITL review
   */
  private async queueSuggestedLearnings(
    missedOpportunityId: string,
    targetId: string,
    suggestedLearnings: { type: string; content: string; scope: string }[],
  ): Promise<void> {
    for (const learning of suggestedLearnings) {
      // Map string types to proper LearningType
      let learningType: LearningType = 'pattern'; // default
      if (
        ['rule', 'pattern', 'avoid', 'weight_adjustment', 'threshold'].includes(
          learning.type,
        )
      ) {
        learningType = learning.type as LearningType;
      }

      // Map scope to LearningScopeLevel
      let scopeLevel: LearningScopeLevel = 'target'; // default
      if (['runner', 'domain', 'universe', 'target'].includes(learning.scope)) {
        scopeLevel = learning.scope as LearningScopeLevel;
      }

      const queueDto: CreateLearningQueueDto = {
        suggested_scope_level: scopeLevel,
        suggested_target_id: scopeLevel === 'target' ? targetId : undefined,
        suggested_universe_id: undefined, // Would need to get from target
        suggested_domain: undefined, // Would need to get from target
        suggested_analyst_id: undefined,
        suggested_learning_type: learningType,
        suggested_title: `Missed ${missedOpportunityId.substring(0, 8)}: ${learning.type}`,
        suggested_description: learning.content,
        suggested_config: {},
        source_missed_opportunity_id: missedOpportunityId,
        ai_reasoning: `Generated from missed opportunity analysis`,
        ai_confidence: 0.7, // Medium confidence since it's AI-suggested
      };

      try {
        await this.learningQueueService.createSuggestion(queueDto);
        this.logger.log(
          `Queued learning suggestion: ${queueDto.suggested_title}`,
        );
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        this.logger.error(
          `Failed to queue learning suggestion: ${errorMessage}`,
        );
      }
    }
  }
}
