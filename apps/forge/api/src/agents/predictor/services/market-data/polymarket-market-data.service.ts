import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Target } from '../../interfaces/target.interface';
import type { MarketSnapshotValue } from './types';
import { ProviderThrottleService } from './provider-throttle.service';

@Injectable()
export class PolymarketMarketDataService {
  private readonly logger = new Logger(PolymarketMarketDataService.name);

  constructor(
    private readonly throttle: ProviderThrottleService,
    private readonly configService: ConfigService,
  ) {}

  async fetchMarketProbability(
    target: Target,
  ): Promise<MarketSnapshotValue | null> {
    const apiKey = this.configService.get<string>('POLYMARKET_API_KEY');

    try {
      const marketId = target.symbol;
      const response = await this.throttle.fetchWithProviderThrottle(
        'polymarket',
        `https://clob.polymarket.com/markets/${marketId}`,
        {
          headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
        },
      );

      if (!response.ok) {
        this.logger.error(
          `Polymarket API error: ${response.status} - ${response.statusText}`,
        );
        return null;
      }

      const data = (await response.json()) as {
        outcomePrices?: number[];
        volume?: number;
        liquidity?: number;
      };

      return {
        value: data.outcomePrices?.[0] ?? 0.5,
        source: 'polymarket',
        metadata: {
          probability: data.outcomePrices?.[0] ?? 0.5,
          volume: data.volume ?? 0,
          liquidity: data.liquidity ?? 0,
        },
      };
    } catch (error) {
      this.logger.error(
        `Failed to fetch Polymarket price: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      return null;
    }
  }
}
