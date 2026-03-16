import { Injectable, Logger } from '@nestjs/common';
import {
  TestTargetMirrorRepository,
  TestTargetMirror,
} from '../repositories/test-target-mirror.repository';
import { TargetRepository } from '../repositories/target.repository';
import { Target } from '../interfaces/target.interface';

/**
 * Test Target Mirror Service
 *
 * Manages T_ prefixed mirror targets for production targets (INV-11).
 * Part of the Test Data Injection Framework (Phase 3).
 *
 * Key responsibilities:
 * - Create and manage mirror relationships between production and test targets
 * - Auto-create T_ mirror when production target is accessed for testing
 * - Ensure 1:1 mapping between production and test symbols
 *
 * Database schema:
 * - prediction.test_target_mirrors maps real_target_id to test_target_id
 * - Both IDs reference prediction.targets table
 * - Test targets have symbols starting with 'T_'
 * - Trigger auto_create_test_mirror automatically creates mirrors on target insert
 */
@Injectable()
export class TestTargetMirrorService {
  private readonly logger = new Logger(TestTargetMirrorService.name);

  constructor(
    private readonly testTargetMirrorRepository: TestTargetMirrorRepository,
    private readonly targetRepository: TargetRepository,
  ) {}

  /**
   * Ensure a test mirror exists for a production target
   * Creates the mirror relationship if it doesn't exist
   *
   * Note: The database trigger should auto-create mirrors when targets are created,
   * but this method provides explicit control for testing scenarios.
   *
   * @param productionTargetId - The production target ID to mirror
   * @param _orgSlug - The organization slug (for context/logging, not stored)
   * @returns The test target (with T_ symbol)
   */
  async ensureMirror(
    productionTargetId: string,
    _orgSlug: string,
  ): Promise<Target> {
    this.logger.log(
      `Ensuring test mirror exists for production target ${productionTargetId}`,
    );

    // Get the production target
    const productionTarget =
      await this.targetRepository.findByIdOrThrow(productionTargetId);

    // Validate it's not already a test target
    if (productionTarget.symbol.startsWith('T_')) {
      throw new Error(
        `Target ${productionTargetId} is already a test target (symbol: ${productionTarget.symbol})`,
      );
    }

    // Check if mirror already exists in the mapping table
    const existingMirror =
      await this.testTargetMirrorRepository.findByRealTarget(
        productionTargetId,
      );

    if (existingMirror) {
      this.logger.debug(
        `Test mirror already exists for ${productionTarget.symbol}`,
      );
      // Get the test target entity using the test_target_id
      const testTarget = await this.targetRepository.findById(
        existingMirror.test_target_id,
      );
      if (!testTarget) {
        throw new Error(
          `Test target ${existingMirror.test_target_id} not found for mirror ${existingMirror.id}`,
        );
      }
      return testTarget;
    }

    // Generate test symbol
    const testSymbol = `T_${productionTarget.symbol}`;

    // Check if test target already exists (might have been created by trigger)
    let testTarget = await this.targetRepository.findBySymbol(
      productionTarget.universe_id,
      testSymbol,
    );

    // Create test target if it doesn't exist
    if (!testTarget) {
      this.logger.log(
        `Creating test target ${testSymbol} for ${productionTarget.symbol}`,
      );
      testTarget = await this.targetRepository.create({
        universe_id: productionTarget.universe_id,
        symbol: testSymbol,
        name: `TEST: ${productionTarget.name}`,
        target_type: productionTarget.target_type,
        context: `Test mirror of ${productionTarget.symbol}. ${productionTarget.context || ''}`,
        is_active: productionTarget.is_active,
        metadata: {
          is_test_mirror: true,
          real_target_id: productionTarget.id,
          real_symbol: productionTarget.symbol,
        },
      });
    }

    // Create the mirror mapping
    await this.testTargetMirrorRepository.create({
      real_target_id: productionTargetId,
      test_target_id: testTarget.id,
    });

    this.logger.log(
      `Created test mirror mapping: ${productionTarget.symbol} -> ${testSymbol}`,
    );

    return testTarget;
  }

  /**
   * Get the existing mirror for a production target
   * Returns null if no mirror exists
   *
   * @param productionTargetId - The production target ID
   * @returns The test target or null
   */
  async getMirror(productionTargetId: string): Promise<Target | null> {
    const mirror =
      await this.testTargetMirrorRepository.findByRealTarget(
        productionTargetId,
      );

    if (!mirror) {
      return null;
    }

    // Get the test target entity directly from the mirror's test_target_id
    return this.targetRepository.findById(mirror.test_target_id);
  }

  /**
   * Get the test symbol (T_ prefixed) for a production target
   * Returns null if no mirror exists
   *
   * @param productionTargetId - The production target ID
   * @returns The test symbol (e.g., 'T_AAPL') or null
   */
  async getTestSymbol(productionTargetId: string): Promise<string | null> {
    const testTarget = await this.getMirror(productionTargetId);
    return testTarget?.symbol ?? null;
  }

  /**
   * Get the production target for a test target ID
   * Reverse lookup from test target to production target
   *
   * @param testTargetId - The test target ID (not the symbol)
   * @returns The production target or null
   */
  async getProductionTarget(testTargetId: string): Promise<Target | null> {
    const mirror =
      await this.testTargetMirrorRepository.findByTestTarget(testTargetId);

    if (!mirror) {
      return null;
    }

    return this.targetRepository.findById(mirror.real_target_id);
  }

  /**
   * Get the production target by test symbol
   * Looks up the test target by symbol first, then finds the mirror
   *
   * @param universeId - The universe ID to search in
   * @param testSymbol - The test symbol (e.g., 'T_AAPL')
   * @returns The production target or null
   */
  async getProductionTargetBySymbol(
    universeId: string,
    testSymbol: string,
  ): Promise<Target | null> {
    // Validate test symbol format
    if (!testSymbol.startsWith('T_')) {
      throw new Error(
        `Invalid test symbol: ${testSymbol} (must start with T_)`,
      );
    }

    // Find the test target by symbol
    const testTarget = await this.targetRepository.findBySymbol(
      universeId,
      testSymbol,
    );

    if (!testTarget) {
      return null;
    }

    // Look up the mirror and get the production target
    return this.getProductionTarget(testTarget.id);
  }

  /**
   * List all test mirror mappings
   *
   * @returns Array of mirror mappings with both production and test targets
   */
  async listMirrors(): Promise<
    Array<{
      mirror: TestTargetMirror;
      productionTarget: Target;
      testTarget: Target | null;
    }>
  > {
    this.logger.log('Listing all test mirrors');

    const mirrors = await this.testTargetMirrorRepository.findAll();

    // Fetch both production and test targets for each mirror
    const results = await Promise.all(
      mirrors.map(async (mirror: TestTargetMirror) => {
        const productionTarget = await this.targetRepository.findById(
          mirror.real_target_id,
        );

        if (!productionTarget) {
          this.logger.warn(
            `Production target ${mirror.real_target_id} not found for mirror ${mirror.id}`,
          );
          return null;
        }

        const testTarget = await this.targetRepository.findById(
          mirror.test_target_id,
        );

        return {
          mirror,
          productionTarget,
          testTarget,
        };
      }),
    );

    // Filter out null results (where production target was not found)
    return results.filter(
      (result): result is NonNullable<typeof result> => result !== null,
    );
  }

  /**
   * Delete a test mirror mapping
   * Note: This only deletes the mapping, not the actual test target
   *
   * @param mirrorId - The mirror mapping ID
   */
  async deleteMirror(mirrorId: string): Promise<void> {
    this.logger.log(`Deleting test mirror mapping: ${mirrorId}`);
    await this.testTargetMirrorRepository.delete(mirrorId);
  }

  /**
   * Check if a target is a test mirror (symbol starts with T_)
   *
   * @param target - The target to check
   * @returns True if the target is a test mirror
   */
  isTestMirror(target: Target): boolean {
    return target.symbol.startsWith('T_');
  }

  /**
   * Get the production symbol from a test symbol
   * Simply removes the T_ prefix
   *
   * @param testSymbol - The test symbol (e.g., 'T_AAPL')
   * @returns The production symbol (e.g., 'AAPL')
   */
  getProductionSymbol(testSymbol: string): string {
    if (!testSymbol.startsWith('T_')) {
      throw new Error(
        `Invalid test symbol: ${testSymbol} (must start with T_)`,
      );
    }
    return testSymbol.substring(2);
  }
}
