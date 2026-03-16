/**
 * AI Article Generator Service
 *
 * Generates synthetic test articles using LLM (Phase 4.1)
 * Part of the Test-Based Learning Loop PRD
 *
 * Responsibilities:
 * - Generate realistic test articles based on scenario parameters
 * - Enforce INV-08 compliance (T_ prefix for all target symbols)
 * - Add synthetic markers to all generated content
 * - Parse and structure LLM responses
 * - Validate generated articles
 */

import { Injectable, Inject, Logger } from '@nestjs/common';
import { ExecutionContext } from '@orchestrator-ai/transport-types';
import { LLM_SERVICE, LLMServiceProvider } from '@/planes/llm/llm.interface';
import {
  TestArticleGenerationRequest,
  TestArticleGenerationResult,
  GeneratedArticle,
} from '../interfaces/ai-generation.interface';

const SYNTHETIC_MARKER = '[SYNTHETIC TEST ARTICLE]';

@Injectable()
export class AiArticleGeneratorService {
  private readonly logger = new Logger(AiArticleGeneratorService.name);

  constructor(
    @Inject(LLM_SERVICE) private readonly llmService: LLMServiceProvider,
  ) {}

  /**
   * Generate test articles using AI
   *
   * @param request - Generation request parameters
   * @param ctx - Execution context for LLM calls
   * @returns Generation result with articles and metadata
   */
  async generateArticles(
    request: TestArticleGenerationRequest,
    ctx: ExecutionContext,
  ): Promise<TestArticleGenerationResult> {
    const startTime = Date.now();

    try {
      // Validate request
      const validationErrors = this.validateRequest(request);
      if (validationErrors.length > 0) {
        return {
          success: false,
          articles: [],
          generation_metadata: {
            model_used: ctx.model || 'unknown',
            tokens_used: 0,
            generation_time_ms: Date.now() - startTime,
          },
          errors: validationErrors,
        };
      }

      // Build the prompt
      const systemPrompt = this.buildSystemPrompt();
      const userPrompt = this.buildUserPrompt(request);

      this.logger.log(
        `Generating ${request.article_count || 1} articles for scenario: ${request.scenario_type}`,
      );
      this.logger.debug(`Target symbols: ${request.target_symbols.join(', ')}`);

      // Call LLM
      const llmResponse = await this.llmService.generateResponse(
        systemPrompt,
        userPrompt,
        {
          executionContext: ctx,
          callerType: 'api',
          callerName: 'ai-article-generator',
          temperature: 0.8, // Higher temperature for creative article generation
          max_tokens: 4000,
        },
      );

      const responseText =
        typeof llmResponse === 'string' ? llmResponse : llmResponse.content;

      // Parse the LLM response
      const articles = this.parseArticlesFromResponse(
        responseText,
        request,
        ctx.model || 'unknown',
      );

      // Validate all articles
      const articleErrors: string[] = [];
      for (let i = 0; i < articles.length; i++) {
        const article = articles[i];
        if (!article) continue;

        const errors = this.validateGeneratedArticle(article);
        if (errors.length > 0) {
          articleErrors.push(`Article ${i + 1}: ${errors.join(', ')}`);
        }
      }

      const generationTime = Date.now() - startTime;

      // Extract token usage if available
      let tokensUsed = 0;
      if (typeof llmResponse !== 'string' && llmResponse.metadata?.usage) {
        tokensUsed = llmResponse.metadata.usage.totalTokens || 0;
      }

      this.logger.log(
        `Generated ${articles.length} articles in ${generationTime}ms (${tokensUsed} tokens)`,
      );

      return {
        success: articleErrors.length === 0,
        articles,
        generation_metadata: {
          model_used: ctx.model || 'unknown',
          tokens_used: tokensUsed,
          generation_time_ms: generationTime,
        },
        errors: articleErrors.length > 0 ? articleErrors : undefined,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to generate articles: ${errorMessage}`);

      return {
        success: false,
        articles: [],
        generation_metadata: {
          model_used: ctx.model || 'unknown',
          tokens_used: 0,
          generation_time_ms: Date.now() - startTime,
        },
        errors: [errorMessage],
      };
    }
  }

  /**
   * Validate the generation request
   */
  private validateRequest(request: TestArticleGenerationRequest): string[] {
    const errors: string[] = [];

    // Validate target_symbols
    if (!request.target_symbols || request.target_symbols.length === 0) {
      errors.push('At least one target symbol is required');
    } else {
      // INV-08: All target symbols must start with T_
      for (const symbol of request.target_symbols) {
        if (!symbol.startsWith('T_')) {
          errors.push(
            `Target symbol "${symbol}" must start with T_ prefix (INV-08)`,
          );
        }
      }
    }

    // Validate scenario_type
    const validScenarioTypes = [
      'earnings_beat',
      'earnings_miss',
      'scandal',
      'regulatory',
      'acquisition',
      'macro_shock',
      'technical',
      'custom',
    ];
    if (!validScenarioTypes.includes(request.scenario_type)) {
      errors.push(
        `Invalid scenario_type: ${request.scenario_type}. Must be one of: ${validScenarioTypes.join(', ')}`,
      );
    }

    // Validate custom_prompt if scenario_type is custom
    if (
      request.scenario_type === 'custom' &&
      (!request.custom_prompt || request.custom_prompt.trim().length === 0)
    ) {
      errors.push('custom_prompt is required when scenario_type is "custom"');
    }

    // Validate sentiment
    const validSentiments = ['bullish', 'bearish', 'neutral', 'mixed'];
    if (!validSentiments.includes(request.sentiment)) {
      errors.push(
        `Invalid sentiment: ${request.sentiment}. Must be one of: ${validSentiments.join(', ')}`,
      );
    }

    // Validate strength
    const validStrengths = ['strong', 'moderate', 'weak'];
    if (!validStrengths.includes(request.strength)) {
      errors.push(
        `Invalid strength: ${request.strength}. Must be one of: ${validStrengths.join(', ')}`,
      );
    }

    // Validate article_count
    if (
      request.article_count !== undefined &&
      (request.article_count < 1 || request.article_count > 10)
    ) {
      errors.push('article_count must be between 1 and 10');
    }

    return errors;
  }

  /**
   * Build the system prompt for article generation
   */
  private buildSystemPrompt(): string {
    return `You are a financial news article generator for testing purposes. Your task is to generate realistic, synthetic financial news articles based on given parameters.

CRITICAL REQUIREMENTS:
1. All articles are SYNTHETIC TEST CONTENT - clearly mark them as such
2. All ticker symbols in the request will have a T_ prefix (e.g., T_AAPL, T_MSFT)
3. Use these T_ prefixed symbols in the article content
4. Generate realistic but clearly synthetic financial news content
5. Include appropriate financial terminology and market context
6. Return articles in valid JSON format

OUTPUT FORMAT:
Return a JSON array of articles with this structure:
{
  "articles": [
    {
      "title": "Article headline here",
      "content": "Full article body text here. Include ${SYNTHETIC_MARKER} marker in the content.",
      "summary": "Brief 1-2 sentence summary",
      "simulated_published_at": "ISO 8601 timestamp",
      "simulated_source_name": "Name of simulated news source"
    }
  ]
}

IMPORTANT:
- Keep titles concise and newsworthy (10-15 words)
- Make content realistic but clearly marked as synthetic (300-600 words)
- Include ${SYNTHETIC_MARKER} marker at the start of the content
- Use the T_ prefixed symbols from the request
- Create appropriate timestamps (within last 24 hours)
- Use realistic news source names (e.g., "Test Financial Times", "Synthetic Bloomberg")`;
  }

  /**
   * Build the user prompt based on request parameters
   */
  private buildUserPrompt(request: TestArticleGenerationRequest): string {
    const articleCount = request.article_count || 1;
    const symbols = request.target_symbols.join(', ');

    let scenarioDescription = '';
    switch (request.scenario_type) {
      case 'earnings_beat':
        scenarioDescription =
          'The company exceeded earnings expectations, reporting strong revenue growth and profitability.';
        break;
      case 'earnings_miss':
        scenarioDescription =
          'The company missed earnings expectations, falling short on revenue and profit targets.';
        break;
      case 'scandal':
        scenarioDescription =
          'The company is facing a corporate scandal or ethical controversy.';
        break;
      case 'regulatory':
        scenarioDescription =
          'The company is facing regulatory challenges, investigations, or new compliance requirements.';
        break;
      case 'acquisition':
        scenarioDescription =
          'The company announced a major acquisition or merger deal.';
        break;
      case 'macro_shock':
        scenarioDescription =
          'A macroeconomic event (e.g., interest rate change, geopolitical event) is affecting the market.';
        break;
      case 'technical':
        scenarioDescription =
          'The stock is experiencing a technical breakout or breakdown in its price action.';
        break;
      case 'custom':
        scenarioDescription = request.custom_prompt || 'Custom scenario';
        break;
    }

    const sentimentDescription =
      request.sentiment === 'bullish'
        ? 'positive/bullish (should make investors optimistic)'
        : request.sentiment === 'bearish'
          ? 'negative/bearish (should make investors concerned)'
          : request.sentiment === 'mixed'
            ? 'mixed (both positive and negative elements)'
            : 'neutral (balanced, no strong directional bias)';

    const strengthDescription =
      request.strength === 'strong'
        ? 'strong, clear, and unambiguous'
        : request.strength === 'moderate'
          ? 'moderate, noticeable but not extreme'
          : 'weak, subtle, and may be easily missed';

    return `Generate ${articleCount} synthetic test financial news article${articleCount > 1 ? 's' : ''} with these parameters:

TARGET SYMBOLS: ${symbols}
SCENARIO: ${scenarioDescription}
SENTIMENT: ${sentimentDescription}
STRENGTH: ${strengthDescription}

Requirements:
- Use the T_ prefixed symbols exactly as provided
- Make the sentiment ${sentimentDescription}
- Make the signal strength ${strengthDescription}
- Include ${SYNTHETIC_MARKER} at the start of the content
- Return valid JSON matching the format specified in the system prompt
- Each article should be unique and realistic
- Include appropriate financial terminology and market context

Generate the article${articleCount > 1 ? 's' : ''} now.`;
  }

  /**
   * Parse articles from LLM response
   */
  private parseArticlesFromResponse(
    responseText: string,
    request: TestArticleGenerationRequest,
    _modelUsed: string,
  ): GeneratedArticle[] {
    try {
      // Try to extract JSON from the response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        this.logger.error('No JSON found in LLM response');
        return [];
      }

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const parsed = JSON.parse(jsonMatch[0]);

      // Handle both direct array and { articles: [...] } format
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const articlesArray: unknown[] = Array.isArray(parsed)
        ? parsed
        : // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          parsed.articles || [];

      // Map to GeneratedArticle format
      return articlesArray.map((articleData: unknown) => {
        const article = articleData as {
          title?: string;
          content?: string;
          summary?: string;
          simulated_published_at?: string;
          simulated_source_name?: string;
        };

        // Ensure synthetic marker is present
        let content = article.content || '';
        if (!content.includes(SYNTHETIC_MARKER)) {
          content = `${SYNTHETIC_MARKER}\n\n${content}`;
        }

        return {
          title: article.title || 'Untitled Article',
          content,
          summary: article.summary,
          target_symbols: request.target_symbols,
          intended_sentiment: request.sentiment,
          intended_strength: request.strength,
          simulated_published_at:
            article.simulated_published_at || new Date().toISOString(),
          simulated_source_name:
            article.simulated_source_name || 'Test News Source',
        };
      });
    } catch (error) {
      this.logger.error(
        `Failed to parse articles from LLM response: ${error instanceof Error ? error.message : String(error)}`,
      );
      this.logger.debug(`Response text: ${responseText.substring(0, 500)}`);
      return [];
    }
  }

  /**
   * Validate a generated article
   */
  private validateGeneratedArticle(article: GeneratedArticle): string[] {
    const errors: string[] = [];

    if (!article.title || article.title.trim().length === 0) {
      errors.push('Title is required');
    }

    if (!article.content || article.content.trim().length === 0) {
      errors.push('Content is required');
    } else {
      // Check for synthetic marker
      if (!article.content.includes(SYNTHETIC_MARKER)) {
        errors.push(
          `Content must include synthetic marker: ${SYNTHETIC_MARKER}`,
        );
      }

      // Warn if content contains real entity names without T_ prefix
      const realSymbolPattern = /\b[A-Z]{2,5}\b/g;
      const matches = article.content.match(realSymbolPattern) || [];
      const realSymbols = matches.filter((s) => !s.startsWith('T_'));
      if (realSymbols.length > 0) {
        this.logger.warn(
          `Article content may contain real symbols without T_ prefix: ${realSymbols.join(', ')}`,
        );
      }
    }

    if (
      !article.target_symbols ||
      article.target_symbols.length === 0 ||
      !Array.isArray(article.target_symbols)
    ) {
      errors.push('target_symbols is required and must be an array');
    } else {
      // Validate all symbols have T_ prefix
      for (const symbol of article.target_symbols) {
        if (!symbol.startsWith('T_')) {
          errors.push(
            `Target symbol "${symbol}" must start with T_ prefix (INV-08)`,
          );
        }
      }
    }

    if (
      !article.simulated_published_at ||
      article.simulated_published_at.trim().length === 0
    ) {
      errors.push('simulated_published_at is required');
    }

    if (
      !article.simulated_source_name ||
      article.simulated_source_name.trim().length === 0
    ) {
      errors.push('simulated_source_name is required');
    }

    return errors;
  }
}
