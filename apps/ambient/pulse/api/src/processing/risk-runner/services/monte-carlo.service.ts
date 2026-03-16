/**
 * Monte Carlo Simulation Service
 *
 * Runs probabilistic simulations for risk distribution analysis.
 * Provides Value at Risk (VaR), Conditional VaR, and distribution metrics.
 */

import { Inject, Injectable, Logger } from '@nestjs/common';
import { DATABASE_SERVICE, DatabaseService } from '@/database';
import {
  asArray,
  asPostgrestResult,
  asRecord,
  isRecord,
} from '../utils/safe-access';

// Distribution types supported
export type DistributionType = 'normal' | 'uniform' | 'beta' | 'triangular';

// Dimension distribution configuration
export interface DimensionDistribution {
  distribution: DistributionType;
  mean?: number;
  stdDev?: number;
  min?: number;
  max?: number;
  alpha?: number; // For beta distribution
  beta?: number; // For beta distribution
}

// Simulation parameters
export interface SimulationParameters {
  dimensionDistributions: Record<string, DimensionDistribution>;
  confidenceLevel?: number; // Default 0.95
  seed?: number; // Optional seed for reproducibility
}

// Histogram bin
export interface HistogramBin {
  bin: number;
  count: number;
}

// Simulation results
export interface SimulationResults {
  mean: number;
  median: number;
  stdDev: number;
  variance: number;
  percentile5: number;
  percentile25: number;
  percentile75: number;
  percentile95: number;
  percentile99: number;
  var95: number; // Value at Risk at 95%
  var99: number; // Value at Risk at 99%
  cvar95: number; // Conditional VaR at 95%
  cvar99: number; // Conditional VaR at 99%
  skewness: number;
  kurtosis: number;
  distribution: HistogramBin[];
  executionTimeMs: number;
}

// Full simulation record
export interface Simulation {
  id: string;
  scopeId: string;
  subjectId: string | null;
  name: string;
  description: string | null;
  iterations: number;
  parameters: SimulationParameters;
  results: SimulationResults | null;
  status: 'pending' | 'running' | 'completed' | 'failed';
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

@Injectable()
export class MonteCarloService {
  private readonly logger = new Logger(MonteCarloService.name);

  constructor(@Inject(DATABASE_SERVICE) private readonly db: DatabaseService) {}

  /**
   * Run a Monte Carlo simulation
   */
  async runSimulation(
    scopeId: string,
    name: string,
    parameters: SimulationParameters,
    iterations: number = 10000,
    subjectId?: string,
    description?: string,
  ): Promise<Simulation> {
    this.logger.debug(
      `[MONTE-CARLO] Running simulation "${name}" with ${iterations} iterations`,
    );

    // Create simulation record
    const createResult = asPostgrestResult(
      await this.db
        .from('risk', 'simulations')
        .insert({
          scope_id: scopeId,
          subject_id: subjectId || null,
          name,
          description: description || null,
          iterations,
          parameters,
          status: 'running',
          started_at: new Date().toISOString(),
        })
        .select()
        .single(),
    );
    const simulation = asRecord(createResult.data);

    if (createResult.error?.message || !simulation) {
      throw new Error(
        `Failed to create simulation: ${createResult.error?.message || 'Unknown error'}`,
      );
    }

    try {
      // Run the actual simulation
      const startTime = Date.now();
      const results = this.executeSimulation(parameters, iterations);
      const executionTimeMs = Date.now() - startTime;

      // Add execution time to results
      results.executionTimeMs = executionTimeMs;

      // Update simulation with results
      const updateResult = asPostgrestResult(
        await this.db
          .from('risk', 'simulations')
          .update({
            results,
            status: 'completed',
            completed_at: new Date().toISOString(),
          })
          .eq('id', simulation['id'])
          .select()
          .single(),
      );

      if (updateResult.error?.message) {
        throw new Error(
          `Failed to update simulation: ${updateResult.error.message}`,
        );
      }

      this.logger.debug(
        `[MONTE-CARLO] Simulation completed in ${executionTimeMs}ms`,
      );

      const updatedRow = asRecord(updateResult.data);
      if (!updatedRow) {
        throw new Error('Failed to update simulation: no data returned');
      }
      return this.mapSimulationFromDb(updatedRow);
    } catch (error) {
      // Update simulation with error
      await this.db
        .from('risk', 'simulations')
        .update({
          status: 'failed',
          error_message:
            error instanceof Error ? error.message : 'Unknown error',
          completed_at: new Date().toISOString(),
        })
        .eq('id', simulation['id']);

      throw error;
    }
  }

  /**
   * Execute the Monte Carlo simulation algorithm
   */
  private executeSimulation(
    parameters: SimulationParameters,
    iterations: number,
  ): SimulationResults {
    const dimensionSlugs = Object.keys(parameters.dimensionDistributions);
    const scores: number[] = [];

    // Run iterations
    for (let i = 0; i < iterations; i++) {
      // Sample each dimension
      let weightedSum = 0;
      let totalWeight = 0;

      for (const slug of dimensionSlugs) {
        const dist = parameters.dimensionDistributions[slug];
        if (!dist) continue;

        const sample = this.sampleDistribution(dist);
        const weight = 1; // Could be made configurable per dimension
        weightedSum += sample * weight;
        totalWeight += weight;
      }

      // Calculate overall score for this iteration
      const score = totalWeight > 0 ? weightedSum / totalWeight : 0;
      scores.push(Math.max(0, Math.min(1, score))); // Clamp to [0, 1]
    }

    // Sort for percentile calculations
    scores.sort((a, b) => a - b);

    // Calculate statistics
    const mean = this.calculateMean(scores);
    const median = this.calculatePercentile(scores, 0.5);
    const variance = this.calculateVariance(scores, mean);
    const stdDev = Math.sqrt(variance);

    const percentile5 = this.calculatePercentile(scores, 0.05);
    const percentile25 = this.calculatePercentile(scores, 0.25);
    const percentile75 = this.calculatePercentile(scores, 0.75);
    const percentile95 = this.calculatePercentile(scores, 0.95);
    const percentile99 = this.calculatePercentile(scores, 0.99);

    // VaR: Value at Risk (upper tail for risk scores)
    const var95 = percentile95;
    const var99 = percentile99;

    // CVaR: Conditional VaR (expected shortfall)
    const cvar95 = this.calculateConditionalVar(scores, 0.95);
    const cvar99 = this.calculateConditionalVar(scores, 0.99);

    // Higher moments
    const skewness = this.calculateSkewness(scores, mean, stdDev);
    const kurtosis = this.calculateKurtosis(scores, mean, stdDev);

    // Generate histogram
    const distribution = this.generateHistogram(scores, 20);

    return {
      mean,
      median,
      stdDev,
      variance,
      percentile5,
      percentile25,
      percentile75,
      percentile95,
      percentile99,
      var95,
      var99,
      cvar95,
      cvar99,
      skewness,
      kurtosis,
      distribution,
      executionTimeMs: 0, // Will be set by caller
    };
  }

  /**
   * Sample from a distribution
   */
  private sampleDistribution(dist: DimensionDistribution): number {
    switch (dist.distribution) {
      case 'normal':
        return this.sampleNormal(dist.mean ?? 0.5, dist.stdDev ?? 0.15);
      case 'uniform':
        return this.sampleUniform(dist.min ?? 0, dist.max ?? 1);
      case 'beta':
        return this.sampleBeta(dist.alpha ?? 2, dist.beta ?? 5);
      case 'triangular':
        return this.sampleTriangular(
          dist.min ?? 0,
          dist.max ?? 1,
          dist.mean ?? 0.5,
        );
      default:
        return this.sampleUniform(0, 1);
    }
  }

  /**
   * Sample from normal distribution using Box-Muller transform
   */
  private sampleNormal(mean: number, stdDev: number): number {
    const u1 = Math.random();
    const u2 = Math.random();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return mean + stdDev * z;
  }

  /**
   * Sample from uniform distribution
   */
  private sampleUniform(min: number, max: number): number {
    return min + Math.random() * (max - min);
  }

  /**
   * Sample from beta distribution using Johnk's algorithm
   */
  private sampleBeta(alpha: number, beta: number): number {
    // Use gamma sampling for beta distribution
    const gammaA = this.sampleGamma(alpha);
    const gammaB = this.sampleGamma(beta);
    return gammaA / (gammaA + gammaB);
  }

  /**
   * Sample from gamma distribution (for beta sampling)
   */
  private sampleGamma(shape: number): number {
    // Marsaglia and Tsang's method
    if (shape < 1) {
      return this.sampleGamma(1 + shape) * Math.pow(Math.random(), 1 / shape);
    }

    const d = shape - 1 / 3;
    const c = 1 / Math.sqrt(9 * d);

    while (true) {
      let x: number, v: number;
      do {
        x = this.sampleNormal(0, 1);
        v = 1 + c * x;
      } while (v <= 0);

      v = v * v * v;
      const u = Math.random();

      if (u < 1 - 0.0331 * (x * x) * (x * x)) {
        return d * v;
      }

      if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) {
        return d * v;
      }
    }
  }

  /**
   * Sample from triangular distribution
   */
  private sampleTriangular(min: number, max: number, mode: number): number {
    const u = Math.random();
    const fc = (mode - min) / (max - min);

    if (u < fc) {
      return min + Math.sqrt(u * (max - min) * (mode - min));
    } else {
      return max - Math.sqrt((1 - u) * (max - min) * (max - mode));
    }
  }

  /**
   * Calculate mean
   */
  private calculateMean(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((sum, v) => sum + v, 0) / values.length;
  }

  /**
   * Calculate variance
   */
  private calculateVariance(values: number[], mean: number): number {
    if (values.length <= 1) return 0;
    const sumSq = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0);
    return sumSq / (values.length - 1);
  }

  /**
   * Calculate percentile (assumes sorted array)
   */
  private calculatePercentile(sortedValues: number[], p: number): number {
    if (sortedValues.length === 0) return 0;
    const index = p * (sortedValues.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);

    if (lower === upper) {
      return sortedValues[lower] ?? 0;
    }

    const fraction = index - lower;
    const lowerVal = sortedValues[lower] ?? 0;
    const upperVal = sortedValues[upper] ?? 0;
    return lowerVal + fraction * (upperVal - lowerVal);
  }

  /**
   * Calculate Conditional VaR (Expected Shortfall)
   */
  private calculateConditionalVar(sortedValues: number[], p: number): number {
    const threshold = this.calculatePercentile(sortedValues, p);
    const tailValues = sortedValues.filter((v) => v >= threshold);
    return this.calculateMean(tailValues);
  }

  /**
   * Calculate skewness
   */
  private calculateSkewness(
    values: number[],
    mean: number,
    stdDev: number,
  ): number {
    if (values.length < 3 || stdDev === 0) return 0;
    const n = values.length;
    const sum = values.reduce(
      (acc, v) => acc + Math.pow((v - mean) / stdDev, 3),
      0,
    );
    return (n / ((n - 1) * (n - 2))) * sum;
  }

  /**
   * Calculate excess kurtosis
   */
  private calculateKurtosis(
    values: number[],
    mean: number,
    stdDev: number,
  ): number {
    if (values.length < 4 || stdDev === 0) return 0;
    const n = values.length;
    const sum = values.reduce(
      (acc, v) => acc + Math.pow((v - mean) / stdDev, 4),
      0,
    );
    const kurtosis =
      ((n * (n + 1)) / ((n - 1) * (n - 2) * (n - 3))) * sum -
      (3 * (n - 1) * (n - 1)) / ((n - 2) * (n - 3));
    return kurtosis;
  }

  /**
   * Generate histogram bins
   */
  private generateHistogram(values: number[], numBins: number): HistogramBin[] {
    if (values.length === 0) return [];

    const min = Math.min(...values);
    const max = Math.max(...values);
    const binWidth = (max - min) / numBins;

    const bins: HistogramBin[] = [];
    for (let i = 0; i < numBins; i++) {
      bins.push({
        bin: min + (i + 0.5) * binWidth,
        count: 0,
      });
    }

    for (const value of values) {
      const binIndex = Math.min(
        Math.floor((value - min) / binWidth),
        numBins - 1,
      );
      const bin = bins[binIndex];
      if (bin) {
        bin.count++;
      }
    }

    return bins;
  }

  /**
   * Get a simulation by ID
   */
  async getSimulation(simulationId: string): Promise<Simulation | null> {
    const result = asPostgrestResult(
      await this.db
        .from('risk', 'simulations')
        .select('*')
        .eq('id', simulationId)
        .single(),
    );
    const row = asRecord(result.data);

    if (result.error?.message || !row) {
      return null;
    }

    return this.mapSimulationFromDb(row);
  }

  /**
   * List simulations for a scope
   */
  async listSimulations(
    scopeId: string,
    options?: {
      subjectId?: string;
      status?: Simulation['status'];
      limit?: number;
      offset?: number;
    },
  ): Promise<Simulation[]> {
    let query = this.db
      .from('risk', 'simulations')
      .select('*')
      .eq('scope_id', scopeId)
      .order('created_at', { ascending: false });

    if (options?.subjectId) {
      query = query.eq('subject_id', options.subjectId);
    }
    if (options?.status) {
      query = query.eq('status', options.status);
    }
    if (options?.limit) {
      query = query.limit(options.limit);
    }
    if (options?.offset) {
      query = query.range(
        options.offset,
        options.offset + (options.limit || 10) - 1,
      );
    }

    const result = asPostgrestResult(await query);

    if (result.error?.message) {
      throw new Error(`Failed to list simulations: ${result.error.message}`);
    }

    return (asArray(result.data) ?? [])
      .filter(isRecord)
      .map((s) => this.mapSimulationFromDb(s));
  }

  /**
   * Delete a simulation
   */
  async deleteSimulation(simulationId: string): Promise<void> {
    const { error } = await this.db
      .from('risk', 'simulations')
      .delete()
      .eq('id', simulationId);

    if (error) {
      throw new Error(`Failed to delete simulation: ${error.message}`);
    }
  }

  /**
   * Get distribution templates
   */
  getDistributionTemplates(): Record<string, DimensionDistribution> {
    return {
      'normal-low': { distribution: 'normal', mean: 0.3, stdDev: 0.1 },
      'normal-medium': { distribution: 'normal', mean: 0.5, stdDev: 0.15 },
      'normal-high': { distribution: 'normal', mean: 0.7, stdDev: 0.1 },
      'uniform-full': { distribution: 'uniform', min: 0, max: 1 },
      'uniform-narrow': { distribution: 'uniform', min: 0.3, max: 0.7 },
      'beta-left-skewed': { distribution: 'beta', alpha: 5, beta: 2 },
      'beta-right-skewed': { distribution: 'beta', alpha: 2, beta: 5 },
      'beta-symmetric': { distribution: 'beta', alpha: 2, beta: 2 },
      'triangular-conservative': {
        distribution: 'triangular',
        min: 0.2,
        max: 0.8,
        mean: 0.4,
      },
      'triangular-aggressive': {
        distribution: 'triangular',
        min: 0.2,
        max: 0.8,
        mean: 0.6,
      },
    };
  }

  /**
   * Map database record to domain object
   */
  private mapSimulationFromDb(row: Record<string, unknown>): Simulation {
    return {
      id: row.id as string,
      scopeId: row.scope_id as string,
      subjectId: row.subject_id as string | null,
      name: row.name as string,
      description: row.description as string | null,
      iterations: row.iterations as number,
      parameters: row.parameters as SimulationParameters,
      results: row.results as SimulationResults | null,
      status: row.status as Simulation['status'],
      errorMessage: row.error_message as string | null,
      startedAt: row.started_at as string | null,
      completedAt: row.completed_at as string | null,
      createdAt: row.created_at as string,
    };
  }
}
