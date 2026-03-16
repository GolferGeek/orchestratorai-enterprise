/**
 * TestPriceDataRouterService - Routes price requests for T_ prefixed symbols
 *
 * Phase 2: Test Input Infrastructure
 *
 * This service intercepts price data requests and routes them based on symbol prefix:
 * - T_ prefixed symbols: Route to prediction.test_price_data (synthetic)
 * - Regular symbols: Pass through to external APIs (Polygon, Yahoo Finance, etc.)
 *
 * Key features:
 * - Transparent routing - callers don't need to know about test vs production
 * - INV-08 compliance: Test symbols must have T_ prefix
 * - Supports latest price, historical ranges, and OHLCV data
 *
 * INVARIANTS:
 * - INV-08: Test target symbols MUST have T_ prefix
 * - Test price data comes from DB, not external APIs
 * - Real price data comes from external APIs only
 *
 * @module test-price-data-router
 */

import { Injectable, Logger } from '@nestjs/common';
import {
  TestPriceDataService,
  GeneratePriceHistoryParams,
} from './test-price-data.service';
import {
  TestPriceDataRepository,
  TestPriceData,
} from '../repositories/test-price-data.repository';

/**
 * Price data point structure (unified for test and production)
 */
export interface PriceDataPoint {
  symbol: string;
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
  /** Whether this is test data (from test_price_data table) */
  is_test: boolean;
  /** Original source of the data */
  source: 'test_db' | 'external_api';
}

/**
 * Result from price routing
 */
export interface PriceRoutingResult {
  /** The price data (if successful) */
  data: PriceDataPoint | PriceDataPoint[] | null;
  /** Whether the symbol was routed to test data */
  is_test_route: boolean;
  /** Error message if any */
  error?: string;
}

/**
 * External price fetcher interface
 * Implementations should wrap external APIs (Yahoo Finance, Polygon, etc.)
 */
export interface ExternalPriceFetcher {
  /** Fetch latest price for a symbol */
  getLatestPrice(symbol: string): Promise<PriceDataPoint | null>;
  /** Fetch historical price range */
  getPriceRange(
    symbol: string,
    startDate: Date,
    endDate: Date,
  ): Promise<PriceDataPoint[]>;
}

@Injectable()
export class TestPriceDataRouterService {
  private readonly logger = new Logger(TestPriceDataRouterService.name);

  /** External price fetcher (injected or set via setExternalFetcher) */
  private externalFetcher: ExternalPriceFetcher | null = null;

  constructor(
    private readonly testPriceDataService: TestPriceDataService,
    private readonly testPriceDataRepository: TestPriceDataRepository,
  ) {}

  /**
   * Set the external price fetcher for real symbols
   * This should be called during module initialization with the appropriate fetcher
   */
  setExternalFetcher(fetcher: ExternalPriceFetcher): void {
    this.externalFetcher = fetcher;
  }

  /**
   * Check if a symbol is a test symbol (T_ prefix)
   */
  isTestSymbol(symbol: string): boolean {
    return symbol.startsWith('T_');
  }

  /**
   * Get the real symbol from a test symbol (removes T_ prefix)
   */
  getRealSymbol(testSymbol: string): string {
    if (this.isTestSymbol(testSymbol)) {
      return testSymbol.substring(2); // Remove 'T_' prefix
    }
    return testSymbol;
  }

  /**
   * Get the test symbol from a real symbol (adds T_ prefix)
   */
  getTestSymbol(realSymbol: string): string {
    if (this.isTestSymbol(realSymbol)) {
      return realSymbol; // Already a test symbol
    }
    return `T_${realSymbol}`;
  }

  /**
   * Get the latest price for a symbol
   * Routes T_ symbols to test_price_data, others to external API
   *
   * @param symbol - Symbol to get price for (e.g., 'AAPL' or 'T_AAPL')
   * @param organizationSlug - Organization slug (required for test data)
   */
  async getLatestPrice(
    symbol: string,
    organizationSlug: string,
  ): Promise<PriceRoutingResult> {
    const isTestSymbol = this.isTestSymbol(symbol);

    if (isTestSymbol) {
      // Route to test price data
      return this.getTestLatestPrice(symbol, organizationSlug);
    } else {
      // Route to external API
      return this.getExternalLatestPrice(symbol);
    }
  }

  /**
   * Get price history for a symbol within a date range
   * Routes T_ symbols to test_price_data, others to external API
   *
   * @param symbol - Symbol to get price history for
   * @param organizationSlug - Organization slug (required for test data)
   * @param startDate - Start of date range
   * @param endDate - End of date range
   */
  async getPriceRange(
    symbol: string,
    organizationSlug: string,
    startDate: Date,
    endDate: Date,
  ): Promise<PriceRoutingResult> {
    const isTestSymbol = this.isTestSymbol(symbol);

    if (isTestSymbol) {
      // Route to test price data
      return this.getTestPriceRange(
        symbol,
        organizationSlug,
        startDate,
        endDate,
      );
    } else {
      // Route to external API
      return this.getExternalPriceRange(symbol, startDate, endDate);
    }
  }

  /**
   * Generate synthetic price history for a test symbol
   * Only works for T_ prefixed symbols
   *
   * @param symbol - Test symbol (must start with T_)
   * @param organizationSlug - Organization slug
   * @param startDate - Start of date range
   * @param endDate - End of date range
   * @param params - Price generation parameters
   * @param scenarioId - Optional scenario ID to link data to
   */
  async generateTestPriceHistory(
    symbol: string,
    organizationSlug: string,
    startDate: Date,
    endDate: Date,
    params: GeneratePriceHistoryParams,
    scenarioId?: string,
  ): Promise<PriceRoutingResult> {
    if (!this.isTestSymbol(symbol)) {
      return {
        data: null,
        is_test_route: false,
        error: `Cannot generate test prices for non-test symbol: ${symbol}. Use T_${symbol} instead.`,
      };
    }

    try {
      const priceData = await this.testPriceDataService.generatePriceHistory(
        symbol,
        startDate,
        endDate,
        organizationSlug,
        params,
        scenarioId,
      );

      return {
        data: priceData.map((p) => this.testPriceToDataPoint(p)),
        is_test_route: true,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to generate test price history for ${symbol}: ${errorMessage}`,
      );

      return {
        data: null,
        is_test_route: true,
        error: errorMessage,
      };
    }
  }

  /**
   * Import price data from external source to test symbol
   * Useful for seeding test data based on real historical data
   *
   * @param realSymbol - Real symbol to copy from (e.g., 'AAPL')
   * @param organizationSlug - Organization slug
   * @param startDate - Start of date range
   * @param endDate - End of date range
   * @param scenarioId - Optional scenario ID to link data to
   */
  async seedTestPriceFromReal(
    realSymbol: string,
    organizationSlug: string,
    startDate: Date,
    endDate: Date,
    scenarioId?: string,
  ): Promise<PriceRoutingResult> {
    // Get real price data
    const realResult = await this.getExternalPriceRange(
      realSymbol,
      startDate,
      endDate,
    );

    if (realResult.error || !realResult.data) {
      return {
        data: null,
        is_test_route: false,
        error:
          realResult.error ||
          `No price data available for ${realSymbol} in the specified range`,
      };
    }

    const testSymbol = this.getTestSymbol(realSymbol);
    const priceDataArray = Array.isArray(realResult.data)
      ? realResult.data
      : [realResult.data];

    try {
      // Import to test price data
      const importData = priceDataArray.map((p) => ({
        symbol: testSymbol,
        timestamp: p.timestamp,
        open: p.open,
        high: p.high,
        low: p.low,
        close: p.close,
        volume: p.volume,
      }));

      const result = await this.testPriceDataService.importFromJSON(
        importData,
        organizationSlug,
        scenarioId,
      );

      this.logger.log(
        `Seeded ${result.created_count} price records from ${realSymbol} to ${testSymbol}`,
      );

      // Return the imported data
      const importedData = await this.testPriceDataService.getPriceRange(
        testSymbol,
        organizationSlug,
        startDate,
        endDate,
      );

      return {
        data: importedData.map((p) => this.testPriceToDataPoint(p)),
        is_test_route: true,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to seed test price data from ${realSymbol}: ${errorMessage}`,
      );

      return {
        data: null,
        is_test_route: true,
        error: errorMessage,
      };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE HELPER METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get latest price from test_price_data table
   */
  private async getTestLatestPrice(
    symbol: string,
    organizationSlug: string,
  ): Promise<PriceRoutingResult> {
    try {
      const price = await this.testPriceDataService.getLatestPrice(
        symbol,
        organizationSlug,
      );

      if (!price) {
        return {
          data: null,
          is_test_route: true,
          error: `No test price data found for ${symbol}. Generate data using generateTestPriceHistory() first.`,
        };
      }

      return {
        data: this.testPriceToDataPoint(price),
        is_test_route: true,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to get test price for ${symbol}: ${errorMessage}`,
      );

      return {
        data: null,
        is_test_route: true,
        error: errorMessage,
      };
    }
  }

  /**
   * Get price range from test_price_data table
   */
  private async getTestPriceRange(
    symbol: string,
    organizationSlug: string,
    startDate: Date,
    endDate: Date,
  ): Promise<PriceRoutingResult> {
    try {
      const prices = await this.testPriceDataService.getPriceRange(
        symbol,
        organizationSlug,
        startDate,
        endDate,
      );

      if (prices.length === 0) {
        return {
          data: [],
          is_test_route: true,
          error: `No test price data found for ${symbol} in the specified range. Generate data using generateTestPriceHistory() first.`,
        };
      }

      return {
        data: prices.map((p) => this.testPriceToDataPoint(p)),
        is_test_route: true,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to get test price range for ${symbol}: ${errorMessage}`,
      );

      return {
        data: null,
        is_test_route: true,
        error: errorMessage,
      };
    }
  }

  /**
   * Get latest price from external API
   */
  private async getExternalLatestPrice(
    symbol: string,
  ): Promise<PriceRoutingResult> {
    if (!this.externalFetcher) {
      return {
        data: null,
        is_test_route: false,
        error:
          'No external price fetcher configured. Set fetcher using setExternalFetcher().',
      };
    }

    try {
      const price = await this.externalFetcher.getLatestPrice(symbol);

      if (!price) {
        return {
          data: null,
          is_test_route: false,
          error: `No price data available for ${symbol} from external API`,
        };
      }

      return {
        data: price,
        is_test_route: false,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to get external price for ${symbol}: ${errorMessage}`,
      );

      return {
        data: null,
        is_test_route: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Get price range from external API
   */
  private async getExternalPriceRange(
    symbol: string,
    startDate: Date,
    endDate: Date,
  ): Promise<PriceRoutingResult> {
    if (!this.externalFetcher) {
      return {
        data: null,
        is_test_route: false,
        error:
          'No external price fetcher configured. Set fetcher using setExternalFetcher().',
      };
    }

    try {
      const prices = await this.externalFetcher.getPriceRange(
        symbol,
        startDate,
        endDate,
      );

      return {
        data: prices,
        is_test_route: false,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to get external price range for ${symbol}: ${errorMessage}`,
      );

      return {
        data: null,
        is_test_route: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Convert TestPriceData to PriceDataPoint
   */
  private testPriceToDataPoint(testPrice: TestPriceData): PriceDataPoint {
    return {
      symbol: testPrice.symbol,
      timestamp: testPrice.price_timestamp,
      open: testPrice.open,
      high: testPrice.high,
      low: testPrice.low,
      close: testPrice.close,
      volume: testPrice.volume ?? undefined,
      is_test: true,
      source: 'test_db',
    };
  }
}
