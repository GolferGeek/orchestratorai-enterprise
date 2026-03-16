/**
 * Prediction Export Service
 *
 * Sprint 7 Task s7-3: Prediction export endpoint
 * PRD Phase 8.3: Prediction Data Export
 *
 * Provides export functionality for predictions in CSV and JSON formats.
 */

import { Inject, Injectable, Logger } from '@nestjs/common';
import { DATABASE_SERVICE, DatabaseService } from '@/database';
import { ExecutionContext } from '@orchestrator-ai/transport-types';

// ═══════════════════════════════════════════════════════════════════════════
// SUPABASE RESPONSE TYPE
// ═══════════════════════════════════════════════════════════════════════════

type SupabaseSelectListResponse<T> = {
  data: T[] | null;
  error: { message: string } | null;
};

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Export format options
 */
export type ExportFormat = 'csv' | 'json';

/**
 * Export options for predictions
 */
export interface PredictionExportOptions {
  format: ExportFormat;
  startDate?: string;
  endDate?: string;
  targetId?: string;
  universeId?: string;
  status?: string;
  includeTest?: boolean;
  limit?: number;
}

/**
 * Export result
 */
export interface ExportResult {
  data: string;
  filename: string;
  contentType: string;
  recordCount: number;
}

/**
 * Prediction record for export
 */
interface PredictionRecord {
  id: string;
  target_id: string;
  signal_id: string;
  direction: string;
  confidence: number;
  entry_price: number | null;
  target_price: number | null;
  stop_loss_price: number | null;
  timeframe_minutes: number;
  status: string;
  outcome: string | null;
  outcome_price: number | null;
  outcome_at: string | null;
  generated_at: string;
  expires_at: string;
  is_test: boolean;
  metadata: Record<string, unknown>;
  // Joined fields
  target_symbol?: string;
  target_name?: string;
  universe_name?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// SERVICE
// ═══════════════════════════════════════════════════════════════════════════

@Injectable()
export class PredictionExportService {
  private readonly logger = new Logger(PredictionExportService.name);
  private readonly schema = 'prediction';

  constructor(@Inject(DATABASE_SERVICE) private readonly db: DatabaseService) {}

  // ═══════════════════════════════════════════════════════════════════════════
  // EXPORT METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Export predictions based on options
   *
   * @param ctx - Execution context
   * @param options - Export options
   * @returns Export result with data, filename, and content type
   */
  async exportPredictions(
    ctx: ExecutionContext,
    options: PredictionExportOptions,
  ): Promise<ExportResult> {
    this.logger.log(
      `Exporting predictions for org ${ctx.orgSlug} with format ${options.format}`,
    );

    // Build query
    let query = this.db
      .from(this.schema, 'predictions')
      .select(
        `
        id,
        target_id,
        signal_id,
        direction,
        confidence,
        entry_price,
        target_price,
        stop_loss_price,
        timeframe_minutes,
        status,
        outcome,
        outcome_price,
        outcome_at,
        generated_at,
        expires_at,
        is_test,
        metadata,
        targets!inner (
          symbol,
          name,
          universes!inner (
            name
          )
        )
      `,
      )
      .order('generated_at', { ascending: false });

    // Apply filters
    if (options.startDate) {
      query = query.gte('generated_at', options.startDate);
    }

    if (options.endDate) {
      query = query.lte('generated_at', options.endDate);
    }

    if (options.targetId) {
      query = query.eq('target_id', options.targetId);
    }

    if (options.status) {
      query = query.eq('status', options.status);
    }

    if (!options.includeTest) {
      query = query.eq('is_test', false);
    }

    if (options.limit) {
      query = query.limit(options.limit);
    } else {
      query = query.limit(10000); // Default max
    }

    const { data, error } = (await query) as SupabaseSelectListResponse<
      PredictionRecord & {
        targets: {
          symbol: string;
          name: string;
          universes: { name: string };
        };
      }
    >;

    if (error) {
      this.logger.error(
        `Failed to fetch predictions for export: ${error.message}`,
      );
      throw new Error(`Failed to fetch predictions: ${error.message}`);
    }

    const predictions = data ?? [];

    // Flatten the joined data
    const flattenedPredictions = predictions.map((p) => ({
      id: p.id,
      target_id: p.target_id,
      target_symbol: p.targets?.symbol,
      target_name: p.targets?.name,
      universe_name: p.targets?.universes?.name,
      signal_id: p.signal_id,
      direction: p.direction,
      confidence: p.confidence,
      entry_price: p.entry_price,
      target_price: p.target_price,
      stop_loss_price: p.stop_loss_price,
      timeframe_minutes: p.timeframe_minutes,
      status: p.status,
      outcome: p.outcome,
      outcome_price: p.outcome_price,
      outcome_at: p.outcome_at,
      generated_at: p.generated_at,
      expires_at: p.expires_at,
      is_test: p.is_test,
    }));

    // Generate export based on format
    if (options.format === 'csv') {
      return this.generateCsvExport(flattenedPredictions, options);
    } else {
      return this.generateJsonExport(flattenedPredictions, options);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FORMAT GENERATORS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Generate CSV export
   */
  private generateCsvExport(
    predictions: Array<Record<string, unknown>>,
    options: PredictionExportOptions,
  ): ExportResult {
    if (predictions.length === 0) {
      return {
        data: '',
        filename: this.generateFilename('csv', options),
        contentType: 'text/csv',
        recordCount: 0,
      };
    }

    // Get headers from first record
    const headers = Object.keys(predictions[0]!);

    // Build CSV
    const csvRows: string[] = [];

    // Header row
    csvRows.push(headers.join(','));

    // Data rows
    for (const prediction of predictions) {
      const values = headers.map((header) => {
        const value = prediction[header];
        if (value === null || value === undefined) {
          return '';
        }
        if (typeof value === 'string') {
          // Escape quotes and wrap in quotes if contains comma or quote
          if (
            value.includes(',') ||
            value.includes('"') ||
            value.includes('\n')
          ) {
            return `"${value.replace(/"/g, '""')}"`;
          }
          return value;
        }
        if (typeof value === 'object') {
          return JSON.stringify(value);
        }
        if (typeof value === 'number' || typeof value === 'boolean') {
          return String(value);
        }
        return String(value as string | number | boolean);
      });
      csvRows.push(values.join(','));
    }

    return {
      data: csvRows.join('\n'),
      filename: this.generateFilename('csv', options),
      contentType: 'text/csv',
      recordCount: predictions.length,
    };
  }

  /**
   * Generate JSON export
   */
  private generateJsonExport(
    predictions: Array<Record<string, unknown>>,
    options: PredictionExportOptions,
  ): ExportResult {
    const exportData = {
      exportedAt: new Date().toISOString(),
      filters: {
        startDate: options.startDate,
        endDate: options.endDate,
        targetId: options.targetId,
        universeId: options.universeId,
        status: options.status,
        includeTest: options.includeTest,
      },
      recordCount: predictions.length,
      predictions,
    };

    return {
      data: JSON.stringify(exportData, null, 2),
      filename: this.generateFilename('json', options),
      contentType: 'application/json',
      recordCount: predictions.length,
    };
  }

  /**
   * Generate filename for export
   */
  private generateFilename(
    format: ExportFormat,
    options: PredictionExportOptions,
  ): string {
    const timestamp = new Date().toISOString().split('T')[0];
    const parts = ['predictions'];

    if (options.targetId) {
      parts.push(`target-${options.targetId.slice(0, 8)}`);
    }

    if (options.status) {
      parts.push(options.status);
    }

    parts.push(timestamp!);

    return `${parts.join('-')}.${format}`;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SIGNAL EXPORT
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Export signals for a target
   *
   * @param ctx - Execution context
   * @param options - Export options
   * @returns Export result
   */
  async exportSignals(
    ctx: ExecutionContext,
    options: {
      format: ExportFormat;
      targetId?: string;
      sourceId?: string;
      startDate?: string;
      endDate?: string;
      includeTest?: boolean;
      limit?: number;
    },
  ): Promise<ExportResult> {
    this.logger.log(
      `Exporting signals for org ${ctx.orgSlug} with format ${options.format}`,
    );

    let query = this.db
      .from(this.schema, 'signals')
      .select('*')
      .order('detected_at', { ascending: false });

    if (options.targetId) {
      query = query.eq('target_id', options.targetId);
    }

    if (options.sourceId) {
      query = query.eq('source_id', options.sourceId);
    }

    if (options.startDate) {
      query = query.gte('detected_at', options.startDate);
    }

    if (options.endDate) {
      query = query.lte('detected_at', options.endDate);
    }

    if (!options.includeTest) {
      query = query.eq('is_test', false);
    }

    if (options.limit) {
      query = query.limit(options.limit);
    } else {
      query = query.limit(10000);
    }

    const { data, error } = (await query) as SupabaseSelectListResponse<
      Record<string, unknown>
    >;

    if (error) {
      this.logger.error(`Failed to fetch signals for export: ${error.message}`);
      throw new Error(`Failed to fetch signals: ${error.message}`);
    }

    const signals = data ?? [];
    const timestamp = new Date().toISOString().split('T')[0];

    if (options.format === 'csv') {
      return this.generateCsvExport(signals, {
        ...options,
        format: 'csv',
      });
    } else {
      return {
        data: JSON.stringify(
          {
            exportedAt: new Date().toISOString(),
            recordCount: signals.length,
            signals,
          },
          null,
          2,
        ),
        filename: `signals-${timestamp}.json`,
        contentType: 'application/json',
        recordCount: signals.length,
      };
    }
  }
}
