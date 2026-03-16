import { Injectable, Logger } from '@nestjs/common';
import {
  MockSignalConfig,
  MockPredictionConfig,
  MockArticleConfig,
  MockArticle,
  MockPredictionWithOutcome,
  MockPredictionData,
} from '../interfaces/test-data.interface';
import {
  CreateSignalData,
  SignalDirection,
} from '../interfaces/signal.interface';

/**
 * Service for generating mock test data
 * Part of the Test Data Injection Framework (Phase 3)
 *
 * Generates realistic mock data for testing the prediction pipeline:
 * - Mock news articles
 * - Mock signals with known characteristics
 * - Mock predictions with known outcomes
 */
@Injectable()
export class TestDataGeneratorService {
  private readonly logger = new Logger(TestDataGeneratorService.name);

  // Sample headlines for different sentiments
  private readonly bullishHeadlines = [
    '${topic} Stock Surges on Earnings Beat',
    '${topic} Reports Record Revenue Growth',
    'Analysts Upgrade ${topic} After Strong Quarter',
    '${topic} Announces Major Partnership Deal',
    '${topic} Beats Expectations, Raises Guidance',
    'Institutional Investors Increase ${topic} Holdings',
    '${topic} CEO Signals Bullish Outlook for 2026',
    '${topic} Market Cap Reaches All-Time High',
    'Strong Demand Drives ${topic} Stock Higher',
    '${topic} Expands Into New Markets',
  ];

  private readonly bearishHeadlines = [
    '${topic} Stock Drops on Weak Guidance',
    '${topic} Reports Revenue Miss, Shares Fall',
    'Analysts Downgrade ${topic} Amid Concerns',
    '${topic} Faces Regulatory Challenges',
    '${topic} Misses Earnings Expectations',
    'Investors Flee ${topic} After Warning Signs',
    '${topic} CEO Expresses Caution on Outlook',
    '${topic} Loses Market Share to Competitors',
    'Supply Chain Issues Impact ${topic} Operations',
    '${topic} Announces Layoffs, Restructuring',
  ];

  private readonly neutralHeadlines = [
    '${topic} Reports Earnings In Line With Expectations',
    '${topic} Maintains Steady Growth Trajectory',
    'Mixed Signals for ${topic} Stock This Quarter',
    '${topic} Navigates Market Uncertainty',
    '${topic} Holds Ground Amid Volatility',
    'Analysts Split on ${topic} Outlook',
    '${topic} Announces Strategic Review',
    '${topic} Trading Sideways After Announcement',
    'Market Awaits ${topic} Guidance Update',
    '${topic} Results Meet Analyst Consensus',
  ];

  // Sample content templates
  private readonly contentTemplates = [
    "${topic} reported ${metric} for the quarter, ${sentiment} analyst expectations. The company's ${segment} division showed ${performance} growth, while ${other_segment} remained stable. Management indicated that ${outlook} for the coming quarters.",
    'Shares of ${topic} moved ${movement} following the announcement of ${event}. Market analysts note that ${analysis}. The broader sector has been ${sector_trend}, with ${topic} ${comparison} among peers.',
    "In a statement, ${topic}'s leadership highlighted ${achievement}. The company's ${initiative} is expected to ${impact}. Investors responded ${reaction} to the news, with trading volume ${volume_trend} average levels.",
  ];

  /**
   * Generate mock news articles for testing
   */
  generateMockArticles(config: MockArticleConfig): MockArticle[] {
    const articles: MockArticle[] = [];
    const sentiment = config.sentiment ?? 'mixed';

    for (let i = 0; i < config.count; i++) {
      const articleSentiment: 'bullish' | 'bearish' | 'neutral' =
        sentiment === 'mixed'
          ? this.randomElement(['bullish', 'bearish', 'neutral'] as const)
          : sentiment;

      const headline = this.generateHeadline(config.topic, articleSentiment);
      const content = this.generateContent(config.topic, articleSentiment);

      articles.push({
        title: headline,
        content,
        url: `https://test-news.example.com/article/${Date.now()}-${i}`,
        published_at: new Date(
          Date.now() - Math.random() * 3600000,
        ).toISOString(),
        author: this.randomElement([
          'John Smith',
          'Jane Doe',
          'Alex Johnson',
          'Morgan Chen',
        ]),
        source_name:
          config.source_type === 'rss' ? 'Test RSS Feed' : 'Test News Site',
      });
    }

    return articles;
  }

  /**
   * Generate mock signals with known characteristics
   */
  generateMockSignals(config: MockSignalConfig): CreateSignalData[] {
    const signals: CreateSignalData[] = [];
    const distribution = config.distribution ?? {
      bullish: 0.4,
      bearish: 0.4,
      neutral: 0.2,
    };

    // Normalize distribution
    const total =
      distribution.bullish + distribution.bearish + distribution.neutral;
    const bullishCount = Math.round(
      (distribution.bullish / total) * config.count,
    );
    const bearishCount = Math.round(
      (distribution.bearish / total) * config.count,
    );
    const neutralCount = config.count - bullishCount - bearishCount;

    // Generate signals by direction
    const directions: SignalDirection[] = [
      ...Array<SignalDirection>(bullishCount).fill('bullish'),
      ...Array<SignalDirection>(bearishCount).fill('bearish'),
      ...Array<SignalDirection>(neutralCount).fill('neutral'),
    ];

    // Shuffle directions
    this.shuffle(directions);

    for (let i = 0; i < config.count; i++) {
      const direction = directions[i] ?? 'neutral';
      const topic = config.topic ?? 'Test Asset';
      const headline = this.generateHeadline(topic, direction);

      signals.push({
        target_id: config.target_id,
        source_id: config.source_id,
        content: headline,
        direction: direction,
        detected_at: new Date(
          Date.now() - Math.random() * 7200000,
        ).toISOString(),
        url: `https://test-source.example.com/signal/${Date.now()}-${i}`,
        metadata: {
          test_data: true,
          generated_at: new Date().toISOString(),
          topic,
        },
      });
    }

    return signals;
  }

  /**
   * Generate mock predictions with known outcomes for evaluation testing
   */
  generateMockPredictionsWithOutcomes(
    config: MockPredictionConfig,
  ): MockPredictionWithOutcome[] {
    const results: MockPredictionWithOutcome[] = [];
    const distribution = config.distribution ?? {
      up: 0.4,
      down: 0.4,
      flat: 0.2,
    };

    // Normalize distribution
    const total = distribution.up + distribution.down + distribution.flat;
    const upCount = Math.round((distribution.up / total) * config.count);
    const downCount = Math.round((distribution.down / total) * config.count);
    const flatCount = config.count - upCount - downCount;

    // Generate directions
    type PredictionDirection = 'up' | 'down' | 'flat';
    const directions: PredictionDirection[] = [
      ...Array<PredictionDirection>(upCount).fill('up'),
      ...Array<PredictionDirection>(downCount).fill('down'),
      ...Array<PredictionDirection>(flatCount).fill('flat'),
    ];

    this.shuffle(directions);

    // Calculate how many should be correct based on accuracy rate
    const correctCount = Math.round(config.count * config.accuracy_rate);
    const correctIndices = new Set<number>();

    while (correctIndices.size < correctCount) {
      correctIndices.add(Math.floor(Math.random() * config.count));
    }

    for (let i = 0; i < config.count; i++) {
      const predictedDirection = directions[i] ?? 'flat';
      const isCorrect = correctIndices.has(i);

      // Determine actual direction based on whether prediction should be correct
      let actualDirection: 'up' | 'down' | 'flat';
      if (isCorrect) {
        actualDirection = predictedDirection;
      } else {
        // Pick a different direction
        const otherDirections = (['up', 'down', 'flat'] as const).filter(
          (d) => d !== predictedDirection,
        );
        actualDirection = this.randomElement(otherDirections);
      }

      const basePrice = 100 + Math.random() * 100;
      const priceChange =
        (actualDirection === 'up' ? 1 : actualDirection === 'down' ? -1 : 0) *
        (0.02 + Math.random() * 0.05);

      const prediction: MockPredictionData = {
        target_id: config.target_id,
        direction: predictedDirection,
        confidence: 0.6 + Math.random() * 0.35,
        magnitude: this.randomElement(['small', 'medium', 'large'] as const),
        reasoning: `Test prediction: ${predictedDirection} with ${isCorrect ? 'correct' : 'incorrect'} outcome`,
        timeframe_hours: this.randomElement([1, 4, 12, 24] as const),
        entry_price: basePrice,
        target_price: basePrice * (1 + priceChange),
        stop_loss: basePrice * (1 - Math.abs(priceChange)),
      };

      results.push({
        prediction,
        outcome: isCorrect ? 'correct' : 'incorrect',
        actual_direction: actualDirection,
      });
    }

    return results;
  }

  /**
   * Generate a headline for the given topic and sentiment
   */
  private generateHeadline(
    topic: string,
    sentiment: 'bullish' | 'bearish' | 'neutral',
  ): string {
    let templates: string[];
    switch (sentiment) {
      case 'bullish':
        templates = this.bullishHeadlines;
        break;
      case 'bearish':
        templates = this.bearishHeadlines;
        break;
      default:
        templates = this.neutralHeadlines;
    }

    const template = this.randomElement(templates);
    return template.replace(/\$\{topic\}/g, topic);
  }

  /**
   * Generate content for the given topic and sentiment
   */
  private generateContent(
    topic: string,
    sentiment: 'bullish' | 'bearish' | 'neutral',
  ): string {
    const template = this.randomElement(this.contentTemplates);

    const metrics = {
      bullish: [
        'strong revenue growth',
        'record earnings',
        'better-than-expected results',
      ],
      bearish: [
        'disappointing results',
        'lower-than-expected revenue',
        'missed targets',
      ],
      neutral: ['in-line results', 'steady performance', 'expected figures'],
    };

    const sentiments = {
      bullish: ['beating', 'exceeding', 'surpassing'],
      bearish: ['missing', 'falling short of', 'disappointing'],
      neutral: ['meeting', 'matching', 'in line with'],
    };

    const performances = {
      bullish: ['strong', 'impressive', 'robust'],
      bearish: ['weak', 'disappointing', 'sluggish'],
      neutral: ['steady', 'moderate', 'stable'],
    };

    const outlooks = {
      bullish: [
        'continued growth is expected',
        'optimistic guidance was provided',
        'expansion plans are accelerating',
      ],
      bearish: [
        'challenges may persist',
        'caution is warranted',
        'headwinds are expected',
      ],
      neutral: [
        'stability is anticipated',
        'market conditions remain uncertain',
        'measured progress is expected',
      ],
    };

    return template
      .replace(/\$\{topic\}/g, topic)
      .replace(/\$\{metric\}/g, this.randomElement(metrics[sentiment]))
      .replace(/\$\{sentiment\}/g, this.randomElement(sentiments[sentiment]))
      .replace(
        /\$\{performance\}/g,
        this.randomElement(performances[sentiment]),
      )
      .replace(
        /\$\{segment\}/g,
        this.randomElement(['cloud', 'hardware', 'services', 'core']),
      )
      .replace(
        /\$\{other_segment\}/g,
        this.randomElement(['enterprise', 'consumer', 'international']),
      )
      .replace(/\$\{outlook\}/g, this.randomElement(outlooks[sentiment]))
      .replace(
        /\$\{movement\}/g,
        sentiment === 'bullish'
          ? 'higher'
          : sentiment === 'bearish'
            ? 'lower'
            : 'sideways',
      )
      .replace(
        /\$\{event\}/g,
        this.randomElement([
          'Q4 earnings',
          'product launch',
          'strategic update',
          'market report',
        ]),
      )
      .replace(
        /\$\{analysis\}/g,
        this.randomElement([
          'technicals suggest',
          'fundamentals indicate',
          'momentum shows',
        ]),
      )
      .replace(
        /\$\{sector_trend\}/g,
        this.randomElement(['volatile', 'recovering', 'consolidating']),
      )
      .replace(
        /\$\{comparison\}/g,
        this.randomElement([
          'outperforming',
          'underperforming',
          'trading in line with',
        ]),
      )
      .replace(
        /\$\{achievement\}/g,
        this.randomElement([
          'strong execution',
          'market expansion',
          'operational efficiency',
        ]),
      )
      .replace(
        /\$\{initiative\}/g,
        this.randomElement([
          'growth strategy',
          'cost reduction program',
          'digital transformation',
        ]),
      )
      .replace(
        /\$\{impact\}/g,
        this.randomElement([
          'drive margins',
          'accelerate growth',
          'improve profitability',
        ]),
      )
      .replace(
        /\$\{reaction\}/g,
        sentiment === 'bullish'
          ? 'positively'
          : sentiment === 'bearish'
            ? 'negatively'
            : 'cautiously',
      )
      .replace(
        /\$\{volume_trend\}/g,
        this.randomElement(['above', 'below', 'near']),
      );
  }

  /**
   * Pick a random element from an array
   */
  private randomElement<T>(arr: readonly T[]): T {
    return arr[Math.floor(Math.random() * arr.length)] as T;
  }

  /**
   * Shuffle an array in place (Fisher-Yates)
   */
  private shuffle<T>(arr: T[]): void {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const temp = arr[i] as T;
      arr[i] = arr[j] as T;
      arr[j] = temp;
    }
  }
}
