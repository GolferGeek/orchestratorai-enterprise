/**
 * Test Price Data Dashboard Handler
 *
 * Handles dashboard mode requests for test price data (OHLCV).
 * Part of Phase 3: Test Data Management UI.
 *
 * Supports:
 * - CRUD operations on test price data
 * - Bulk create for price timelines
 * - Get latest price for a symbol
 * - Get prices by date range
 * - Count operations for statistics
 */

import { Injectable, Logger } from '@nestjs/common';
import type { ExecutionContext } from '@orchestrator-ai/transport-types';
import type { DashboardRequestPayload } from '@orchestrator-ai/transport-types';
import {
  TestPriceDataRepository,
  CreateTestPriceData,
  UpdateTestPriceData,
  PriceDataFilter,
} from '../../repositories/test-price-data.repository';
import {
  IDashboardHandler,
  DashboardActionResult,
  buildDashboardSuccess,
  buildDashboardError,
  buildPaginationMetadata,
} from '../dashboard-handler.interface';

interface TestPriceDataFilters {
  scenarioId?: string;
  symbol?: string;
  startDate?: string;
  endDate?: string;
}

interface TestPriceDataParams {
  id?: string;
  organizationSlug?: string;
  filters?: TestPriceDataFilters;
  page?: number;
  pageSize?: number;
  // For get-latest
  symbol?: string;
}

interface CreateTestPriceDataParams {
  scenario_id?: string;
  symbol: string;
  price_timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
  metadata?: Record<string, unknown>;
}

interface UpdateTestPriceDataParams {
  symbol?: string;
  price_timestamp?: string;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  volume?: number;
  metadata?: Record<string, unknown>;
}

interface BulkCreateParams {
  priceData: CreateTestPriceDataParams[];
}

@Injectable()
export class TestPriceDataHandler implements IDashboardHandler {
  private readonly logger = new Logger(TestPriceDataHandler.name);
  private readonly supportedActions = [
    'list',
    'get',
    'create',
    'update',
    'delete',
    'bulk-create',
    'get-latest',
    'get-by-date-range',
    'count-by-scenario',
    'count-by-symbol',
    'delete-by-scenario',
    'delete-by-symbol',
  ];

  constructor(
    private readonly testPriceDataRepository: TestPriceDataRepository,
  ) {}

  async execute(
    action: string,
    payload: DashboardRequestPayload,
    context: ExecutionContext,
  ): Promise<DashboardActionResult> {
    this.logger.debug(
      `[TEST-PRICE-DATA-HANDLER] Executing action: ${action} for org: ${context.orgSlug}`,
    );

    const params = payload.params as TestPriceDataParams | undefined;

    switch (action.toLowerCase()) {
      case 'list':
        return this.handleList(context, params);
      case 'get':
        return this.handleGet(params);
      case 'create':
        return this.handleCreate(context, payload);
      case 'update':
        return this.handleUpdate(params, payload);
      case 'delete':
        return this.handleDelete(params);
      case 'bulk-create':
      case 'bulkcreate':
        return this.handleBulkCreate(context, payload);
      case 'get-latest':
      case 'getlatest':
        return this.handleGetLatest(context, params);
      case 'get-by-date-range':
      case 'getbydaterange':
        return this.handleGetByDateRange(context, params);
      case 'count-by-scenario':
      case 'countbyscenario':
        return this.handleCountByScenario(params);
      case 'count-by-symbol':
      case 'countbysymbol':
        return this.handleCountBySymbol(context, params);
      case 'delete-by-scenario':
      case 'deletebyscenario':
        return this.handleDeleteByScenario(params);
      case 'delete-by-symbol':
      case 'deletebysymbol':
        return this.handleDeleteBySymbol(context, params);
      default:
        return buildDashboardError(
          'UNSUPPORTED_ACTION',
          `Unsupported action: ${action}`,
          { supportedActions: this.supportedActions },
        );
    }
  }

  getSupportedActions(): string[] {
    return this.supportedActions;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CRUD Operations
  // ═══════════════════════════════════════════════════════════════════════════

  private async handleList(
    context: ExecutionContext,
    params?: TestPriceDataParams,
  ): Promise<DashboardActionResult> {
    try {
      const filter: PriceDataFilter = {
        organization_slug: context.orgSlug,
      };

      if (params?.filters?.scenarioId) {
        filter.scenario_id = params.filters.scenarioId;
      }
      if (params?.filters?.symbol) {
        filter.symbol = params.filters.symbol;
      }
      if (params?.filters?.startDate) {
        filter.start_date = params.filters.startDate;
      }
      if (params?.filters?.endDate) {
        filter.end_date = params.filters.endDate;
      }

      // Handle pagination through repository
      const page = params?.page ?? 1;
      const pageSize = params?.pageSize ?? 100;
      filter.offset = (page - 1) * pageSize;
      filter.limit = pageSize;

      const priceData = await this.testPriceDataRepository.findByFilter(filter);

      // For accurate total count, we need to query without pagination
      // For now, estimate based on whether we got a full page
      const hasMore = priceData.length === pageSize;

      return buildDashboardSuccess(priceData, {
        page,
        pageSize,
        hasMore,
      });
    } catch (error) {
      this.logger.error(
        `Failed to list test price data: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'LIST_FAILED',
        error instanceof Error
          ? error.message
          : 'Failed to list test price data',
      );
    }
  }

  private async handleGet(
    params?: TestPriceDataParams,
  ): Promise<DashboardActionResult> {
    if (!params?.id) {
      return buildDashboardError('MISSING_ID', 'Price data ID is required');
    }

    try {
      const priceData = await this.testPriceDataRepository.findById(params.id);
      if (!priceData) {
        return buildDashboardError(
          'NOT_FOUND',
          `Price data not found: ${params.id}`,
        );
      }

      return buildDashboardSuccess(priceData);
    } catch (error) {
      this.logger.error(
        `Failed to get test price data: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'GET_FAILED',
        error instanceof Error
          ? error.message
          : 'Failed to get test price data',
      );
    }
  }

  private async handleCreate(
    context: ExecutionContext,
    payload: DashboardRequestPayload,
  ): Promise<DashboardActionResult> {
    const data = payload.params as unknown as CreateTestPriceDataParams;

    if (!data.symbol || !data.price_timestamp) {
      return buildDashboardError(
        'INVALID_DATA',
        'symbol and price_timestamp are required',
      );
    }

    if (
      data.open === undefined ||
      data.high === undefined ||
      data.low === undefined ||
      data.close === undefined
    ) {
      return buildDashboardError(
        'INVALID_DATA',
        'open, high, low, and close prices are required',
      );
    }

    try {
      const createData: CreateTestPriceData = {
        organization_slug: context.orgSlug,
        scenario_id: data.scenario_id,
        symbol: data.symbol,
        price_timestamp: data.price_timestamp,
        open: data.open,
        high: data.high,
        low: data.low,
        close: data.close,
        volume: data.volume,
        metadata: data.metadata ?? {},
      };

      const priceData = await this.testPriceDataRepository.create(createData);
      return buildDashboardSuccess(priceData);
    } catch (error) {
      this.logger.error(
        `Failed to create test price data: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'CREATE_FAILED',
        error instanceof Error
          ? error.message
          : 'Failed to create test price data',
      );
    }
  }

  private async handleUpdate(
    params: TestPriceDataParams | undefined,
    payload: DashboardRequestPayload,
  ): Promise<DashboardActionResult> {
    if (!params?.id) {
      return buildDashboardError('MISSING_ID', 'Price data ID is required');
    }

    const data = payload.params as unknown as UpdateTestPriceDataParams;

    try {
      const updateData: UpdateTestPriceData = {};

      if (data.symbol !== undefined) updateData.symbol = data.symbol;
      if (data.price_timestamp !== undefined)
        updateData.price_timestamp = data.price_timestamp;
      if (data.open !== undefined) updateData.open = data.open;
      if (data.high !== undefined) updateData.high = data.high;
      if (data.low !== undefined) updateData.low = data.low;
      if (data.close !== undefined) updateData.close = data.close;
      if (data.volume !== undefined) updateData.volume = data.volume;
      if (data.metadata !== undefined) updateData.metadata = data.metadata;

      const priceData = await this.testPriceDataRepository.update(
        params.id,
        updateData,
      );
      return buildDashboardSuccess(priceData);
    } catch (error) {
      this.logger.error(
        `Failed to update test price data: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'UPDATE_FAILED',
        error instanceof Error
          ? error.message
          : 'Failed to update test price data',
      );
    }
  }

  private async handleDelete(
    params?: TestPriceDataParams,
  ): Promise<DashboardActionResult> {
    if (!params?.id) {
      return buildDashboardError('MISSING_ID', 'Price data ID is required');
    }

    try {
      await this.testPriceDataRepository.delete(params.id);
      return buildDashboardSuccess({ deleted: true, id: params.id });
    } catch (error) {
      this.logger.error(
        `Failed to delete test price data: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'DELETE_FAILED',
        error instanceof Error
          ? error.message
          : 'Failed to delete test price data',
      );
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Bulk Operations
  // ═══════════════════════════════════════════════════════════════════════════

  private async handleBulkCreate(
    context: ExecutionContext,
    payload: DashboardRequestPayload,
  ): Promise<DashboardActionResult> {
    const data = payload.params as unknown as BulkCreateParams;

    if (!data.priceData || !Array.isArray(data.priceData)) {
      return buildDashboardError(
        'INVALID_DATA',
        'priceData array is required for bulk create',
      );
    }

    try {
      const createDataList: CreateTestPriceData[] = data.priceData.map(
        (item) => ({
          organization_slug: context.orgSlug,
          scenario_id: item.scenario_id,
          symbol: item.symbol,
          price_timestamp: item.price_timestamp,
          open: item.open,
          high: item.high,
          low: item.low,
          close: item.close,
          volume: item.volume,
          metadata: item.metadata ?? {},
        }),
      );

      const result =
        await this.testPriceDataRepository.bulkCreate(createDataList);
      return buildDashboardSuccess(result);
    } catch (error) {
      this.logger.error(
        `Failed to bulk create test price data: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'BULK_CREATE_FAILED',
        error instanceof Error
          ? error.message
          : 'Failed to bulk create test price data',
      );
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Query Operations
  // ═══════════════════════════════════════════════════════════════════════════

  private async handleGetLatest(
    context: ExecutionContext,
    params?: TestPriceDataParams,
  ): Promise<DashboardActionResult> {
    const symbol = params?.symbol || params?.filters?.symbol;

    if (!symbol) {
      return buildDashboardError(
        'MISSING_SYMBOL',
        'Symbol is required for get-latest',
      );
    }

    try {
      const priceData = await this.testPriceDataRepository.findLatestPrice(
        symbol,
        context.orgSlug,
      );

      if (!priceData) {
        return buildDashboardError(
          'NOT_FOUND',
          `No price data found for symbol: ${symbol}`,
        );
      }

      return buildDashboardSuccess(priceData);
    } catch (error) {
      this.logger.error(
        `Failed to get latest price: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'GET_LATEST_FAILED',
        error instanceof Error ? error.message : 'Failed to get latest price',
      );
    }
  }

  private async handleGetByDateRange(
    context: ExecutionContext,
    params?: TestPriceDataParams,
  ): Promise<DashboardActionResult> {
    const symbol = params?.filters?.symbol;
    const startDate = params?.filters?.startDate;
    const endDate = params?.filters?.endDate;

    if (!symbol || !startDate || !endDate) {
      return buildDashboardError(
        'MISSING_PARAMS',
        'symbol, startDate, and endDate are required for get-by-date-range',
      );
    }

    try {
      const priceData = await this.testPriceDataRepository.findByDateRange(
        symbol,
        context.orgSlug,
        startDate,
        endDate,
      );

      return buildDashboardSuccess(
        priceData,
        buildPaginationMetadata(priceData.length, 1, priceData.length),
      );
    } catch (error) {
      this.logger.error(
        `Failed to get price data by date range: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'GET_BY_DATE_RANGE_FAILED',
        error instanceof Error
          ? error.message
          : 'Failed to get price data by date range',
      );
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Count Operations
  // ═══════════════════════════════════════════════════════════════════════════

  private async handleCountByScenario(
    params?: TestPriceDataParams,
  ): Promise<DashboardActionResult> {
    const scenarioId = params?.filters?.scenarioId;

    if (!scenarioId) {
      return buildDashboardError(
        'MISSING_SCENARIO_ID',
        'scenarioId is required for count-by-scenario',
      );
    }

    try {
      const count =
        await this.testPriceDataRepository.countByScenario(scenarioId);
      return buildDashboardSuccess({ scenario_id: scenarioId, count });
    } catch (error) {
      this.logger.error(
        `Failed to count price data by scenario: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'COUNT_FAILED',
        error instanceof Error
          ? error.message
          : 'Failed to count price data by scenario',
      );
    }
  }

  private async handleCountBySymbol(
    context: ExecutionContext,
    params?: TestPriceDataParams,
  ): Promise<DashboardActionResult> {
    const symbol = params?.filters?.symbol || params?.symbol;

    if (!symbol) {
      return buildDashboardError(
        'MISSING_SYMBOL',
        'symbol is required for count-by-symbol',
      );
    }

    try {
      const count = await this.testPriceDataRepository.countBySymbol(
        symbol,
        context.orgSlug,
      );
      return buildDashboardSuccess({ symbol, count });
    } catch (error) {
      this.logger.error(
        `Failed to count price data by symbol: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'COUNT_FAILED',
        error instanceof Error
          ? error.message
          : 'Failed to count price data by symbol',
      );
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Bulk Delete Operations
  // ═══════════════════════════════════════════════════════════════════════════

  private async handleDeleteByScenario(
    params?: TestPriceDataParams,
  ): Promise<DashboardActionResult> {
    const scenarioId = params?.filters?.scenarioId;

    if (!scenarioId) {
      return buildDashboardError(
        'MISSING_SCENARIO_ID',
        'scenarioId is required for delete-by-scenario',
      );
    }

    try {
      const deletedCount =
        await this.testPriceDataRepository.deleteByScenario(scenarioId);
      return buildDashboardSuccess({
        deleted: true,
        scenario_id: scenarioId,
        deleted_count: deletedCount,
      });
    } catch (error) {
      this.logger.error(
        `Failed to delete price data by scenario: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'DELETE_BY_SCENARIO_FAILED',
        error instanceof Error
          ? error.message
          : 'Failed to delete price data by scenario',
      );
    }
  }

  private async handleDeleteBySymbol(
    context: ExecutionContext,
    params?: TestPriceDataParams,
  ): Promise<DashboardActionResult> {
    const symbol = params?.filters?.symbol || params?.symbol;

    if (!symbol) {
      return buildDashboardError(
        'MISSING_SYMBOL',
        'symbol is required for delete-by-symbol',
      );
    }

    try {
      const deletedCount = await this.testPriceDataRepository.deleteBySymbol(
        symbol,
        context.orgSlug,
      );
      return buildDashboardSuccess({
        deleted: true,
        symbol,
        deleted_count: deletedCount,
      });
    } catch (error) {
      this.logger.error(
        `Failed to delete price data by symbol: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildDashboardError(
        'DELETE_BY_SYMBOL_FAILED',
        error instanceof Error
          ? error.message
          : 'Failed to delete price data by symbol',
      );
    }
  }
}
