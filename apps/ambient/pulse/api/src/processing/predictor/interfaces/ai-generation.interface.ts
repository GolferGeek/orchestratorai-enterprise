/**
 * AI Generation Interfaces
 *
 * Interfaces for AI-powered test article generation (Phase 4.1)
 * Part of the Test-Based Learning Loop PRD
 */

/**
 * Request to generate test articles using AI
 */
export interface TestArticleGenerationRequest {
  /** Target symbols - MUST be T_ prefixed (INV-08 compliance) */
  target_symbols: string[];

  /** Type of scenario to generate */
  scenario_type:
    | 'earnings_beat'
    | 'earnings_miss'
    | 'scandal'
    | 'regulatory'
    | 'acquisition'
    | 'macro_shock'
    | 'technical'
    | 'custom';

  /** Sentiment direction for the article */
  sentiment: 'bullish' | 'bearish' | 'neutral' | 'mixed';

  /** Strength of the sentiment signal */
  strength: 'strong' | 'moderate' | 'weak';

  /** Custom prompt for 'custom' scenario_type */
  custom_prompt?: string;

  /** Include recent price context in prompt (if available) */
  include_price_context?: boolean;

  /** Number of articles to generate (default: 1) */
  article_count?: number;
}

/**
 * Result of AI article generation
 */
export interface TestArticleGenerationResult {
  /** Whether generation was successful */
  success: boolean;

  /** Generated articles */
  articles: GeneratedArticle[];

  /** Metadata about the generation process */
  generation_metadata: {
    /** Model used for generation */
    model_used: string;

    /** Number of tokens consumed */
    tokens_used: number;

    /** Time taken to generate (milliseconds) */
    generation_time_ms: number;
  };

  /** Errors encountered during generation */
  errors?: string[];
}

/**
 * A single generated article from AI
 */
export interface GeneratedArticle {
  /** Article title */
  title: string;

  /** Article content (body text) */
  content: string;

  /** Optional summary/abstract */
  summary?: string;

  /** Target symbols referenced (T_ prefixed) */
  target_symbols: string[];

  /** Intended sentiment for testing */
  intended_sentiment: string;

  /** Intended signal strength for testing */
  intended_strength: string;

  /** Simulated publication timestamp */
  simulated_published_at: string;

  /** Simulated news source name */
  simulated_source_name: string;
}

/**
 * Options for scenario generation
 */
export interface ScenarioGenerationOptions {
  /** Include variations on the base scenario */
  includeVariations?: boolean;

  /** Number of variations to generate */
  variationCount?: number;

  /** Number of articles to generate for the scenario */
  articleCount?: number;

  /** Additional context for the scenario */
  additionalContext?: string;
}

/**
 * Generated scenario result
 */
export interface GeneratedScenario {
  /** The created test scenario */
  scenario: {
    id: string;
    name: string;
    description: string | null;
    target_id: string | null;
    organization_slug: string;
    config: Record<string, unknown>;
    status: string;
  };

  /** Generated test articles */
  articles: Array<{
    id: string;
    title: string;
    content: string;
    target_symbols: string[];
    sentiment_expected: string | null;
  }>;

  /** Generated test price data */
  priceData: Array<{
    id: string;
    symbol: string;
    price_timestamp: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }>;

  /** Source type that triggered scenario generation */
  sourceType: 'missed_opportunity' | 'learning' | 'evaluation';

  /** ID of the source entity */
  sourceId: string;

  /** Real target symbol (production symbol) */
  realTargetSymbol: string;

  /** Test target symbol (T_ prefixed) */
  testTargetSymbol: string;

  /** Generation metadata */
  metadata: {
    generationTimeMs: number;
    articlesGenerated: number;
    pricePointsGenerated: number;
  };
}

/**
 * Types of variations for scenario generation (Phase 4.4)
 */
export type VariationType =
  | 'timing_shift' // Shift timestamps forward/backward
  | 'sentiment_weaker' // Reduce sentiment strength
  | 'sentiment_stronger' // Increase sentiment strength
  | 'conflicting_signal' // Add opposing article
  | 'language_ambiguity' // Add hedged/uncertain language
  | 'negation' // "not as bad", "better than expected loss"
  | 'multi_article' // Add multiple articles in sequence
  | 'delayed_outcome'; // Extend time between signal and outcome

/**
 * Request to generate variations of an existing scenario
 */
export interface ScenarioVariationRequest {
  /** ID of the source scenario to create variations from */
  sourceScenarioId: string;

  /** Types of variations to generate */
  variationTypes: VariationType[];

  /** Number of variations to generate per type (default: 1) */
  variationsPerType?: number;
}

/**
 * A single scenario variation
 */
export interface ScenarioVariation {
  /** ID of the parent scenario */
  parentScenarioId: string;

  /** Type of variation */
  variationType: VariationType;

  /** Human-readable name for the variation */
  variationName: string;

  /** Configuration specific to this variation type */
  variationConfig: Record<string, unknown>;

  /** The created scenario */
  scenario: {
    id: string;
    name: string;
    description: string | null;
    target_id: string | null;
    organization_slug: string;
    config: Record<string, unknown>;
    status: string;
  };

  /** Test articles for this variation */
  articles: Array<{
    id: string;
    title: string;
    content: string;
    target_symbols: string[];
    sentiment_expected: string | null;
  }>;

  /** Test price data for this variation */
  priceData: Array<{
    id: string;
    symbol: string;
    price_timestamp: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }>;
}

/**
 * Result of scenario variation generation
 */
export interface ScenarioVariationResult {
  /** Whether the operation was successful */
  success: boolean;

  /** The source scenario that was varied */
  sourceScenario: {
    id: string;
    name: string;
    description: string | null;
    target_id: string | null;
    organization_slug: string;
    config: Record<string, unknown>;
    status: string;
  };

  /** All generated variations */
  variations: ScenarioVariation[];

  /** Any errors encountered during generation */
  errors?: string[];
}
