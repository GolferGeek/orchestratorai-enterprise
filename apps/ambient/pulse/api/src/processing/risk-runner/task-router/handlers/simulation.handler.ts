/**
 * Simulation Handler
 *
 * Dashboard handler for Monte Carlo simulations and Live Data sources.
 * Part of Phase 7: Advanced Simulation features.
 */

import { Injectable, Logger } from '@nestjs/common';
import type { ExecutionContext } from '@orchestrator-ai/transport-types';
import type { DashboardRequestPayload } from '@orchestrator-ai/transport-types';
import {
  DashboardActionResult,
  IDashboardHandler,
  buildDashboardSuccess,
  buildDashboardError,
} from '../dashboard-handler.interface';
import {
  MonteCarloService,
  type SimulationParameters,
} from '../../services/monte-carlo.service';
import {
  LiveDataService,
  type CreateDataSourceParams,
  type DataSourceType,
} from '../../services/live-data.service';

@Injectable()
export class SimulationHandler implements IDashboardHandler {
  private readonly logger = new Logger(SimulationHandler.name);

  constructor(
    private readonly monteCarloService: MonteCarloService,
    private readonly liveDataService: LiveDataService,
  ) {}

  /**
   * Get supported actions
   */
  getSupportedActions(): string[] {
    return [
      // Monte Carlo Simulation actions
      'run-simulation',
      'get-simulation',
      'list-simulations',
      'delete-simulation',
      'get-distribution-templates',
      // Data Source actions
      'create-source',
      'get-source',
      'list-sources',
      'update-source',
      'delete-source',
      'fetch-source',
      'get-fetch-history',
      'get-health-summary',
      'get-due-sources',
    ];
  }

  /**
   * Execute a simulation action
   */
  async execute(
    action: string,
    payload: DashboardRequestPayload,
    context: ExecutionContext,
  ): Promise<DashboardActionResult> {
    this.logger.debug(
      `[SIMULATION-HANDLER] Executing action: ${action} for org: ${context.orgSlug}`,
    );

    try {
      switch (action) {
        // Monte Carlo Simulation actions
        case 'run-simulation':
          return await this.runSimulation(payload, context);
        case 'get-simulation':
          return await this.getSimulation(payload);
        case 'list-simulations':
          return await this.listSimulations(payload);
        case 'delete-simulation':
          return await this.deleteSimulation(payload);
        case 'get-distribution-templates':
          return this.getDistributionTemplates();

        // Data Source actions
        case 'create-source':
          return await this.createDataSource(payload, context);
        case 'get-source':
          return await this.getDataSource(payload);
        case 'list-sources':
          return await this.listDataSources(payload);
        case 'update-source':
          return await this.updateDataSource(payload);
        case 'delete-source':
          return await this.deleteDataSource(payload);
        case 'fetch-source':
          return await this.fetchDataSource(payload);
        case 'get-fetch-history':
          return await this.getFetchHistory(payload);
        case 'get-health-summary':
          return await this.getHealthSummary(payload);
        case 'get-due-sources':
          return await this.getDueSources();

        default:
          return buildDashboardError(
            'UNSUPPORTED_ACTION',
            `Unsupported simulation action: ${action}`,
            { supportedActions: this.getSupportedActions() },
          );
      }
    } catch (error) {
      this.logger.error(
        `[SIMULATION-HANDLER] Error executing ${action}: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      return buildDashboardError(
        'HANDLER_ERROR',
        error instanceof Error ? error.message : 'Unknown error',
      );
    }
  }

  // ==========================================
  // Monte Carlo Simulation Actions
  // ==========================================

  /**
   * Run a Monte Carlo simulation
   */
  private async runSimulation(
    payload: DashboardRequestPayload,
    _context: ExecutionContext,
  ): Promise<DashboardActionResult> {
    const { scopeId, name, parameters, iterations, subjectId, description } =
      (payload.params ?? {}) as unknown as {
        scopeId: string;
        name: string;
        parameters: SimulationParameters;
        iterations?: number;
        subjectId?: string;
        description?: string;
      };

    if (!scopeId) {
      return buildDashboardError('MISSING_PARAM', 'scopeId is required');
    }
    if (!name) {
      return buildDashboardError('MISSING_PARAM', 'name is required');
    }
    if (!parameters?.dimensionDistributions) {
      return buildDashboardError(
        'MISSING_PARAM',
        'parameters.dimensionDistributions is required',
      );
    }

    const simulation = await this.monteCarloService.runSimulation(
      scopeId,
      name,
      parameters,
      iterations || 10000,
      subjectId,
      description,
    );

    return buildDashboardSuccess(simulation, {
      action: 'run-simulation',
      iterations: simulation.iterations,
      executionTimeMs: simulation.results?.executionTimeMs,
    });
  }

  /**
   * Get a simulation by ID
   */
  private async getSimulation(
    payload: DashboardRequestPayload,
  ): Promise<DashboardActionResult> {
    const { simulationId } = payload.params as { simulationId: string };

    if (!simulationId) {
      return buildDashboardError('MISSING_PARAM', 'simulationId is required');
    }

    const simulation = await this.monteCarloService.getSimulation(simulationId);

    if (!simulation) {
      return buildDashboardError(
        'NOT_FOUND',
        `Simulation not found: ${simulationId}`,
      );
    }

    return buildDashboardSuccess(simulation);
  }

  /**
   * List simulations for a scope
   */
  private async listSimulations(
    payload: DashboardRequestPayload,
  ): Promise<DashboardActionResult> {
    const { scopeId, subjectId, status, limit, offset } = payload.params as {
      scopeId: string;
      subjectId?: string;
      status?: 'pending' | 'running' | 'completed' | 'failed';
      limit?: number;
      offset?: number;
    };

    if (!scopeId) {
      return buildDashboardError('MISSING_PARAM', 'scopeId is required');
    }

    const simulations = await this.monteCarloService.listSimulations(scopeId, {
      subjectId,
      status,
      limit,
      offset,
    });

    return buildDashboardSuccess(simulations, {
      count: simulations.length,
    });
  }

  /**
   * Delete a simulation
   */
  private async deleteSimulation(
    payload: DashboardRequestPayload,
  ): Promise<DashboardActionResult> {
    const { simulationId } = payload.params as { simulationId: string };

    if (!simulationId) {
      return buildDashboardError('MISSING_PARAM', 'simulationId is required');
    }

    await this.monteCarloService.deleteSimulation(simulationId);

    return buildDashboardSuccess({ deleted: true });
  }

  /**
   * Get distribution templates
   */
  private getDistributionTemplates(): DashboardActionResult {
    const templates = this.monteCarloService.getDistributionTemplates();
    return buildDashboardSuccess(templates);
  }

  // ==========================================
  // Data Source Actions
  // ==========================================

  /**
   * Create a data source
   */
  private async createDataSource(
    payload: DashboardRequestPayload,
    _context: ExecutionContext,
  ): Promise<DashboardActionResult> {
    const params = (payload.params ?? {}) as unknown as CreateDataSourceParams;

    if (!params.scopeId) {
      return buildDashboardError('MISSING_PARAM', 'scopeId is required');
    }
    if (!params.name) {
      return buildDashboardError('MISSING_PARAM', 'name is required');
    }
    if (!params.sourceType) {
      return buildDashboardError('MISSING_PARAM', 'sourceType is required');
    }
    if (!params.config) {
      return buildDashboardError('MISSING_PARAM', 'config is required');
    }

    const source = await this.liveDataService.createDataSource(params);

    return buildDashboardSuccess(source, {
      action: 'create-source',
    });
  }

  /**
   * Get a data source by ID
   */
  private async getDataSource(
    payload: DashboardRequestPayload,
  ): Promise<DashboardActionResult> {
    const { dataSourceId } = payload.params as { dataSourceId: string };

    if (!dataSourceId) {
      return buildDashboardError('MISSING_PARAM', 'dataSourceId is required');
    }

    const source = await this.liveDataService.getDataSource(dataSourceId);

    if (!source) {
      return buildDashboardError(
        'NOT_FOUND',
        `Data source not found: ${dataSourceId}`,
      );
    }

    return buildDashboardSuccess(source);
  }

  /**
   * List data sources for a scope
   */
  private async listDataSources(
    payload: DashboardRequestPayload,
  ): Promise<DashboardActionResult> {
    const { scopeId, status, sourceType, limit, offset } = payload.params as {
      scopeId: string;
      status?: 'active' | 'paused' | 'error' | 'disabled';
      sourceType?: DataSourceType;
      limit?: number;
      offset?: number;
    };

    if (!scopeId) {
      return buildDashboardError('MISSING_PARAM', 'scopeId is required');
    }

    const sources = await this.liveDataService.listDataSources(scopeId, {
      status,
      sourceType,
      limit,
      offset,
    });

    return buildDashboardSuccess(sources, {
      count: sources.length,
    });
  }

  /**
   * Update a data source
   */
  private async updateDataSource(
    payload: DashboardRequestPayload,
  ): Promise<DashboardActionResult> {
    const { dataSourceId, ...updates } = payload.params as {
      dataSourceId: string;
      name?: string;
      description?: string;
      config?: Record<string, unknown>;
      schedule?: string;
      dimensionMapping?: Record<string, unknown>;
      subjectFilter?: Record<string, unknown>;
      autoReanalyze?: boolean;
      reanalyzeThreshold?: number;
      status?: 'active' | 'paused' | 'disabled';
    };

    if (!dataSourceId) {
      return buildDashboardError('MISSING_PARAM', 'dataSourceId is required');
    }

    const source = await this.liveDataService.updateDataSource(
      dataSourceId,
      updates as Parameters<typeof this.liveDataService.updateDataSource>[1],
    );

    return buildDashboardSuccess(source, {
      action: 'update-source',
    });
  }

  /**
   * Delete a data source
   */
  private async deleteDataSource(
    payload: DashboardRequestPayload,
  ): Promise<DashboardActionResult> {
    const { dataSourceId } = payload.params as { dataSourceId: string };

    if (!dataSourceId) {
      return buildDashboardError('MISSING_PARAM', 'dataSourceId is required');
    }

    await this.liveDataService.deleteDataSource(dataSourceId);

    return buildDashboardSuccess({ deleted: true });
  }

  /**
   * Manually fetch data from a source
   */
  private async fetchDataSource(
    payload: DashboardRequestPayload,
  ): Promise<DashboardActionResult> {
    const { dataSourceId } = payload.params as { dataSourceId: string };

    if (!dataSourceId) {
      return buildDashboardError('MISSING_PARAM', 'dataSourceId is required');
    }

    const result = await this.liveDataService.fetchData(dataSourceId);

    return buildDashboardSuccess(result, {
      action: 'fetch-source',
    });
  }

  /**
   * Get fetch history for a data source
   */
  private async getFetchHistory(
    payload: DashboardRequestPayload,
  ): Promise<DashboardActionResult> {
    const { dataSourceId, limit } = payload.params as {
      dataSourceId: string;
      limit?: number;
    };

    if (!dataSourceId) {
      return buildDashboardError('MISSING_PARAM', 'dataSourceId is required');
    }

    const history = await this.liveDataService.getFetchHistory(
      dataSourceId,
      limit,
    );

    return buildDashboardSuccess(history, {
      count: history.length,
    });
  }

  /**
   * Get health summary for a scope's data sources
   */
  private async getHealthSummary(
    payload: DashboardRequestPayload,
  ): Promise<DashboardActionResult> {
    const { scopeId } = payload.params as { scopeId: string };

    if (!scopeId) {
      return buildDashboardError('MISSING_PARAM', 'scopeId is required');
    }

    const summary = await this.liveDataService.getHealthSummary(scopeId);

    return buildDashboardSuccess(summary);
  }

  /**
   * Get data sources that are due for fetching
   */
  private async getDueSources(): Promise<DashboardActionResult> {
    const sources = await this.liveDataService.getSourcesDueForFetch();

    return buildDashboardSuccess(sources, {
      count: sources.length,
    });
  }
}
