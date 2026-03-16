import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import {
  TestPriceDataRepository,
  CreateTestPriceData,
  TestPriceData,
  PriceDataFilter,
  BulkCreateResult,
} from '../repositories/test-price-data.repository';

/**
 * Parameters for generating synthetic price history
 */
export interface GeneratePriceHistoryParams {
  /** Starting price for the series */
  startPrice: number;
  /** Daily volatility (0.0 - 1.0, typically 0.01-0.05) */
  volatility?: number;
  /** Daily drift/trend (-1.0 to 1.0, typically -0.01 to 0.01) */
  drift?: number;
  /** Intraday volatility multiplier for OHLC spread */
  intradayVolatility?: number;
  /** Average daily volume */
  avgVolume?: number;
  /** Volume randomness (0.0 - 1.0) */
  volumeVariance?: number;
  /** Time interval between data points (in minutes) */
  intervalMinutes?: number;
}

/**
 * CSV price data row format
 */
export interface CSVPriceDataRow {
  symbol: string;
  timestamp: string; // ISO 8601 or parseable date string
  open: string | number;
  high: string | number;
  low: string | number;
  close: string | number;
  volume?: string | number;
}

/**
 * JSON price data format
 */
export interface JSONPriceDataRow {
  symbol: string;
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

/**
 * Service for managing test price data
 * Part of the Test Data Injection Framework (Phase 3)
 *
 * This service manages synthetic OHLCV price data for T_ prefixed test symbols.
 * It provides functionality for:
 * - Creating and managing individual price records
 * - Bulk importing from CSV or JSON
 * - Generating realistic synthetic price histories
 * - Validating T_ prefix requirements (INV-08)
 */
@Injectable()
export class TestPriceDataService {
  private readonly logger = new Logger(TestPriceDataService.name);

  constructor(
    private readonly testPriceDataRepository: TestPriceDataRepository,
  ) {}

  /**
   * Validate that a symbol starts with T_ prefix
   * @throws BadRequestException if symbol is invalid
   */
  validateSymbol(symbol: string): void {
    if (!symbol.startsWith('T_')) {
      throw new BadRequestException(
        `Invalid test symbol: ${symbol}. Test symbols must start with T_ prefix (INV-08).`,
      );
    }
  }

  /**
   * Create a single price data record
   */
  async createPriceData(data: CreateTestPriceData): Promise<TestPriceData> {
    this.validateSymbol(data.symbol);
    return this.testPriceDataRepository.create(data);
  }

  /**
   * Bulk create price data records
   * Validates all records and returns summary of results
   */
  async bulkCreatePriceData(
    records: CreateTestPriceData[],
  ): Promise<BulkCreateResult> {
    // Validate all symbols
    for (const record of records) {
      this.validateSymbol(record.symbol);
    }

    return this.testPriceDataRepository.bulkCreate(records);
  }

  /**
   * Generate synthetic price history for a test symbol
   * Uses geometric Brownian motion for realistic price movements
   *
   * @param symbol - Test symbol (must start with T_)
   * @param startDate - Start date for the price history
   * @param endDate - End date for the price history
   * @param organizationSlug - Organization slug
   * @param params - Parameters controlling price generation
   * @param scenarioId - Optional scenario ID to associate with the data
   */
  async generatePriceHistory(
    symbol: string,
    startDate: Date,
    endDate: Date,
    organizationSlug: string,
    params: GeneratePriceHistoryParams,
    scenarioId?: string,
  ): Promise<TestPriceData[]> {
    this.validateSymbol(symbol);

    const {
      startPrice,
      volatility = 0.02, // 2% daily volatility
      drift = 0.0, // No drift by default
      intradayVolatility = 0.5, // OHLC spread is 50% of daily move
      avgVolume = 1000000,
      volumeVariance = 0.3, // 30% volume variance
      intervalMinutes = 1440, // Default to daily (1440 minutes)
    } = params;

    if (startPrice <= 0) {
      throw new BadRequestException('Start price must be positive');
    }

    if (startDate >= endDate) {
      throw new BadRequestException('Start date must be before end date');
    }

    const records: CreateTestPriceData[] = [];
    let currentPrice = startPrice;
    const intervalMs = intervalMinutes * 60 * 1000;
    let currentTimestamp = new Date(startDate);

    this.logger.log(
      `Generating price history for ${symbol} from ${startDate.toISOString()} to ${endDate.toISOString()}`,
    );

    while (currentTimestamp <= endDate) {
      // Generate random returns using geometric Brownian motion
      const randomReturn =
        drift + volatility * this.randomNormal(0, 1) * Math.sqrt(1);

      // Calculate next close price
      const nextClose = currentPrice * (1 + randomReturn);

      // Generate OHLC data with intraday volatility
      const intradayRange = Math.abs(randomReturn) * intradayVolatility;
      const ohlc = this.generateOHLC(currentPrice, nextClose, intradayRange);

      // Generate volume with variance
      const volumeMultiplier = 1 + (Math.random() - 0.5) * 2 * volumeVariance;
      const volume = Math.round(avgVolume * volumeMultiplier);

      records.push({
        organization_slug: organizationSlug,
        scenario_id: scenarioId,
        symbol,
        price_timestamp: currentTimestamp.toISOString(),
        open: this.roundPrice(ohlc.open),
        high: this.roundPrice(ohlc.high),
        low: this.roundPrice(ohlc.low),
        close: this.roundPrice(ohlc.close),
        volume,
        metadata: {
          generated: true,
          generation_params: {
            volatility,
            drift,
            intradayVolatility,
          },
        },
      });

      // Update for next iteration
      currentPrice = nextClose;
      currentTimestamp = new Date(currentTimestamp.getTime() + intervalMs);
    }

    this.logger.log(
      `Generated ${records.length} price data points for ${symbol}`,
    );

    // Bulk insert all records
    const result = await this.testPriceDataRepository.bulkCreate(records);

    if (result.failed_count > 0) {
      this.logger.warn(
        `${result.failed_count} records failed validation during bulk create`,
      );
    }

    // Fetch the created records to return them
    const createdRecords = await this.testPriceDataRepository.findBySymbol(
      symbol,
      organizationSlug,
    );

    return createdRecords.filter(
      (record) =>
        new Date(record.price_timestamp) >= startDate &&
        new Date(record.price_timestamp) <= endDate,
    );
  }

  /**
   * Import price data from CSV format
   * Expected format: symbol,timestamp,open,high,low,close,volume
   *
   * @param csvData - Array of CSV row objects
   * @param organizationSlug - Organization slug
   * @param scenarioId - Optional scenario ID
   */
  async importFromCSV(
    csvData: CSVPriceDataRow[],
    organizationSlug: string,
    scenarioId?: string,
  ): Promise<BulkCreateResult> {
    const records: CreateTestPriceData[] = csvData.map((row) => {
      const symbol = row.symbol.trim();
      this.validateSymbol(symbol);

      return {
        organization_slug: organizationSlug,
        scenario_id: scenarioId,
        symbol,
        price_timestamp: new Date(row.timestamp).toISOString(),
        open: Number(row.open),
        high: Number(row.high),
        low: Number(row.low),
        close: Number(row.close),
        volume: row.volume ? Number(row.volume) : 0,
        metadata: {
          source: 'csv_import',
          imported_at: new Date().toISOString(),
        },
      };
    });

    this.logger.log(`Importing ${records.length} records from CSV`);
    return this.bulkCreatePriceData(records);
  }

  /**
   * Import price data from JSON format
   *
   * @param jsonData - Array of JSON price data objects
   * @param organizationSlug - Organization slug
   * @param scenarioId - Optional scenario ID
   */
  async importFromJSON(
    jsonData: JSONPriceDataRow[],
    organizationSlug: string,
    scenarioId?: string,
  ): Promise<BulkCreateResult> {
    const records: CreateTestPriceData[] = jsonData.map((row) => {
      this.validateSymbol(row.symbol);

      return {
        organization_slug: organizationSlug,
        scenario_id: scenarioId,
        symbol: row.symbol,
        price_timestamp: new Date(row.timestamp).toISOString(),
        open: row.open,
        high: row.high,
        low: row.low,
        close: row.close,
        volume: row.volume ?? 0,
        metadata: {
          source: 'json_import',
          imported_at: new Date().toISOString(),
        },
      };
    });

    this.logger.log(`Importing ${records.length} records from JSON`);
    return this.bulkCreatePriceData(records);
  }

  /**
   * Get the latest price for a symbol
   */
  async getLatestPrice(
    symbol: string,
    organizationSlug: string,
  ): Promise<TestPriceData | null> {
    this.validateSymbol(symbol);
    return this.testPriceDataRepository.findLatestPrice(
      symbol,
      organizationSlug,
    );
  }

  /**
   * Get price data within a date range
   */
  async getPriceRange(
    symbol: string,
    organizationSlug: string,
    startDate: Date,
    endDate: Date,
  ): Promise<TestPriceData[]> {
    this.validateSymbol(symbol);
    return this.testPriceDataRepository.findByDateRange(
      symbol,
      organizationSlug,
      startDate.toISOString(),
      endDate.toISOString(),
    );
  }

  /**
   * Get all price data for a symbol
   */
  async getAllPriceData(
    symbol: string,
    organizationSlug: string,
  ): Promise<TestPriceData[]> {
    this.validateSymbol(symbol);
    return this.testPriceDataRepository.findBySymbol(symbol, organizationSlug);
  }

  /**
   * Get price data by filter
   */
  async getPriceDataByFilter(
    filter: PriceDataFilter,
  ): Promise<TestPriceData[]> {
    if (filter.symbol) {
      this.validateSymbol(filter.symbol);
    }
    return this.testPriceDataRepository.findByFilter(filter);
  }

  /**
   * Delete all price data for a symbol
   */
  async deletePriceData(
    symbol: string,
    organizationSlug: string,
  ): Promise<number> {
    this.validateSymbol(symbol);
    return this.testPriceDataRepository.deleteBySymbol(
      symbol,
      organizationSlug,
    );
  }

  /**
   * Delete all price data for a scenario
   */
  async deletePriceDataByScenario(scenarioId: string): Promise<number> {
    return this.testPriceDataRepository.deleteByScenario(scenarioId);
  }

  /**
   * Count price data records for a symbol
   */
  async countPriceData(
    symbol: string,
    organizationSlug: string,
  ): Promise<number> {
    this.validateSymbol(symbol);
    return this.testPriceDataRepository.countBySymbol(symbol, organizationSlug);
  }

  /**
   * Generate OHLC data given open, close, and intraday range
   * Ensures high >= max(open, close) and low <= min(open, close)
   */
  private generateOHLC(
    open: number,
    close: number,
    intradayRange: number,
  ): { open: number; high: number; low: number; close: number } {
    // Add intraday volatility on top of the open-close move
    const highExtension = intradayRange * open * (0.5 + Math.random() * 0.5);
    const lowExtension = intradayRange * open * (0.5 + Math.random() * 0.5);

    const high = Math.max(open, close) + highExtension;
    const low = Math.min(open, close) - lowExtension;

    return {
      open,
      high,
      low,
      close,
    };
  }

  /**
   * Round price to 8 decimal places (matches DECIMAL(20,8) in database)
   */
  private roundPrice(price: number): number {
    return Math.round(price * 100000000) / 100000000;
  }

  /**
   * Generate a random number from a normal distribution
   * Uses Box-Muller transform
   */
  private randomNormal(mean: number = 0, stdDev: number = 1): number {
    let u1 = 0;
    let u2 = 0;

    // Ensure we don't get 0 for log
    while (u1 === 0) u1 = Math.random();
    while (u2 === 0) u2 = Math.random();

    const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    return z0 * stdDev + mean;
  }
}
