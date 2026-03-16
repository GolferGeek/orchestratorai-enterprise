import { Inject, Injectable, Logger } from '@nestjs/common';
import { DATABASE_SERVICE, DatabaseService } from '@/database';
import { v4 as uuidv4 } from 'uuid';

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
 * Test target mirror entity - maps real targets to test targets
 * Based on prediction.test_target_mirrors table
 *
 * Schema matches migration 20260111000010:
 * - real_target_id: References the production target
 * - test_target_id: References the test mirror target (symbol LIKE 'T_%')
 */
export interface TestTargetMirror {
  id: string;
  real_target_id: string;
  test_target_id: string;
  created_at: string;
}

/**
 * Data for creating a new test target mirror
 */
export interface CreateTestTargetMirrorData {
  id?: string;
  real_target_id: string;
  test_target_id: string;
}

/**
 * Repository for test target mirrors (prediction.test_target_mirrors)
 * Part of the Test Data Injection Framework (Phase 3)
 *
 * Maps real targets to test targets for data isolation.
 * Test target symbols start with 'T_' prefix.
 */
@Injectable()
export class TestTargetMirrorRepository {
  private readonly logger = new Logger(TestTargetMirrorRepository.name);
  private readonly schema = 'prediction';
  private readonly table = 'test_target_mirrors';

  constructor(@Inject(DATABASE_SERVICE) private readonly db: DatabaseService) {}

  /**
   * Find a test target mirror by ID
   */
  async findById(id: string): Promise<TestTargetMirror | null> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('id', id)
      .single()) as SupabaseSelectResponse<TestTargetMirror>;

    if (error && error.code !== 'PGRST116') {
      this.logger.error(`Failed to fetch test target mirror: ${error.message}`);
      throw new Error(`Failed to fetch test target mirror: ${error.message}`);
    }

    return data;
  }

  /**
   * Find all test target mirrors
   */
  async findAll(): Promise<TestTargetMirror[]> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .select('*')
      .order('created_at', {
        ascending: false,
      })) as SupabaseSelectListResponse<TestTargetMirror>;

    if (error) {
      this.logger.error(
        `Failed to fetch test target mirrors: ${error.message}`,
      );
      throw new Error(`Failed to fetch test target mirrors: ${error.message}`);
    }

    return data ?? [];
  }

  /**
   * Find a test target mirror by real (production) target ID
   */
  async findByRealTarget(
    realTargetId: string,
  ): Promise<TestTargetMirror | null> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('real_target_id', realTargetId)
      .single()) as SupabaseSelectResponse<TestTargetMirror>;

    if (error && error.code !== 'PGRST116') {
      this.logger.error(
        `Failed to fetch test target mirror by real target: ${error.message}`,
      );
      throw new Error(
        `Failed to fetch test target mirror by real target: ${error.message}`,
      );
    }

    return data;
  }

  /**
   * Find a test target mirror by test target ID
   */
  async findByTestTarget(
    testTargetId: string,
  ): Promise<TestTargetMirror | null> {
    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .select('*')
      .eq('test_target_id', testTargetId)
      .single()) as SupabaseSelectResponse<TestTargetMirror>;

    if (error && error.code !== 'PGRST116') {
      this.logger.error(
        `Failed to fetch test target mirror by test target: ${error.message}`,
      );
      throw new Error(
        `Failed to fetch test target mirror by test target: ${error.message}`,
      );
    }

    return data;
  }

  /**
   * Create a new test target mirror
   */
  async create(
    mirrorData: CreateTestTargetMirrorData,
  ): Promise<TestTargetMirror> {
    const dataToInsert = {
      ...mirrorData,
      id: mirrorData.id ?? uuidv4(),
    };

    const { data, error } = (await this.db
      .from(this.schema, this.table)
      .insert(dataToInsert)
      .select()
      .single()) as SupabaseSelectResponse<TestTargetMirror>;

    if (error) {
      this.logger.error(
        `Failed to create test target mirror: ${error.message}`,
      );
      throw new Error(`Failed to create test target mirror: ${error.message}`);
    }

    if (!data) {
      throw new Error('Create succeeded but no test target mirror returned');
    }

    this.logger.log(
      `Created test target mirror: ${data.id} (${data.real_target_id} -> ${data.test_target_id})`,
    );
    return data;
  }

  /**
   * Delete a test target mirror
   */
  async delete(id: string): Promise<void> {
    const { error } = await this.db
      .from(this.schema, this.table)
      .delete()
      .eq('id', id);

    if (error) {
      this.logger.error(
        `Failed to delete test target mirror: ${error.message}`,
      );
      throw new Error(`Failed to delete test target mirror: ${error.message}`);
    }

    this.logger.log(`Deleted test target mirror: ${id}`);
  }

  /**
   * Get the test target ID for a real target
   * Returns null if no mirror exists
   * @param realTargetId - The real target ID
   * @returns The test target ID or null
   */
  async getTestTargetId(realTargetId: string): Promise<string | null> {
    const mirror = await this.findByRealTarget(realTargetId);
    return mirror?.test_target_id ?? null;
  }

  /**
   * Get the real target ID for a test target
   * Returns null if no mirror exists
   * @param testTargetId - The test target ID
   * @returns The real target ID or null
   */
  async getRealTargetId(testTargetId: string): Promise<string | null> {
    const mirror = await this.findByTestTarget(testTargetId);
    return mirror?.real_target_id ?? null;
  }
}
