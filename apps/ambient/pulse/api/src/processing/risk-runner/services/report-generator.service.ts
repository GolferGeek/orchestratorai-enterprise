/**
 * Report Generator Service
 *
 * Manages PDF report generation, storage, and retrieval.
 * Actual PDF rendering is delegated to a separate process/worker.
 */

import { Inject, Injectable, Logger } from '@nestjs/common';
import { DATABASE_SERVICE, DatabaseService } from '@/database';
import {
  asArray,
  asNumber,
  asPostgrestResult,
  asRecord,
  asString,
  isRecord,
} from '../utils/safe-access';

export interface ReportConfig {
  includeExecutiveSummary: boolean;
  includeHeatmap: boolean;
  includeSubjectDetails: boolean;
  includeCorrelations: boolean;
  includeTrends: boolean;
  includeDimensionAnalysis: boolean;
  dateRange?: { start: string; end: string };
  subjectFilter?: string[];
}

export interface Report {
  id: string;
  scope_id: string;
  title: string;
  report_type: string;
  config: ReportConfig;
  status: 'pending' | 'generating' | 'completed' | 'failed';
  file_path: string | null;
  file_size: number | null;
  download_url: string | null;
  download_expires_at: string | null;
  error_message: string | null;
  generated_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface GenerateReportInput {
  scopeId: string;
  title: string;
  reportType?: 'comprehensive' | 'executive' | 'detailed';
  config: Partial<ReportConfig>;
  createdBy?: string;
}

@Injectable()
export class ReportGeneratorService {
  private readonly logger = new Logger(ReportGeneratorService.name);
  private readonly schema = 'risk';

  constructor(@Inject(DATABASE_SERVICE) private readonly db: DatabaseService) {}

  /**
   * Create a report request and start generation
   */
  async generateReport(input: GenerateReportInput): Promise<Report> {
    const {
      scopeId,
      title,
      reportType = 'comprehensive',
      config,
      createdBy,
    } = input;

    this.logger.log(`Creating report request: "${title}" for scope ${scopeId}`);

    // Merge with default config based on report type
    const fullConfig = this.buildConfig(reportType, config);

    // Create report record in pending state
    const result = asPostgrestResult(
      await this.db
        .from(this.schema, 'reports')
        .insert({
          scope_id: scopeId,
          title,
          report_type: reportType,
          config: fullConfig,
          status: 'pending',
          created_by: createdBy || null,
        })
        .select()
        .single(),
    );
    const report = asRecord(result.data) as Report | null;

    if (result.error?.message || !report) {
      this.logger.error(
        `Failed to create report: ${result.error?.message || 'Unknown error'}`,
      );
      throw new Error(result.error?.message || 'Failed to create report');
    }

    // Start async report generation
    // In a production system, this would be dispatched to a worker queue
    this.startGeneration(report.id).catch((err) => {
      this.logger.error(
        `Report generation failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    });

    return report;
  }

  /**
   * Get report by ID
   */
  async getReport(id: string): Promise<Report | null> {
    const result = asPostgrestResult(
      await this.db
        .from(this.schema, 'reports')
        .select('*')
        .eq('id', id)
        .single(),
    );

    if (result.error?.message && result.error.code !== 'PGRST116') {
      this.logger.error(`Failed to get report: ${result.error.message}`);
      throw new Error(result.error.message);
    }

    return (asRecord(result.data) as Report | null) ?? null;
  }

  /**
   * List reports for a scope
   */
  async listReports(
    scopeId: string,
    options?: { limit?: number; status?: string },
  ): Promise<Report[]> {
    let query = this.db
      .from(this.schema, 'reports')
      .select('*')
      .eq('scope_id', scopeId)
      .order('created_at', { ascending: false });

    if (options?.status) {
      query = query.eq('status', options.status);
    }

    if (options?.limit) {
      query = query.limit(options.limit);
    }

    const result = asPostgrestResult(await query);

    if (result.error?.message) {
      this.logger.error(`Failed to list reports: ${result.error.message}`);
      throw new Error(result.error.message);
    }

    return (asArray(result.data) ?? []).filter(isRecord) as unknown as Report[];
  }

  /**
   * Delete a report
   */
  async deleteReport(id: string): Promise<void> {
    // First get the report to check for file cleanup
    const report = await this.getReport(id);
    if (report?.file_path) {
      // TODO: Delete file from storage
      this.logger.debug(`Would delete file: ${report.file_path}`);
    }

    const { error } = await this.db
      .from(this.schema, 'reports')
      .delete()
      .eq('id', id);

    if (error) {
      this.logger.error(`Failed to delete report: ${error.message}`);
      throw new Error(`Failed to delete report: ${error.message}`);
    }
  }

  /**
   * Refresh download URL for a report
   */
  async refreshDownloadUrl(id: string): Promise<string | null> {
    const report = await this.getReport(id);
    if (!report || report.status !== 'completed' || !report.file_path) {
      return null;
    }

    // Generate presigned URL
    // In production, this would use the actual storage service
    const downloadUrl = this.generatePresignedUrl(report.file_path);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour

    await this.db
      .from(this.schema, 'reports')
      .update({
        download_url: downloadUrl,
        download_expires_at: expiresAt,
      })
      .eq('id', id);

    return downloadUrl;
  }

  /**
   * Build full config based on report type
   */
  private buildConfig(
    reportType: string,
    partialConfig: Partial<ReportConfig>,
  ): ReportConfig {
    const defaults: Record<string, ReportConfig> = {
      comprehensive: {
        includeExecutiveSummary: true,
        includeHeatmap: true,
        includeSubjectDetails: true,
        includeCorrelations: true,
        includeTrends: true,
        includeDimensionAnalysis: true,
      },
      executive: {
        includeExecutiveSummary: true,
        includeHeatmap: true,
        includeSubjectDetails: false,
        includeCorrelations: false,
        includeTrends: true,
        includeDimensionAnalysis: false,
      },
      detailed: {
        includeExecutiveSummary: false,
        includeHeatmap: true,
        includeSubjectDetails: true,
        includeCorrelations: true,
        includeTrends: true,
        includeDimensionAnalysis: true,
      },
    };

    const base: ReportConfig = (defaults[reportType] ??
      defaults.comprehensive) as ReportConfig;

    // Create result with explicit type
    const result: ReportConfig = {
      includeExecutiveSummary:
        partialConfig.includeExecutiveSummary ?? base.includeExecutiveSummary,
      includeHeatmap: partialConfig.includeHeatmap ?? base.includeHeatmap,
      includeSubjectDetails:
        partialConfig.includeSubjectDetails ?? base.includeSubjectDetails,
      includeCorrelations:
        partialConfig.includeCorrelations ?? base.includeCorrelations,
      includeTrends: partialConfig.includeTrends ?? base.includeTrends,
      includeDimensionAnalysis:
        partialConfig.includeDimensionAnalysis ?? base.includeDimensionAnalysis,
      dateRange: partialConfig.dateRange ?? base.dateRange,
      subjectFilter: partialConfig.subjectFilter ?? base.subjectFilter,
    };

    return result;
  }

  /**
   * Start async report generation
   */
  private async startGeneration(reportId: string): Promise<void> {
    this.logger.log(`Starting report generation for ${reportId}`);

    try {
      // Update status to generating
      await this.updateStatus(reportId, 'generating');

      // Get report details
      const report = await this.getReport(reportId);
      if (!report) {
        throw new Error('Report not found');
      }

      // Gather data for the report
      const reportData = await this.gatherReportData(report);

      // Generate HTML content
      const htmlContent = this.generateHtmlContent(report, reportData);

      // In production, this would:
      // 1. Render HTML to PDF using Puppeteer
      // 2. Upload PDF to storage
      // 3. Generate presigned URL

      // For now, we'll simulate completion
      const filePath = `reports/${report.scope_id}/${reportId}.pdf`;
      const downloadUrl = this.generatePresignedUrl(filePath);

      // Update report as completed
      await this.db
        .from(this.schema, 'reports')
        .update({
          status: 'completed',
          file_path: filePath,
          file_size: htmlContent.length * 2, // Approximate
          download_url: downloadUrl,
          download_expires_at: new Date(
            Date.now() + 60 * 60 * 1000,
          ).toISOString(),
          generated_at: new Date().toISOString(),
        })
        .eq('id', reportId);

      this.logger.log(`Report generation completed for ${reportId}`);
    } catch (error) {
      this.logger.error(
        `Report generation failed for ${reportId}: ${error instanceof Error ? error.message : String(error)}`,
      );

      await this.db
        .from(this.schema, 'reports')
        .update({
          status: 'failed',
          error_message:
            error instanceof Error ? error.message : 'Unknown error',
        })
        .eq('id', reportId);
    }
  }

  /**
   * Update report status
   */
  private async updateStatus(
    reportId: string,
    status: Report['status'],
  ): Promise<void> {
    await this.db
      .from(this.schema, 'reports')
      .update({ status })
      .eq('id', reportId);
  }

  /**
   * Gather all data needed for the report
   */
  private async gatherReportData(
    report: Report,
  ): Promise<Record<string, unknown>> {
    const data: Record<string, unknown> = {};

    // Get scope info
    const scopeResult = asPostgrestResult(
      await this.db
        .from(this.schema, 'scopes')
        .select('*')
        .eq('id', report.scope_id)
        .single(),
    );
    data.scope = asRecord(scopeResult.data) ?? null;

    // Get portfolio aggregate
    if (report.config.includeExecutiveSummary || report.config.includeTrends) {
      const aggregateResult = asPostgrestResult(
        await this.db
          .from(this.schema, 'portfolio_aggregate')
          .select('*')
          .eq('scope_id', report.scope_id)
          .single(),
      );
      data.portfolioAggregate = asRecord(aggregateResult.data) ?? null;
    }

    // Get heatmap data
    if (report.config.includeHeatmap) {
      const heatmapResult = asPostgrestResult(
        await this.db.rpc(
          'get_heatmap_data',
          {
            p_scope_id: report.scope_id,
            p_risk_level: null,
          },
          this.schema,
        ),
      );
      data.heatmap = asArray(heatmapResult.data) ?? [];
    }

    // Get subject details
    if (report.config.includeSubjectDetails) {
      const subjectsResult = asPostgrestResult(
        await this.db
          .from(this.schema, 'subjects')
          .select(
            `
            *,
            composite_scores(*)
          `,
          )
          .eq('scope_id', report.scope_id)
          .eq('is_active', true),
      );
      data.subjects = (asArray(subjectsResult.data) ?? []).filter(isRecord);
    }

    // Get correlations
    if (report.config.includeCorrelations) {
      const correlationsResult = asPostgrestResult(
        await this.db.rpc(
          'calculate_correlations',
          {
            p_scope_id: report.scope_id,
          },
          this.schema,
        ),
      );
      data.correlations = (asArray(correlationsResult.data) ?? []).filter(
        isRecord,
      );
    }

    // Get dimensions
    if (report.config.includeDimensionAnalysis) {
      const dimensionsResult = asPostgrestResult(
        await this.db
          .from(this.schema, 'dimensions')
          .select('*')
          .eq('scope_id', report.scope_id)
          .order('display_order'),
      );
      data.dimensions = (asArray(dimensionsResult.data) ?? []).filter(isRecord);

      const contributionsResult = asPostgrestResult(
        await this.db
          .from(this.schema, 'dimension_contribution')
          .select('*')
          .eq('scope_id', report.scope_id),
      );
      data.dimensionContributions = (
        asArray(contributionsResult.data) ?? []
      ).filter(isRecord);
    }

    return data;
  }

  /**
   * Generate HTML content for PDF rendering
   */
  private generateHtmlContent(
    report: Report,
    data: Record<string, unknown>,
  ): string {
    const scope = asRecord(data['scope']) ?? {};
    const aggregate = asRecord(data['portfolioAggregate']) ?? {};
    const subjects = (asArray(data['subjects']) ?? []).filter(isRecord);
    const dimensionContributions = (
      asArray(data['dimensionContributions']) ?? []
    ).filter(isRecord);
    const subjectRowsHtml = subjects
      .map((s) => {
        const scores = asArray(s['composite_scores']) ?? [];
        const firstScore = scores.find(isRecord) ?? {};
        const overallScore = asNumber(firstScore['overall_score']) ?? 0;
        const subjectName = asString(s['name']) ?? '';
        return `
        <tr>
          <td>${subjectName}</td>
          <td>${(overallScore * 100).toFixed(1)}%</td>
          <td class="${this.getRiskClass(overallScore)}">
            ${this.getRiskLevel(overallScore)}
          </td>
        </tr>
      `;
      })
      .join('');
    const dimensionRowsHtml = dimensionContributions
      .map((d) => {
        const name = asString(d['dimension_name']) ?? '';
        const weight = asNumber(d['weight']) ?? 0;
        const avgScore = asNumber(d['avg_score']) ?? 0;
        const contrib = asNumber(d['weighted_contribution']) ?? 0;
        return `
        <tr>
          <td>${name}</td>
          <td>${(weight * 100).toFixed(0)}%</td>
          <td>${(avgScore * 100).toFixed(1)}%</td>
          <td>${(contrib * 100).toFixed(1)}%</td>
        </tr>
      `;
      })
      .join('');

    // Generate HTML report structure
    // In production, this would use a proper template engine
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${report.title}</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 40px; }
    h1 { color: #1a1a2e; }
    h2 { color: #16213e; margin-top: 30px; }
    .header { border-bottom: 2px solid #0f3460; padding-bottom: 20px; margin-bottom: 30px; }
    .metric { display: inline-block; margin: 10px 20px 10px 0; }
    .metric-value { font-size: 24px; font-weight: bold; color: #e94560; }
    .metric-label { font-size: 12px; color: #666; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th, td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
    th { background: #f5f5f5; }
    .risk-critical { color: #dc2626; }
    .risk-high { color: #ea580c; }
    .risk-medium { color: #f59e0b; }
    .risk-low { color: #10b981; }
    .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="header">
    <h1>${report.title}</h1>
    <p>Scope: ${asString(scope['name']) ?? 'Unknown'} | Generated: ${new Date().toLocaleDateString()}</p>
  </div>

  ${
    report.config.includeExecutiveSummary
      ? `
  <h2>Executive Summary</h2>
  <div class="metrics">
    <div class="metric">
      <div class="metric-value">${((asNumber(aggregate['avg_score']) ?? 0) * 100).toFixed(1)}%</div>
      <div class="metric-label">Average Risk</div>
    </div>
    <div class="metric">
      <div class="metric-value">${asNumber(aggregate['subject_count']) ?? 0}</div>
      <div class="metric-label">Total Subjects</div>
    </div>
    <div class="metric">
      <div class="metric-value">${asNumber(aggregate['critical_count']) ?? 0}</div>
      <div class="metric-label">Critical Risk</div>
    </div>
    <div class="metric">
      <div class="metric-value">${asNumber(aggregate['high_count']) ?? 0}</div>
      <div class="metric-label">High Risk</div>
    </div>
  </div>
  `
      : ''
  }

  ${
    report.config.includeHeatmap
      ? `
  <h2>Risk Heatmap</h2>
  <p>Visual risk matrix showing subjects × dimensions. (Chart would be rendered here)</p>
  `
      : ''
  }

  ${
    report.config.includeSubjectDetails
      ? `
  <h2>Subject Details</h2>
  <table>
    <thead>
      <tr>
        <th>Subject</th>
        <th>Overall Risk</th>
        <th>Status</th>
      </tr>
    </thead>
    <tbody>
      ${subjectRowsHtml}
    </tbody>
  </table>
  `
      : ''
  }

  ${
    report.config.includeCorrelations
      ? `
  <h2>Dimension Correlations</h2>
  <p>Correlation analysis would be displayed here.</p>
  `
      : ''
  }

  ${
    report.config.includeDimensionAnalysis
      ? `
  <h2>Dimension Analysis</h2>
  <table>
    <thead>
      <tr>
        <th>Dimension</th>
        <th>Weight</th>
        <th>Avg Score</th>
        <th>Contribution</th>
      </tr>
    </thead>
    <tbody>
      ${dimensionRowsHtml}
    </tbody>
  </table>
  `
      : ''
  }

  <div class="footer">
    <p>Report generated by Risk Analysis Agent | ${new Date().toISOString()}</p>
    <p>Report ID: ${report.id}</p>
  </div>
</body>
</html>
    `.trim();
  }

  /**
   * Get risk level label
   */
  private getRiskLevel(score: number): string {
    if (score >= 0.7) return 'Critical';
    if (score >= 0.5) return 'High';
    if (score >= 0.3) return 'Medium';
    return 'Low';
  }

  /**
   * Get CSS class for risk level
   */
  private getRiskClass(score: number): string {
    if (score >= 0.7) return 'risk-critical';
    if (score >= 0.5) return 'risk-high';
    if (score >= 0.3) return 'risk-medium';
    return 'risk-low';
  }

  /**
   * Generate a presigned URL for file download
   */
  private generatePresignedUrl(filePath: string): string {
    // In production, this would use the actual storage service
    // For now, return a placeholder URL
    return `https://storage.example.com/${filePath}?token=presigned-${Date.now()}`;
  }
}
