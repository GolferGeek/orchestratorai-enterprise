import { Injectable, Logger } from '@nestjs/common';
import type { Target } from '../../interfaces/target.interface';
import { CoinMarketCapMarketDataService } from './coinmarketcap-market-data.service';
import { PolygonMarketDataService } from './polygon-market-data.service';
import { PolymarketMarketDataService } from './polymarket-market-data.service';
import type { MarketDomain, MarketSnapshotValue } from './types';

@Injectable()
export class MarketDataRouterService {
  private readonly logger = new Logger(MarketDataRouterService.name);

  constructor(
    private readonly polygonMarketData: PolygonMarketDataService,
    private readonly coinMarketCapMarketData: CoinMarketCapMarketDataService,
    private readonly polymarketMarketData: PolymarketMarketDataService,
  ) {}

  async fetchTargetValue(
    target: Target,
    domain: MarketDomain,
  ): Promise<MarketSnapshotValue | null> {
    switch (domain) {
      case 'stocks':
        return this.polygonMarketData.fetchStockPrice(target);
      case 'crypto':
        return this.coinMarketCapMarketData.fetchCryptoPrice(target);
      case 'polymarket':
        return this.polymarketMarketData.fetchMarketProbability(target);
      case 'elections':
        this.logger.debug('Election targets use external polling data');
        return null;
    }
  }
}
