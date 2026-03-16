/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call */
// Disabled unsafe rules due to dynamic data handling in source research
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ExecutionContext } from '@orchestrator-ai/transport-types';
import { createSystemTriggeredContext } from '../../../automation-context/automation-context';
import { LLMGenerationService } from '@/llms/services/llm-generation.service';
import {
  MissInvestigation,
  MissResearchBatch,
  SourceResearchResult,
  SuggestedLearningFromInvestigation,
} from '../interfaces/miss-investigation.interface';

/**
 * Source Research Service
 *
 * Uses a local research model (Ollama qwen2.5:7b by default) to investigate
 * prediction misses that couldn't be explained by existing predictors or signals.
 *
 * The service batches multiple misses into a single API call for efficiency,
 * then parses the results to identify:
 * - What news/events caused the moves
 * - What sources would have had early information
 * - Whether the move was predictable
 */
@Injectable()
export class SourceResearchService {
  private readonly logger = new Logger(SourceResearchService.name);

  // Research model configuration from environment
  private readonly researchProvider: string;
  private readonly researchModel: string;

  constructor(
    private readonly llmGenerationService: LLMGenerationService,
    private readonly configService: ConfigService,
  ) {
    this.researchProvider =
      this.configService.get<string>('DEFAULT_RESEARCH_PROVIDER') || 'ollama';
    this.researchModel =
      this.configService.get<string>('DEFAULT_RESEARCH_MODEL') || 'qwen2.5:7b';

    this.logger.log(
      `Source research configured with ${this.researchProvider}/${this.researchModel}`,
    );
  }

  /**
   * Create ExecutionContext for research calls
   */
  private createResearchContext(_batchId: string): ExecutionContext {
    return createSystemTriggeredContext({
      orgSlug: 'system',
      agentSlug: 'source-research',
      provider: this.researchProvider,
      model: this.researchModel,
    });
  }

  /**
   * Research multiple misses in a single batch call
   * More efficient than individual calls for each miss
   */
  async researchMissBatch(
    investigations: MissInvestigation[],
    date: string,
  ): Promise<Map<string, SourceResearchResult>> {
    if (investigations.length === 0) {
      return new Map();
    }

    this.logger.log(
      `Researching ${investigations.length} misses for date ${date}`,
    );

    // Build the batch request
    const batch = this.buildResearchBatch(investigations, date);

    // Create the research prompt
    const systemPrompt = this.buildSystemPrompt();
    const userPrompt = this.buildUserPrompt(batch);

    // Make the API call
    const ctx = this.createResearchContext(`${date}-${Date.now()}`);

    try {
      const response = await this.llmGenerationService.generateResponse(
        ctx,
        systemPrompt,
        userPrompt,
        {
          executionContext: ctx,
          temperature: 0.3, // Lower temperature for more factual responses
          maxTokens: 4000,
        },
      );

      const responseText =
        typeof response === 'string' ? response : response.content;

      // Parse the response
      const results = this.parseResearchResponse(responseText, investigations);

      this.logger.log(`Research complete: ${results.size} results parsed`);

      return results;
    } catch (error) {
      this.logger.error(
        `Research failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw error;
    }
  }

  /**
   * Build the batch request from investigations
   */
  private buildResearchBatch(
    investigations: MissInvestigation[],
    date: string,
  ): MissResearchBatch {
    return {
      date,
      misses: investigations.map((inv) => ({
        targetSymbol: inv.prediction.target?.symbol || 'UNKNOWN',
        targetName: inv.prediction.target?.name || 'Unknown',
        missType: inv.missType,
        predictedDirection:
          inv.missType !== 'missed_opportunity'
            ? inv.predicted.direction
            : undefined,
        actualDirection: inv.actual.direction,
        actualMagnitude: inv.actual.magnitude,
        existingSignals: this.extractExistingSignals(inv),
      })),
    };
  }

  /**
   * Extract existing signals from investigation for context
   */
  private extractExistingSignals(
    inv: MissInvestigation,
  ): Array<{ content: string; direction: string; source: string }> {
    const signals: Array<{
      content: string;
      direction: string;
      source: string;
    }> = [];

    // From consumed predictors
    for (const predictor of inv.prediction.consumedPredictors || []) {
      if (predictor.signal) {
        signals.push({
          content: predictor.signal.content.slice(0, 200),
          direction: predictor.signal.direction,
          source: predictor.signal.source?.name || 'unknown',
        });
      }
    }

    // From misread signals
    for (const misread of inv.misreadSignals) {
      signals.push({
        content: misread.signal.content.slice(0, 200),
        direction: misread.signal.direction,
        source: misread.signal.source?.name || 'unknown',
      });
    }

    return signals.slice(0, 5); // Limit to 5 signals per instrument
  }

  /**
   * Build the system prompt for research
   */
  private buildSystemPrompt(): string {
    return `You are a financial research analyst investigating why certain stock/instrument predictions were incorrect or missed entirely.

Your task is to analyze what news, events, or market factors caused specific price movements, and identify what information sources would have provided early warning.

For each instrument, you must provide:
1. DISCOVERED_DRIVERS: What specific news, events, or factors likely caused the price movement
2. SIGNALS_NEEDED: What types of signals or information would have predicted this
3. SUGGESTED_SOURCES: Specific sources that would have had this information (news sites, data feeds, SEC filings, social media, etc.)
4. PREDICTABILITY: Rate as "predictable" (clear signals existed), "difficult" (subtle signals), or "unpredictable" (black swan)
5. REASONING: Brief explanation of your assessment

Respond in JSON format with an array of results, one per instrument.`;
  }

  /**
   * Build the user prompt with batch data
   */
  private buildUserPrompt(batch: MissResearchBatch): string {
    let prompt = `Analyze the following prediction misses from ${batch.date}:\n\n`;

    for (const miss of batch.misses) {
      prompt += `## ${miss.targetSymbol} (${miss.targetName})\n`;
      prompt += `- Miss Type: ${miss.missType}\n`;
      if (miss.predictedDirection) {
        prompt += `- Predicted: ${miss.predictedDirection}\n`;
      }
      prompt += `- Actual: ${miss.actualDirection} (${miss.actualMagnitude.toFixed(2)}%)\n`;

      if (miss.existingSignals.length > 0) {
        prompt += `- Signals we had:\n`;
        for (const signal of miss.existingSignals) {
          prompt += `  - [${signal.source}] ${signal.direction}: "${signal.content.slice(0, 100)}..."\n`;
        }
      } else {
        prompt += `- No relevant signals captured\n`;
      }
      prompt += '\n';
    }

    prompt += `\nProvide your analysis in the following JSON format:
{
  "results": [
    {
      "symbol": "AAPL",
      "discoveredDrivers": ["iPhone sales beat expectations", "Positive analyst upgrade"],
      "signalTypesNeeded": ["earnings_preview", "analyst_rating_change"],
      "suggestedSources": [
        {"name": "SEC EDGAR", "type": "sec_filing", "description": "8-K filings for material events"},
        {"name": "Bloomberg", "type": "news", "description": "Real-time financial news"}
      ],
      "predictability": "predictable",
      "reasoning": "Clear signals from earnings preview and analyst activity"
    }
  ]
}`;

    return prompt;
  }

  /**
   * Parse the research response into structured results
   */
  private parseResearchResponse(
    responseText: string,
    investigations: MissInvestigation[],
  ): Map<string, SourceResearchResult> {
    const results = new Map<string, SourceResearchResult>();

    try {
      // Extract JSON from response (handle markdown code blocks)
      let jsonText = responseText;
      const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch && jsonMatch[1]) {
        jsonText = jsonMatch[1].trim();
      }

      const parsed = JSON.parse(jsonText);
      const resultsArray = parsed.results || parsed;

      // Create a map of symbols to investigation IDs
      const symbolToInvId = new Map<string, string>();
      for (const inv of investigations) {
        const symbol = inv.prediction.target?.symbol || 'UNKNOWN';
        symbolToInvId.set(symbol, inv.id);
      }

      // Parse each result
      for (const result of resultsArray) {
        const symbol = result.symbol || result.targetSymbol;
        const invId = symbolToInvId.get(symbol);

        if (!invId) {
          this.logger.warn(`No investigation found for symbol: ${symbol}`);
          continue;
        }

        const researchResult: SourceResearchResult = {
          discoveredDrivers: result.discoveredDrivers || [],
          signalsWeHad: [], // Already captured in investigation
          signalTypesNeeded: result.signalTypesNeeded || [],
          suggestedSources: (result.suggestedSources || []).map(
            (s: Record<string, unknown>) => ({
              name: (s.name as string) || 'Unknown',
              type: this.mapSourceType(s.type as string),
              url: s.url as string | undefined,
              description: (s.description as string) || '',
            }),
          ),
          predictability: this.mapPredictability(result.predictability),
          reasoning: result.reasoning || '',
        };

        results.set(invId, researchResult);
      }
    } catch (error) {
      this.logger.error(
        `Failed to parse research response: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      this.logger.debug(`Response text: ${responseText.slice(0, 500)}...`);
    }

    return results;
  }

  /**
   * Map source type string to enum
   */
  private mapSourceType(
    type: string,
  ): 'news' | 'sec_filing' | 'social' | 'analyst' | 'data_feed' | 'other' {
    const typeMap: Record<
      string,
      'news' | 'sec_filing' | 'social' | 'analyst' | 'data_feed' | 'other'
    > = {
      news: 'news',
      sec_filing: 'sec_filing',
      sec: 'sec_filing',
      social: 'social',
      twitter: 'social',
      analyst: 'analyst',
      data_feed: 'data_feed',
      data: 'data_feed',
    };
    return typeMap[type?.toLowerCase()] || 'other';
  }

  /**
   * Map predictability string to enum
   */
  private mapPredictability(
    pred: string,
  ): 'predictable' | 'difficult' | 'unpredictable' {
    const predMap: Record<
      string,
      'predictable' | 'difficult' | 'unpredictable'
    > = {
      predictable: 'predictable',
      difficult: 'difficult',
      hard: 'difficult',
      unpredictable: 'unpredictable',
      impossible: 'unpredictable',
      'black swan': 'unpredictable',
    };
    return predMap[pred?.toLowerCase()] || 'difficult';
  }

  /**
   * Generate learning suggestion from research results
   */
  generateSourceLevelLearning(
    investigation: MissInvestigation,
    research: SourceResearchResult,
  ): SuggestedLearningFromInvestigation | null {
    // Don't suggest learning for unpredictable events
    if (research.predictability === 'unpredictable') {
      return null;
    }

    const suggestedSources = research.suggestedSources;
    const topSource = suggestedSources[0];
    if (!topSource) {
      return null;
    }

    return {
      type: 'rule',
      scope: 'universe',
      title: `Add source: ${topSource.name}`,
      description: `Research suggests ${topSource.name} (${topSource.type}) would have provided early signals for ${investigation.prediction.target?.symbol || 'this instrument'}. ${topSource.description}`,
      config: {
        sourceType: topSource.type,
        sourceName: topSource.name,
        sourceUrl: topSource.url,
        signalTypesNeeded: research.signalTypesNeeded,
      },
      evidence: {
        missType: investigation.missType,
        investigationLevel: 'source',
        keyFindings: [
          `Discovered drivers: ${research.discoveredDrivers.join(', ')}`,
          `Predictability: ${research.predictability}`,
          `Reasoning: ${research.reasoning}`,
        ],
      },
      suggestedTest: {
        type: 'backtest',
        description: `Backtest with ${topSource.name} data to verify it would have provided early signal`,
        params: {
          sourceName: topSource.name,
          sourceType: topSource.type,
          targetId: investigation.prediction.target_id,
          startDate: investigation.prediction.predicted_at,
        },
      },
    };
  }
}
