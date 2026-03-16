import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { DATABASE_SERVICE, DatabaseService } from '@/database';

type SupabaseError = { message: string; code?: string } | null;

type SupabaseSelectResponse<T> = {
  data: T | null;
  error: SupabaseError;
};

type SupabaseSelectListResponse<T> = {
  data: T[] | null;
  error: SupabaseError;
};

/**
 * Test price data entity (OHLCV data)
 * Based on prediction.test_price_data table
 */
export interface TestPriceData {
  id: string;
  organization_slug: string;
  scenario_id: string | null;
  symbol: string; // Must start with T_
  price_timestamp: string; // ISO 8601 timestamp
  open: number; // Converted from DECIMAL(20,8)
  high: number; // Converted from DECIMAL(20,8)
  low: number; // Converted from DECIMAL(20,8)
  close: number; // Converted from DECIMAL(20,8)
  volume: number; // Converted from BIGINT
  created_at: string; // ISO 8601 timestamp
  metadata: Record<string, unknown>;
}

/**
 * Data for creating new test price data
 */
export interface CreateTestPriceData {
  id?: string; // Optional - will be generated if not provided
  organization_slug: string;
  scenario_id?: string | null;
  symbol: string; // Must start with T_
  price_timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Data for updating test price data
 */
export interface UpdateTestPriceData {
  symbol?: string;
  price_timestamp?: string;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  volume?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Filter options for querying price data
 */
export interface PriceDataFilter {
  organization_slug?: string;
  scenario_id?: string | null;
  symbol?: string;
  start_date?: string;
  end_date?: string;
  limit?: number;
  offset?: number;
}

/**
 * Result from bulk create operation
 */
export interface BulkCreateResult {
  created_count: number;
  failed_count: number;
  errors: Array<{
    index: number;
    error: string;
  }>;
}

/**
 * Repository for test price data (prediction.test_price_data)
 * Part of the Test Data Injection Framework (Phase 3)
 *
 * This repository manages OHLCV (Open, High, Low, Close, Volume) price data
 * for testing scenarios. All symbols must start with T_ prefix.
 */
@Injectable()
export class TestPriceDataRepository {
  private readonly logger = new Logger(TestPriceDataRepository.name);
  private readonly schema = 'prediction';
  private readonly table = 'test_price_data';

  constructor(@Inject(DATABASE_SERVICE) private readonly db: DatabaseService) {}

  /**
   * Validate that a symbol starts with T_ prefix
   * @throws BadRequestException if symbol is invalid
   */
  private validateSymbol(symbol: string): void {
    if (!symbol.startsWith('T_')) {
      throw new BadRequestException(
        `Invalid test symbol: ${symbol}. Test symbols must start with T_ prefix.`,
      );
    }
  }

  /**
   * Validate OHLCV price data consistency
   * @throws BadRequestException if price data is invalid
   */
  private validateOHLCV(data: {
    open: number;
    high: number;
    low: number;
    close: number;
  }): void {
    const { open, high, low, close } = data;

    if (high < low) {
      throw new BadRequestException('High price must be >= low price');
    }

    if (open < low || open > high) {
      throw new BadRequestException('Open price must be between low and high');
    }

    if (close < low || close > high) {
      throw new BadRequestException('Close price must be between low and high');
    }

    if (open <= 0 || high <= 0 || low <= 0 || close <= 0) {
      throw new BadRequestException('All prices must be positive numbers');
    }
  }

  /**
   * Find test price data by ID
   */
  async findById(id: string): Promise<TestPriceData | null> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('id', id)
      .single()) as SupabaseSelectResponse<TestPriceData>;

    if (error && error.code !== 'PGRST116') {
      this.logger.error(`Failed to fetch test price data: ${error.message}`);
      throw new Error(`Failed to fetch test price data: ${error.message}`);
    }

    return data;
  }

  /**
   * Find all price data for a scenario
   */
  async findByScenario(scenarioId: string): Promise<TestPriceData[]> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('scenario_id', scenarioId)
      .order('price_timestamp', {
        ascending: true,
      })) as SupabaseSelectListResponse<TestPriceData>;

    if (error) {
      this.logger.error(
        `Failed to fetch test price data by scenario: ${error.message}`,
      );
      throw new Error(
        `Failed to fetch test price data by scenario: ${error.message}`,
      );
    }

    return data ?? [];
  }

  /**
   * Find all price data for a symbol
   */
  async findBySymbol(
    symbol: string,
    organizationSlug: string,
  ): Promise<TestPriceData[]> {
    this.validateSymbol(symbol);

    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('symbol', symbol)
      .eq('organization_slug', organizationSlug)
      .order('price_timestamp', {
        ascending: true,
      })) as SupabaseSelectListResponse<TestPriceData>;

    if (error) {
      this.logger.error(
        `Failed to fetch test price data by symbol: ${error.message}`,
      );
      throw new Error(
        `Failed to fetch test price data by symbol: ${error.message}`,
      );
    }

    return data ?? [];
  }

  /**
   * Find price data within a date range
   */
  async findByDateRange(
    symbol: string,
    organizationSlug: string,
    startDate: string,
    endDate: string,
  ): Promise<TestPriceData[]> {
    this.validateSymbol(symbol);

    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('symbol', symbol)
      .eq('organization_slug', organizationSlug)
      .gte('price_timestamp', startDate)
      .lte('price_timestamp', endDate)
      .order('price_timestamp', {
        ascending: true,
      })) as SupabaseSelectListResponse<TestPriceData>;

    if (error) {
      this.logger.error(
        `Failed to fetch test price data by date range: ${error.message}`,
      );
      throw new Error(
        `Failed to fetch test price data by date range: ${error.message}`,
      );
    }

    return data ?? [];
  }

  /**
   * Find the latest price for a symbol
   */
  async findLatestPrice(
    symbol: string,
    organizationSlug: string,
  ): Promise<TestPriceData | null> {
    this.validateSymbol(symbol);

    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('symbol', symbol)
      .eq('organization_slug', organizationSlug)
      .order('price_timestamp', { ascending: false })
      .limit(1)
      .single()) as SupabaseSelectResponse<TestPriceData>;

    if (error && error.code !== 'PGRST116') {
      this.logger.error(
        `Failed to fetch latest test price data: ${error.message}`,
      );
      throw new Error(
        `Failed to fetch latest test price data: ${error.message}`,
      );
    }

    return data;
  }

  /**
   * Find price data with flexible filtering
   */
  async findByFilter(filter: PriceDataFilter): Promise<TestPriceData[]> {
    let query = this.db.from(this.schema, this.table).select('*');

    if (filter.organization_slug) {
      query = query.eq('organization_slug', filter.organization_slug);
    }

    if (filter.scenario_id !== undefined) {
      if (filter.scenario_id === null) {
        query = query.is('scenario_id', null);
      } else {
        query = query.eq('scenario_id', filter.scenario_id);
      }
    }

    if (filter.symbol) {
      this.validateSymbol(filter.symbol);
      query = query.eq('symbol', filter.symbol);
    }

    if (filter.start_date) {
      query = query.gte('price_timestamp', filter.start_date);
    }

    if (filter.end_date) {
      query = query.lte('price_timestamp', filter.end_date);
    }

    query = query.order('price_timestamp', { ascending: true });

    if (filter.limit) {
      query = query.limit(filter.limit);
    }

    if (filter.offset) {
      query = query.range(
        filter.offset,
        filter.offset + (filter.limit ?? 100) - 1,
      );
    }

    const { data, error } =
      (await query) as SupabaseSelectListResponse<TestPriceData>;

    if (error) {
      this.logger.error(
        `Failed to fetch test price data by filter: ${error.message}`,
      );
      throw new Error(
        `Failed to fetch test price data by filter: ${error.message}`,
      );
    }

    return data ?? [];
  }

  /**
   * Create a new test price data record
   */
  async create(priceData: CreateTestPriceData): Promise<TestPriceData> {
    // Validate symbol prefix
    this.validateSymbol(priceData.symbol);

    // Validate OHLCV consistency
    this.validateOHLCV({
      open: priceData.open,
      high: priceData.high,
      low: priceData.low,
      close: priceData.close,
    });

    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .insert(priceData)
      .select()
      .single()) as SupabaseSelectResponse<TestPriceData>;

    if (error) {
      this.logger.error(`Failed to create test price data: ${error.message}`);
      throw new Error(`Failed to create test price data: ${error.message}`);
    }

    if (!data) {
      throw new Error('Create succeeded but no test price data returned');
    }

    this.logger.log(
      `Created test price data: ${data.symbol} at ${data.price_timestamp}`,
    );
    return data;
  }

  /**
   * Bulk create test price data records
   * Returns summary of created/failed records
   */
  async bulkCreate(
    priceDataList: CreateTestPriceData[],
  ): Promise<BulkCreateResult> {
    const result: BulkCreateResult = {
      created_count: 0,
      failed_count: 0,
      errors: [],
    };

    // Validate all records before inserting
    for (let i = 0; i < priceDataList.length; i++) {
      const priceData = priceDataList[i];
      if (!priceData) {
        result.failed_count++;
        result.errors.push({
          index: i,
          error: 'Price data is undefined',
        });
        continue;
      }

      try {
        this.validateSymbol(priceData.symbol);
        this.validateOHLCV({
          open: priceData.open,
          high: priceData.high,
          low: priceData.low,
          close: priceData.close,
        });
      } catch (error) {
        result.failed_count++;
        result.errors.push({
          index: i,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Filter out failed records
    const validRecords = priceDataList.filter(
      (_, index) => !result.errors.some((err) => err.index === index),
    );

    if (validRecords.length === 0) {
      this.logger.warn('No valid records to insert in bulk create');
      return result;
    }

    // Insert valid records
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .insert(validRecords)
      .select()) as SupabaseSelectListResponse<TestPriceData>;

    if (error) {
      this.logger.error(
        `Failed to bulk create test price data: ${error.message}`,
      );
      throw new Error(
        `Failed to bulk create test price data: ${error.message}`,
      );
    }

    result.created_count = data?.length ?? 0;

    this.logger.log(
      `Bulk created ${result.created_count} test price data records (${result.failed_count} failed validation)`,
    );

    return result;
  }

  /**
   * Update test price data
   */
  async update(
    id: string,
    updateData: UpdateTestPriceData,
  ): Promise<TestPriceData> {
    // Validate symbol if being updated
    if (updateData.symbol) {
      this.validateSymbol(updateData.symbol);
    }

    // Validate OHLCV if any price fields are being updated
    const hasOHLCVUpdate =
      updateData.open !== undefined ||
      updateData.high !== undefined ||
      updateData.low !== undefined ||
      updateData.close !== undefined;

    if (hasOHLCVUpdate) {
      // Fetch current data to merge with updates
      const current = await this.findById(id);
      if (!current) {
        throw new Error(`Test price data not found: ${id}`);
      }

      this.validateOHLCV({
        open: updateData.open ?? current.open,
        high: updateData.high ?? current.high,
        low: updateData.low ?? current.low,
        close: updateData.close ?? current.close,
      });
    }

    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .update(updateData)
      .eq('id', id)
      .select()
      .single()) as SupabaseSelectResponse<TestPriceData>;

    if (error) {
      this.logger.error(`Failed to update test price data: ${error.message}`);
      throw new Error(`Failed to update test price data: ${error.message}`);
    }

    if (!data) {
      throw new Error('Update succeeded but no test price data returned');
    }

    return data;
  }

  /**
   * Delete test price data by ID
   */
  async delete(id: string): Promise<void> {
    const { error } = await this.db
      .from(this.schema, this.table)
      .delete()
      .eq('id', id);

    if (error) {
      this.logger.error(`Failed to delete test price data: ${error.message}`);
      throw new Error(`Failed to delete test price data: ${error.message}`);
    }

    this.logger.log(`Deleted test price data: ${id}`);
  }

  /**
   * Delete all price data for a scenario
   */
  async deleteByScenario(scenarioId: string): Promise<number> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .delete()
      .eq('scenario_id', scenarioId)
      .select('id')) as SupabaseSelectListResponse<{ id: string }>;

    if (error) {
      this.logger.error(
        `Failed to delete test price data by scenario: ${error.message}`,
      );
      throw new Error(
        `Failed to delete test price data by scenario: ${error.message}`,
      );
    }

    const deletedCount = data?.length ?? 0;
    this.logger.log(
      `Deleted ${deletedCount} test price data records for scenario ${scenarioId}`,
    );

    return deletedCount;
  }

  /**
   * Delete all price data for a symbol
   */
  async deleteBySymbol(
    symbol: string,
    organizationSlug: string,
  ): Promise<number> {
    this.validateSymbol(symbol);

    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .delete()
      .eq('symbol', symbol)
      .eq('organization_slug', organizationSlug)
      .select('id')) as SupabaseSelectListResponse<{ id: string }>;

    if (error) {
      this.logger.error(
        `Failed to delete test price data by symbol: ${error.message}`,
      );
      throw new Error(
        `Failed to delete test price data by symbol: ${error.message}`,
      );
    }

    const deletedCount = data?.length ?? 0;
    this.logger.log(
      `Deleted ${deletedCount} test price data records for symbol ${symbol}`,
    );

    return deletedCount;
  }

  /**
   * Count price data records for a scenario
   */
  async countByScenario(scenarioId: string): Promise<number> {
    const { count, error } = await this.db
      .from(this.schema, this.table)
      .select('*', { count: 'exact', head: true })
      .eq('scenario_id', scenarioId);

    if (error) {
      this.logger.error(
        `Failed to count test price data by scenario: ${error.message}`,
      );
      throw new Error(
        `Failed to count test price data by scenario: ${error.message}`,
      );
    }

    return count ?? 0;
  }

  /**
   * Count price data records for a symbol
   */
  async countBySymbol(
    symbol: string,
    organizationSlug: string,
  ): Promise<number> {
    this.validateSymbol(symbol);

    const { count, error } = await this.db
      .from(this.schema, this.table)
      .select('*', { count: 'exact', head: true })
      .eq('symbol', symbol)
      .eq('organization_slug', organizationSlug);

    if (error) {
      this.logger.error(
        `Failed to count test price data by symbol: ${error.message}`,
      );
      throw new Error(
        `Failed to count test price data by symbol: ${error.message}`,
      );
    }

    return count ?? 0;
  }
}
