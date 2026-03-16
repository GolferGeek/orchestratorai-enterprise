import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Target } from '../../interfaces/target.interface';
import type { MarketSnapshotValue } from './types';
import { ProviderThrottleService } from './provider-throttle.service';

@Injectable()
export class CoinMarketCapMarketDataService {
  private readonly logger = new Logger(CoinMarketCapMarketDataService.name);

  constructor(
    private readonly throttle: ProviderThrottleService,
    private readonly configService: ConfigService,
  ) {}

  async fetchCryptoPrice(target: Target): Promise<MarketSnapshotValue | null> {
    const apiKey = this.configService.get<string>('COINMARKETCAP_API_KEY');
    if (!apiKey) {
      this.logger.warn('COINMARKETCAP_API_KEY not configured');
      return null;
    }

    try {
      const response = await this.throttle.fetchWithProviderThrottle(
        'coinmarketcap',
        `https://pro-api.coinmarketcap.com/v2/cryptocurrency/quotes/latest?symbol=${encodeURIComponent(target.symbol)}&convert=USD`,
        {
          headers: {
            'X-CMC_PRO_API_KEY': apiKey,
          },
        },
      );

      if (!response.ok) {
        this.logger.error(
          `CoinMarketCap API error: ${response.status} - ${response.statusText}`,
        );
        return null;
      }

      const data = (await response.json()) as {
        data?: Record<
          string,
          Array<{
            quote?: {
              USD?: {
                price?: number;
                market_cap?: number;
                volume_24h?: number;
                percent_change_24h?: number;
              };
            };
          }>
        >;
      };
      const usdQuote = data.data?.[target.symbol]?.[0]?.quote?.USD;
      if (!usdQuote?.price) {
        return null;
      }

      return {
        value: usdQuote.price,
        source: 'coinmarketcap',
        metadata: {
          price: usdQuote.price,
          market_cap: usdQuote.market_cap ?? 0,
          volume_24h: usdQuote.volume_24h ?? 0,
          change_24h: usdQuote.percent_change_24h ?? 0,
        },
      };
    } catch (error) {
      this.logger.error(
        `Failed to fetch crypto price: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      return null;
    }
  }
}
