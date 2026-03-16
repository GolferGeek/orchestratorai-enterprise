import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Target } from '../../interfaces/target.interface';
import type { MarketSnapshotValue } from './types';
import { ProviderThrottleService } from './provider-throttle.service';

@Injectable()
export class PolygonMarketDataService {
  private readonly logger = new Logger(PolygonMarketDataService.name);

  constructor(
    private readonly throttle: ProviderThrottleService,
    private readonly configService: ConfigService,
  ) {}

  async fetchStockPrice(target: Target): Promise<MarketSnapshotValue | null> {
    const apiKey = this.configService.get<string>('POLYGON_API_KEY');
    if (!apiKey) {
      this.logger.warn('POLYGON_API_KEY not configured');
      return null;
    }

    try {
      const response = await this.throttle.fetchWithProviderThrottle(
        'polygon',
        `https://api.polygon.io/v2/aggs/ticker/${target.symbol}/prev?apiKey=${apiKey}`,
      );

      if (!response.ok) {
        this.logger.error(
          `Polygon API error: ${response.status} - ${response.statusText}`,
        );
        return null;
      }

      const data = (await response.json()) as {
        results?: Array<{
          c: number;
          h: number;
          l: number;
          o: number;
          v: number;
        }>;
      };
      const result = data.results?.[0];
      if (!result) {
        return null;
      }

      return {
        value: result.c,
        source: 'polygon',
        metadata: {
          price: result.c,
          high: result.h,
          low: result.l,
          open: result.o,
          close: result.c,
          volume: result.v,
        },
      };
    } catch (error) {
      this.logger.error(
        `Failed to fetch stock price: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      return null;
    }
  }
}
