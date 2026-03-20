import { Injectable, Inject, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LLM_SERVICE, LLMServiceProvider } from '@orchestratorai/planes/llm';
import { ExecutionContext } from '@orchestrator-ai/transport-types';
import { RiskSubject } from '../interfaces/subject.interface';
import {
  RiskDimension,
  RiskDimensionContext,
} from '../interfaces/dimension.interface';
import {
  CreateRiskAssessmentData,
  AssessmentSignal,
} from '../interfaces/assessment.interface';
import { DimensionContextRepository } from '../repositories/dimension-context.repository';
import { PredictorForRisk } from '../repositories/predictor-reader.repository';

/**
 * Article data for dimension analysis
 */
export interface RelevantArticle {
  articleId: string;
  title: string;
  content: string;
  url: string;
  publishedAt: string;
  sentiment: number;
  sentimentLabel: string;
  confidence: number;
  riskIndicators: Array<{ type: string; keywords: string[] }>;
}

export interface DimensionAnalysisInput {
  subject: RiskSubject;
  dimension: RiskDimension;
  context: ExecutionContext;
  marketData?: Record<string, unknown>;
  /** Relevant articles for this subject/dimension (from article classifier) */
  articles?: RelevantArticle[];
  /** Predictors from prediction system (processed articles with analyst assessments) */
  predictors?: PredictorForRisk[];
}

export interface DimensionAnalysisOutput {
  score: number;
  confidence: number;
  reasoning: string;
  evidence: string[];
  signals: AssessmentSignal[];
}

/** Default timeout per dimension LLM call (ms). Prevents indefinite hang when Ollama is slow/unavailable. */
const DEFAULT_DIMENSION_LLM_TIMEOUT_MS = 90_000;

@Injectable()
export class DimensionAnalyzerService {
  private readonly logger = new Logger(DimensionAnalyzerService.name);

  constructor(
    @Inject(LLM_SERVICE) private readonly llmService: LLMServiceProvider,
    private readonly dimensionContextRepo: DimensionContextRepository,
    private readonly configService: ConfigService,
  ) {}

  private getDimensionTimeoutMs(): number {
    const env = this.configService.get<string>('RISK_DIMENSION_LLM_TIMEOUT_MS');
    if (env) {
      const parsed = parseInt(env, 10);
      if (!Number.isNaN(parsed) && parsed > 0) return parsed;
    }
    return DEFAULT_DIMENSION_LLM_TIMEOUT_MS;
  }

  /**
   * Analyze a single dimension for a subject
   * Uses the versioned prompt from dimension_contexts table
   * Incorporates relevant articles from the article classifier
   */
  async analyzeDimension(
    input: DimensionAnalysisInput,
  ): Promise<CreateRiskAssessmentData> {
    const { subject, dimension, context, marketData } = input;
    const { articles, predictors } = input;

    this.logger.debug(
      `Analyzing dimension ${dimension.slug} for subject ${subject.identifier}`,
    );

    // Get the active dimension context (versioned prompt)
    const dimensionContext =
      await this.dimensionContextRepo.findActiveForDimension(dimension.id);

    if (!dimensionContext) {
      this.logger.warn(`No active context for dimension ${dimension.slug}`);
      // Return a default assessment when no context is configured
      return this.createDefaultAssessment(subject, dimension, context);
    }

    try {
      // Build the analysis prompt (now includes articles and predictors)
      const prompt = this.buildAnalysisPrompt(
        subject,
        dimension,
        dimensionContext,
        marketData,
        articles,
        predictors,
      );

      // Call LLM for analysis with timeout to avoid indefinite hang (e.g. Ollama not running)
      const timeoutMs = this.getDimensionTimeoutMs();
      const llmPromise = this.llmService.generateResponse(
        dimensionContext.system_prompt,
        prompt,
        {
          executionContext: context,
          callerType: 'api',
          callerName: 'dimension-analyzer',
        },
      );
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(
          () =>
            reject(
              new Error(
                `Dimension ${dimension.slug} LLM call timed out after ${timeoutMs / 1000}s. Check that Ollama is running and the model (${context.provider}/${context.model}) is loaded.`,
              ),
            ),
          timeoutMs,
        );
      });
      const response = await Promise.race([llmPromise, timeoutPromise]);

      // Parse the response - handle both string and LLMResponse
      const responseContent =
        typeof response === 'string' ? response : response.content;
      const analysis = this.parseAnalysisResponse(responseContent);

      // Extract usage info if available
      const responseMetadata =
        typeof response === 'object' ? response.metadata : undefined;
      const inputTokens = responseMetadata?.usage?.inputTokens;
      const outputTokens = responseMetadata?.usage?.outputTokens;

      return {
        subject_id: subject.id,
        dimension_id: dimension.id,
        dimension_context_id: dimensionContext.id,
        task_id: context.conversationId,
        score: analysis.score,
        confidence: analysis.confidence,
        reasoning: analysis.reasoning,
        evidence: analysis.evidence,
        signals: analysis.signals,
        analyst_response: {
          raw_response: responseContent,
          prompt_tokens: inputTokens,
          completion_tokens: outputTokens,
        },
        llm_provider: context.provider,
        llm_model: context.model,
      };
    } catch (error) {
      this.logger.error(
        `Failed to analyze dimension ${dimension.slug}: ${error instanceof Error ? error.message : String(error)}`,
      );
      // Return a failed assessment with error info
      return this.createErrorAssessment(subject, dimension, context, error);
    }
  }

  /**
   * Build the analysis prompt for the LLM
   * Now includes relevant articles and predictors for evidence-based analysis
   */
  private buildAnalysisPrompt(
    subject: RiskSubject,
    dimension: RiskDimension,
    dimensionContext: RiskDimensionContext,
    marketData?: Record<string, unknown>,
    articles?: RelevantArticle[],
    predictors?: PredictorForRisk[],
  ): string {
    let prompt = `Analyze the ${dimension.name} risk for ${subject.identifier}`;

    if (subject.name) {
      prompt += ` (${subject.name})`;
    }

    prompt += `.\n\nSubject Type: ${subject.subject_type}`;

    if (subject.metadata && Object.keys(subject.metadata).length > 0) {
      prompt += `\nSubject Metadata: ${JSON.stringify(subject.metadata, null, 2)}`;
    }

    if (marketData && Object.keys(marketData).length > 0) {
      prompt += `\n\nMarket Data:\n${JSON.stringify(marketData, null, 2)}`;
    }

    // Include relevant news articles if available
    if (articles && articles.length > 0) {
      prompt += `\n\n=== RELEVANT NEWS ARTICLES (${articles.length} articles) ===`;
      prompt += `\nThese articles were classified as relevant to ${dimension.name} risk for ${subject.identifier}.\n`;

      for (const article of articles.slice(0, 10)) {
        prompt += `\n--- Article ---`;
        prompt += `\nTitle: ${article.title}`;
        prompt += `\nPublished: ${article.publishedAt}`;
        prompt += `\nSentiment: ${article.sentimentLabel} (${article.sentiment.toFixed(2)})`;
        if (article.riskIndicators && article.riskIndicators.length > 0) {
          const indicators = article.riskIndicators
            .map((r) => `${r.type}: ${r.keywords.join(', ')}`)
            .join('; ');
          prompt += `\nRisk Indicators: ${indicators}`;
        }
        // Include truncated content for context
        const contentPreview = article.content?.slice(0, 500) || 'No content';
        prompt += `\nContent Preview: ${contentPreview}${article.content && article.content.length > 500 ? '...' : ''}`;
        prompt += `\nSource: ${article.url}`;
      }

      prompt += `\n\n=== END OF ARTICLES ===\n`;
      prompt += `\nUse these articles as evidence for your risk assessment. Reference specific articles in your reasoning and evidence.`;
    }

    // Include predictors from the prediction system if available
    if (predictors && predictors.length > 0) {
      prompt += `\n\n=== ANALYST PREDICTIONS (${predictors.length} predictors) ===`;
      prompt += `\nThese are pre-analyzed predictions from our analyst ensemble for ${subject.identifier}.\n`;

      for (const predictor of predictors.slice(0, 10)) {
        prompt += `\n--- Predictor ---`;
        prompt += `\nDirection: ${predictor.direction.toUpperCase()}`;
        prompt += `\nStrength: ${predictor.strength}`;
        prompt += `\nConfidence: ${(predictor.confidence * 100).toFixed(0)}%`;
        prompt += `\nAnalyst: ${predictor.analyst_slug}`;
        prompt += `\nReasoning: ${predictor.reasoning}`;
        if (predictor.analyst_assessment) {
          const assessment = predictor.analyst_assessment;
          if (assessment.key_factors && assessment.key_factors.length > 0) {
            prompt += `\nKey Factors: ${assessment.key_factors.join(', ')}`;
          }
          if (assessment.risks && assessment.risks.length > 0) {
            prompt += `\nIdentified Risks: ${assessment.risks.join(', ')}`;
          }
        }
        if (predictor.article_title) {
          prompt += `\nSource Article: ${predictor.article_title}`;
        }
        prompt += `\nCreated: ${predictor.created_at}`;
      }

      prompt += `\n\n=== END OF PREDICTORS ===\n`;
      prompt += `\nIncorporate these analyst predictions into your risk assessment. Consider the direction and confidence of each predictor.`;
    }

    prompt += `\n\nProvide your analysis in the following JSON format:
{
  "score": <0-100 risk score where 0=no risk, 100=maximum risk>,
  "confidence": <0.0-1.0 confidence in your assessment>,
  "reasoning": "<detailed explanation of your assessment>",
  "evidence": ["<list of specific evidence points>"],
  "signals": [
    {
      "name": "<signal name>",
      "value": "<observed value>",
      "impact": "<positive|negative|neutral>",
      "weight": <0.0-1.0 importance>
    }
  ]
}`;

    // Add examples if available
    if (dimensionContext.examples && dimensionContext.examples.length > 0) {
      prompt += '\n\nExamples of expected output:';
      for (const example of dimensionContext.examples.slice(0, 2)) {
        prompt += `\n\nInput: ${JSON.stringify(example.input)}`;
        prompt += `\nOutput: ${JSON.stringify(example.output)}`;
      }
    }

    return prompt;
  }

  /**
   * Parse the LLM response into structured analysis
   */
  private parseAnalysisResponse(content: string): DimensionAnalysisOutput {
    try {
      // Strip markdown code blocks if present (LLM often wraps JSON in ```json ... ```)
      let cleanContent = content.trim();
      if (cleanContent.startsWith('```')) {
        // Remove opening code fence (```json or ```)
        cleanContent = cleanContent.replace(/^```(?:json)?\s*\n?/, '');
        // Remove closing code fence
        cleanContent = cleanContent.replace(/\n?```\s*$/, '');
      }

      const parsed = JSON.parse(cleanContent) as Record<string, unknown>;
      const parsedScore = typeof parsed.score === 'number' ? parsed.score : 50;
      const parsedConfidence =
        typeof parsed.confidence === 'number' ? parsed.confidence : 0.5;
      const parsedReasoning =
        typeof parsed.reasoning === 'string'
          ? parsed.reasoning
          : 'No reasoning provided';
      const parsedEvidence = Array.isArray(parsed.evidence)
        ? (parsed.evidence as string[])
        : [];
      const parsedSignals = Array.isArray(parsed.signals)
        ? (parsed.signals as unknown[]).map((s) => this.normalizeSignal(s))
        : [];

      return {
        score: this.clampScore(parsedScore),
        confidence: this.clampConfidence(parsedConfidence),
        reasoning: parsedReasoning,
        evidence: parsedEvidence,
        signals: parsedSignals,
      };
    } catch {
      this.logger.warn(
        `Failed to parse LLM response as JSON: ${content.slice(0, 100)}...`,
      );
      // Extract what we can from the response
      return {
        score: 50,
        confidence: 0.3,
        reasoning: content.slice(0, 500),
        evidence: [],
        signals: [],
      };
    }
  }

  /**
   * Normalize a signal from the LLM response
   */
  private normalizeSignal(signal: unknown): AssessmentSignal {
    if (typeof signal !== 'object' || signal === null) {
      return {
        name: 'unknown',
        value: signal,
        impact: 'neutral',
        weight: 0.5,
      };
    }

    const s = signal as Record<string, unknown>;
    const signalName =
      typeof s.name === 'string'
        ? s.name
        : s.name != null
          ? 'unknown'
          : 'unknown';
    const signalImpact = String(s.impact);
    return {
      name: signalName,
      value: s.value,
      impact: ['positive', 'negative', 'neutral'].includes(signalImpact)
        ? (signalImpact as 'positive' | 'negative' | 'neutral')
        : 'neutral',
      weight:
        typeof s.weight === 'number' ? Math.max(0, Math.min(1, s.weight)) : 0.5,
    };
  }

  /**
   * Create a default assessment when no dimension context is configured
   */
  private createDefaultAssessment(
    subject: RiskSubject,
    dimension: RiskDimension,
    context: ExecutionContext,
  ): CreateRiskAssessmentData {
    return {
      subject_id: subject.id,
      dimension_id: dimension.id,
      task_id: context.conversationId,
      score: 50, // Neutral score
      confidence: 0.1, // Low confidence
      reasoning: `No analysis context configured for ${dimension.name}. Using default neutral score.`,
      evidence: [],
      signals: [],
    };
  }

  /**
   * Create an error assessment when analysis fails
   */
  private createErrorAssessment(
    subject: RiskSubject,
    dimension: RiskDimension,
    context: ExecutionContext,
    error: unknown,
  ): CreateRiskAssessmentData {
    return {
      subject_id: subject.id,
      dimension_id: dimension.id,
      task_id: context.conversationId,
      score: 50, // Neutral score on error
      confidence: 0,
      reasoning: `Analysis failed: ${error instanceof Error ? error.message : String(error)}`,
      evidence: [],
      signals: [],
      analyst_response: {
        raw_response: String(error),
      },
    };
  }

  private clampScore(score: number): number {
    return Math.max(0, Math.min(100, Math.round(score)));
  }

  private clampConfidence(confidence: number): number {
    return Math.max(0, Math.min(1, Number(confidence.toFixed(2))));
  }
}
